// Versioned user-scoped stale-while-revalidate cache.
// Fresh entries avoid a loading state; stale entries can still paint instantly while
// the network refreshes them. Writes are deferred so JSON serialization never blocks navigation.

const PREFIX = "ng_fast_cache:v2";

type CacheEnvelope<T> = { savedAt: number; value: T };

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function cacheKey(userId: string | null | undefined, area: string): string {
  return `${PREFIX}:${userId || "anonymous"}:${area}`;
}

export function readClientCache<T>(key: string, maxAgeMs: number, staleMaxAgeMs = maxAgeMs): T | null {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope<T>>;
    if (!parsed.savedAt || parsed.value === undefined) return null;
    const age = Date.now() - parsed.savedAt;
    if (age > staleMaxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

function commitCache<T>(key: string, value: T): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value } satisfies CacheEnvelope<T>));
  } catch {
    // Storage may be full or unavailable. Caching must never block the UI.
  }
}

type PendingWrite = { value: unknown };
const pendingWrites = new Map<string, PendingWrite>();

export function writeClientCache<T>(key: string, value: T): void {
  if (!storageAvailable()) return;

  const pending = pendingWrites.get(key);
  if (pending) {
    // Keep only the newest snapshot. Receipt/reaction events can otherwise queue
    // dozens of expensive JSON.stringify calls for the same conversation.
    pending.value = value;
    return;
  }

  const entry: PendingWrite = { value };
  pendingWrites.set(key, entry);
  const run = () => {
    const latest = pendingWrites.get(key);
    pendingWrites.delete(key);
    if (latest) commitCache(key, latest.value);
  };
  const idleCallback = window.requestIdleCallback;
  if (typeof idleCallback === "function") {
    idleCallback(run, { timeout: 1200 });
  } else {
    globalThis.setTimeout(run, 0);
  }
}
