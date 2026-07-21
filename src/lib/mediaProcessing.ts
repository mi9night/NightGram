export type MediaFolder = "avatars" | "posts" | "messages";

export type PreparedMedia = {
  file: File;
  thumbnailFile?: File;
  type: "image" | "video" | "file";
  width?: number;
  height?: number;
  durationSec?: number;
  originalSize: number;
  uploadSize: number;
  optimized: boolean;
};

type ImageDimensions = { width: number; height: number };

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"]);
const MAX_IMAGE_EDGE: Record<MediaFolder, number> = {
  avatars: 1024,
  posts: 2048,
  messages: 2048,
};

function safeStem(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return stem.slice(0, 80) || "nightgram-media";
}

function canvasToFile(canvas: HTMLCanvasElement, name: string, quality: number): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Не удалось обработать изображение"));
        return;
      }
      resolve(new File([blob], `${safeStem(name)}.webp`, { type: "image/webp", lastModified: Date.now() }));
    }, "image/webp", quality);
  });
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; dimensions: ImageDimensions; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      dimensions: { width: bitmap.width, height: bitmap.height },
      close: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Изображение повреждено"));
    image.src = url;
  });
  return {
    source: image,
    dimensions: { width: image.naturalWidth, height: image.naturalHeight },
    close: () => URL.revokeObjectURL(url),
  };
}

function fitDimensions(width: number, height: number, maxEdge: number): ImageDimensions {
  if (width <= maxEdge && height <= maxEdge) return { width, height };
  const ratio = Math.min(maxEdge / width, maxEdge / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

async function renderImageFile(
  file: File,
  maxEdge: number,
  quality: number,
  suffix = "",
): Promise<{ file: File; width: number; height: number }> {
  const decoded = await decodeImage(file);
  try {
    const target = fitDimensions(decoded.dimensions.width, decoded.dimensions.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas недоступен");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, target.width, target.height);
    const output = await canvasToFile(canvas, `${safeStem(file.name)}${suffix}`, quality);
    return { file: output, ...target };
  } finally {
    decoded.close();
  }
}

async function readVideo(file: File): Promise<{ video: HTMLVideoElement; url: string; durationSec: number; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Видео долго обрабатывается")), 12_000);
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Видео повреждено или не поддерживается"));
    };
    video.src = url;
  });
  return {
    video,
    url,
    durationSec: Number.isFinite(video.duration) ? Math.max(0, Math.round(video.duration)) : 0,
    width: video.videoWidth || 0,
    height: video.videoHeight || 0,
  };
}

async function createVideoThumbnail(file: File): Promise<{ file: File; width: number; height: number; durationSec: number } | null> {
  const metadata = await readVideo(file);
  try {
    const seekTo = metadata.durationSec > 2 ? Math.min(1, metadata.durationSec / 3) : 0;
    if (seekTo > 0) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 2500);
        videoSeek(metadata.video, seekTo, () => {
          window.clearTimeout(timer);
          resolve();
        });
      });
    }
    if (!metadata.width || !metadata.height) return null;
    const target = fitDimensions(metadata.width, metadata.height, 640);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(metadata.video, 0, 0, target.width, target.height);
    const thumbnail = await canvasToFile(canvas, `${safeStem(file.name)}-thumb`, 0.72);
    return { file: thumbnail, ...target, durationSec: metadata.durationSec };
  } finally {
    metadata.video.removeAttribute("src");
    metadata.video.load();
    URL.revokeObjectURL(metadata.url);
  }
}

function videoSeek(video: HTMLVideoElement, time: number, done: () => void): void {
  video.onseeked = () => done();
  try {
    video.currentTime = time;
  } catch {
    done();
  }
}

export async function prepareMediaForUpload(
  file: File,
  folder: MediaFolder,
  options: { preserveOriginal?: boolean } = {},
): Promise<PreparedMedia> {
  const originalSize = file.size;

  if (IMAGE_MIME.has(file.type) && file.type !== "image/gif") {
    try {
      if (options.preserveOriginal) {
        const decoded = await decodeImage(file);
        const dimensions = decoded.dimensions;
        decoded.close();
        const thumbnail = folder === "avatars"
          ? undefined
          : await renderImageFile(file, 480, 0.68, "-thumb");
        return {
          file,
          thumbnailFile: thumbnail?.file,
          type: "image",
          width: dimensions.width,
          height: dimensions.height,
          originalSize,
          uploadSize: file.size,
          optimized: false,
        };
      }

      const main = await renderImageFile(file, MAX_IMAGE_EDGE[folder], folder === "avatars" ? 0.86 : 0.82);
      const thumbnail = folder === "avatars"
        ? undefined
        : await renderImageFile(file, 480, 0.68, "-thumb");
      // Never replace a compact source with a materially larger conversion.
      const useConverted = main.file.size < file.size * 1.08 || main.width < 2048 || main.height < 2048;
      const uploadFile = useConverted ? main.file : file;
      return {
        file: uploadFile,
        thumbnailFile: thumbnail?.file,
        type: "image",
        width: main.width,
        height: main.height,
        originalSize,
        uploadSize: uploadFile.size,
        optimized: uploadFile !== file,
      };
    } catch {
      return { file, type: "image", originalSize, uploadSize: file.size, optimized: false };
    }
  }

  if (file.type.startsWith("video/")) {
    try {
      const thumbnail = await createVideoThumbnail(file);
      return {
        file,
        thumbnailFile: thumbnail?.file,
        type: "video",
        width: thumbnail?.width,
        height: thumbnail?.height,
        durationSec: thumbnail?.durationSec,
        originalSize,
        uploadSize: file.size,
        optimized: false,
      };
    } catch {
      return { file, type: "video", originalSize, uploadSize: file.size, optimized: false };
    }
  }

  return { file, type: "file", originalSize, uploadSize: file.size, optimized: false };
}
