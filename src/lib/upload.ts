// =============================================================================
//  NightGram 2.24 — reliable media upload facade
//  - image preparation / optional original quality
//  - real progress through authenticated binary uploads
//  - cancellation and safe idempotent retries after connection loss
//  - lightweight thumbnails for image/video messages and posts
// =============================================================================

import { prepareMediaForUpload, type MediaFolder } from "@/lib/mediaProcessing";
import { getStoredAccessToken } from "@/lib/api";

export type UploadFolder = MediaFolder;

export type UploadedMedia = {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  originalSize: number;
  uploadedSize: number;
  optimized: boolean;
  type: "image" | "video" | "file";
};

export type UploadPhase = "processing" | "waiting-network" | "uploading" | "retrying" | "completed";

export type UploadProgress = {
  phase: UploadPhase;
  loaded: number;
  total: number;
  percent: number;
  attempt: number;
};

export type UploadOptions = {
  preserveOriginal?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  maxRetries?: number;
};

type UploadHttpError = Error & { status?: number; retryable?: boolean };

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://nightgram-production-0ceb.up.railway.app/api").replace(/\/$/, "");

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  heic: "image/heic", heif: "image/heif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  m4a: "audio/mp4", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav",
  pdf: "application/pdf", txt: "text/plain", zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function effectiveMime(file: File): string {
  const declared = file.type?.toLowerCase().split(";")[0].trim();
  if (declared && declared !== "application/octet-stream") return declared === "application/x-zip-compressed" ? "application/zip" : declared;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return MIME_BY_EXTENSION[extension] || "application/octet-stream";
}

function abortError(): DOMException {
  return new DOMException("Загрузка отменена", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function buildUploadId(prefix = "media"): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function emitProgress(
  options: UploadOptions,
  phase: UploadPhase,
  loaded: number,
  total: number,
  attempt: number,
): void {
  const safeTotal = Math.max(1, total);
  options.onProgress?.({
    phase,
    loaded: Math.max(0, loaded),
    total: Math.max(0, total),
    percent: Math.max(0, Math.min(100, Math.round((loaded / safeTotal) * 100))),
    attempt,
  });
}

function waitForOnline(signal?: AbortSignal): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("online", onOnline);
      signal?.removeEventListener("abort", onAbort);
    };
    const onOnline = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    window.addEventListener("online", onOnline, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function uploadBinaryOnce(
  file: File,
  folder: UploadFolder,
  uploadId: string,
  options: UploadOptions,
  attempt: number,
  onBytes: (loaded: number, total: number) => void,
): Promise<string> {
  if (options.signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      xhr.abort();
      finish(() => reject(abortError()));
    };

    xhr.open("POST", `${API_URL}/upload/binary`);
    xhr.timeout = 120_000;
    xhr.responseType = "json";
    xhr.setRequestHeader("Content-Type", effectiveMime(file));
    xhr.setRequestHeader("X-Upload-Folder", folder);
    xhr.setRequestHeader("X-Upload-Id", uploadId);
    const token = getStoredAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : file.size;
      onBytes(event.loaded, total);
    };
    xhr.onerror = () => finish(() => {
      const error = new Error("Сеть недоступна во время загрузки") as UploadHttpError;
      error.retryable = true;
      reject(error);
    });
    xhr.ontimeout = () => finish(() => {
      const error = new Error("Сервер слишком долго принимает файл") as UploadHttpError;
      error.retryable = true;
      reject(error);
    });
    xhr.onabort = () => finish(() => reject(abortError()));
    xhr.onload = () => finish(() => {
      const payload = xhr.response || (() => {
        try { return JSON.parse(xhr.responseText || "{}"); } catch { return {}; }
      })();
      if (xhr.status >= 200 && xhr.status < 300 && payload?.url) {
        onBytes(file.size, file.size);
        resolve(String(payload.url));
        return;
      }
      const error = new Error(payload?.message || payload?.error || `Ошибка загрузки (${xhr.status})`) as UploadHttpError;
      error.status = xhr.status;
      error.retryable = xhr.status === 0 || xhr.status === 408 || xhr.status === 429 || xhr.status >= 500;
      reject(error);
    });

    options.signal?.addEventListener("abort", onAbort, { once: true });
    onBytes(0, file.size);
    xhr.send(file);
  });
}

async function uploadWithRetry(
  file: File,
  folder: UploadFolder,
  uploadId: string,
  options: UploadOptions,
  reportBytes: (loaded: number, total: number, attempt: number, phase: UploadPhase) => void,
): Promise<string> {
  const maxRetries = Math.max(0, Math.min(4, options.maxRetries ?? 2));
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    if (options.signal?.aborted) throw abortError();
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      reportBytes(0, file.size, attempt, "waiting-network");
      await waitForOnline(options.signal);
    }

    try {
      return await uploadBinaryOnce(file, folder, uploadId, options, attempt, (loaded, total) => {
        reportBytes(loaded, total, attempt, "uploading");
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
      const retryable = Boolean((error as UploadHttpError)?.retryable);
      if (!retryable || attempt > maxRetries) break;
      reportBytes(0, file.size, attempt + 1, "retrying");
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => options.signal?.removeEventListener("abort", onAbort);
        const timer = window.setTimeout(() => {
          cleanup();
          resolve();
        }, attempt === 1 ? 700 : 1600);
        const onAbort = () => {
          window.clearTimeout(timer);
          cleanup();
          reject(abortError());
        };
        options.signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Не удалось загрузить файл");
}

export async function uploadMediaDetailed(
  file: File,
  folder: UploadFolder = "posts",
  options: UploadOptions = {},
): Promise<UploadedMedia> {
  if (options.signal?.aborted) throw abortError();
  emitProgress(options, "processing", 0, file.size, 1);
  const prepared = await prepareMediaForUpload(file, folder, { preserveOriginal: options.preserveOriginal });
  if (options.signal?.aborted) throw abortError();

  const mainSize = prepared.file.size;
  const thumbnailSize = prepared.thumbnailFile?.size || 0;
  const combinedTotal = Math.max(1, mainSize + thumbnailSize);
  let mainLoaded = 0;
  let thumbnailLoaded = 0;

  const reportCombined = (phase: UploadPhase, attempt: number) => {
    emitProgress(options, phase, mainLoaded + thumbnailLoaded, combinedTotal, attempt);
  };

  const baseId = buildUploadId(prepared.type);
  const url = await uploadWithRetry(
    prepared.file,
    folder,
    baseId,
    options,
    (loaded, _total, attempt, phase) => {
      mainLoaded = Math.min(mainSize, loaded);
      reportCombined(phase, attempt);
    },
  );

  let thumbnailUrl: string | undefined;
  if (prepared.thumbnailFile) {
    thumbnailUrl = await uploadWithRetry(
      prepared.thumbnailFile,
      folder,
      `${baseId}-thumb`,
      options,
      (loaded, _total, attempt, phase) => {
        thumbnailLoaded = Math.min(thumbnailSize, loaded);
        reportCombined(phase, attempt);
      },
    );
  }

  mainLoaded = mainSize;
  thumbnailLoaded = thumbnailSize;
  reportCombined("completed", 1);
  return {
    url,
    thumbnailUrl,
    width: prepared.width,
    height: prepared.height,
    durationSec: prepared.durationSec,
    originalSize: prepared.originalSize,
    uploadedSize: prepared.uploadSize,
    optimized: prepared.optimized,
    type: prepared.type,
  };
}

export async function uploadMedia(file: File, folder: UploadFolder = "posts", options: UploadOptions = {}): Promise<string> {
  return (await uploadMediaDetailed(file, folder, options)).url;
}
