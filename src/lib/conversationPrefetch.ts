import { api, type MessagePage } from "@/lib/api";

// Short-lived in-memory cache for the first page of a conversation. Hover/focus
// can start the Railway request before React mounts ChatView, while opening the
// chat reuses the exact same promise instead of creating a second request.
const PREFETCH_TTL_MS = 45_000;
const PREFETCH_MAX_ENTRIES = 12;

type PrefetchEntry = {
  expiresAt: number;
  promise: Promise<MessagePage>;
  value?: MessagePage;
};

const entries = new Map<string, PrefetchEntry>();

function makeKey(userId: string | null | undefined, conversationId: string): string {
  return `${userId || "anonymous"}:${conversationId}`;
}

function canPrefetch(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (connection?.saveData) return false;
  return connection?.effectiveType !== "slow-2g" && connection?.effectiveType !== "2g";
}

function prune(now = Date.now()): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
  while (entries.size > PREFETCH_MAX_ENTRIES) {
    const oldestKey = entries.keys().next().value as string | undefined;
    if (!oldestKey) break;
    entries.delete(oldestKey);
  }
}

export function peekConversationPrefetch(
  userId: string | null | undefined,
  conversationId: string,
): MessagePage | null {
  const key = makeKey(userId, conversationId);
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    entries.delete(key);
    return null;
  }
  return entry.value ?? null;
}

export function getConversationFirstPage(
  userId: string | null | undefined,
  conversationId: string,
): Promise<MessagePage> {
  const key = makeKey(userId, conversationId);
  const now = Date.now();
  const existing = entries.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;
  if (existing) entries.delete(key);

  const entry: PrefetchEntry = {
    expiresAt: now + PREFETCH_TTL_MS,
    promise: Promise.resolve({ messages: [], hasMore: false, nextBefore: null, nextAfter: null }),
  };
  entry.promise = api.getMessagesPage(conversationId, { limit: 80 })
    .then((page) => {
      entry.value = page;
      entry.expiresAt = Date.now() + PREFETCH_TTL_MS;
      return page;
    })
    .catch((error) => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    });
  entries.set(key, entry);
  prune(now);
  return entry.promise;
}

export function prefetchConversation(
  userId: string | null | undefined,
  conversationId: string,
): void {
  if (!conversationId || conversationId === "__saved__" || !canPrefetch()) return;
  void getConversationFirstPage(userId, conversationId).catch(() => {
    // Prefetch is opportunistic. ChatView will retry normally when opened.
  });
}

export function invalidateConversationPrefetch(
  userId: string | null | undefined,
  conversationId: string,
): void {
  entries.delete(makeKey(userId, conversationId));
}
