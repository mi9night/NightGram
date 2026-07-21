"use client";

export type ServerHealthStatus = "unknown" | "checking" | "healthy" | "degraded" | "unreachable";

export type ServerHealthSnapshot = {
  status: ServerHealthStatus;
  checkedAt: number | null;
  lastHealthyAt: number | null;
  latencyMs: number | null;
  statusCode: number | null;
  message: string | null;
  requestId: string | null;
  service: string | null;
};

export const SERVER_HEALTH_EVENT = "nightgram:server-health";
export const CONNECTION_RECOVERY_EVENT = "nightgram:connection-recover";

const HEALTH_ENDPOINT = "/api/backend/health";
const DEFAULT_TIMEOUT_MS = 7_500;

let latestSnapshot: ServerHealthSnapshot = {
  status: "unknown",
  checkedAt: null,
  lastHealthyAt: null,
  latencyMs: null,
  statusCode: null,
  message: null,
  requestId: null,
  service: null,
};
let activeProbe: Promise<ServerHealthSnapshot> | null = null;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function publish(snapshot: ServerHealthSnapshot): ServerHealthSnapshot {
  latestSnapshot = snapshot;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<ServerHealthSnapshot>(SERVER_HEALTH_EVENT, { detail: snapshot }));
  }
  return snapshot;
}

function withUpdate(patch: Partial<ServerHealthSnapshot>): ServerHealthSnapshot {
  return publish({ ...latestSnapshot, ...patch });
}

function parsePayload(raw: unknown): { ok?: boolean; service?: string; message?: string; error?: string; requestId?: string } {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  return {
    ok: typeof value.ok === "boolean" ? value.ok : undefined,
    service: typeof value.service === "string" ? value.service : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
    requestId: typeof value.requestId === "string" ? value.requestId : undefined,
  };
}

export function getLatestServerHealth(): ServerHealthSnapshot {
  return latestSnapshot;
}

export function subscribeToServerHealth(listener: (snapshot: ServerHealthSnapshot) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ServerHealthSnapshot>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(SERVER_HEALTH_EVENT, handler);
  listener(latestSnapshot);
  return () => window.removeEventListener(SERVER_HEALTH_EVENT, handler);
}

export function requestConnectionRecovery(source = "manual"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONNECTION_RECOVERY_EVENT, { detail: { source, requestedAt: Date.now() } }));
}

export async function probeServerHealth(options: { timeoutMs?: number; reason?: string } = {}): Promise<ServerHealthSnapshot> {
  if (activeProbe) return activeProbe;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return withUpdate({
      status: "unreachable",
      checkedAt: Date.now(),
      latencyMs: null,
      statusCode: null,
      message: "Нет подключения к интернету",
      requestId: null,
    });
  }

  const timeoutMs = Math.max(2_000, Math.min(20_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const previous = latestSnapshot;
  withUpdate({ status: "checking", message: options.reason === "manual" ? "Проверяем сервер…" : previous.message });

  activeProbe = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = nowMs();
    try {
      const response = await fetch(HEALTH_ENDPOINT, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json", "x-nightgram-health-check": "1" },
        signal: controller.signal,
      });
      const latencyMs = Math.max(0, Math.round(nowMs() - startedAt));
      const payload = parsePayload(await response.json().catch(() => null));
      const requestId = response.headers.get("x-request-id") || payload.requestId || null;

      if (response.ok && payload.ok !== false) {
        return publish({
          status: "healthy",
          checkedAt: Date.now(),
          lastHealthyAt: Date.now(),
          latencyMs,
          statusCode: response.status,
          message: null,
          requestId,
          service: payload.service || "nightgram",
        });
      }

      const isDegraded = response.status === 429 || (response.status >= 400 && response.status < 500);
      return publish({
        status: isDegraded ? "degraded" : "unreachable",
        checkedAt: Date.now(),
        lastHealthyAt: previous.lastHealthyAt,
        latencyMs,
        statusCode: response.status,
        message: payload.message || payload.error || (isDegraded ? "Сервер временно ограничивает запросы" : "Сервер временно недоступен"),
        requestId,
        service: payload.service || previous.service,
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      return publish({
        status: "unreachable",
        checkedAt: Date.now(),
        lastHealthyAt: previous.lastHealthyAt,
        latencyMs: null,
        statusCode: null,
        message: timedOut ? "Сервер отвечает слишком долго" : "Не удалось связаться с сервером",
        requestId: null,
        service: previous.service,
      });
    } finally {
      clearTimeout(timer);
      activeProbe = null;
    }
  })();

  return activeProbe;
}
