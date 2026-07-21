import type { Message } from "@/types";

const STORAGE_PREFIX = "ng_message_outbox";
const EVENT_NAME = "nightgram:outbox-change";
const MESSAGE_EVENT_NAME = "nightgram:outbox-message-state";
const MAX_OUTBOX_MESSAGES = 200;

export type OutboxMessage = Message & { status: "queued" | "sending" | "failed" };

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function storageKey(userId?: string | null): string {
  return `${STORAGE_PREFIX}:${userId || "guest"}`;
}

function notify(userId?: string | null): void {
  if (!isBrowser()) return;
  const messages = readMessageOutbox(userId);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, {
    detail: {
      userId: userId || null,
      count: messages.length,
      queuedCount: messages.filter((message) => message.status === "queued").length,
    },
  }));
}

export function readMessageOutbox(userId?: string | null): OutboxMessage[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is OutboxMessage => Boolean(item && typeof item === "object" && "id" in item && "conversationId" in item))
      .slice(-MAX_OUTBOX_MESSAGES);
  } catch {
    return [];
  }
}

function writeMessageOutbox(userId: string | null | undefined, messages: OutboxMessage[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(messages.slice(-MAX_OUTBOX_MESSAGES)));
    notify(userId);
  } catch {
    // A full/private localStorage must never block messaging UI.
  }
}

export function upsertOutboxMessage(userId: string | null | undefined, message: OutboxMessage): void {
  const messages = readMessageOutbox(userId);
  const clientId = message.clientId || message.id;
  const index = messages.findIndex((item) => (item.clientId || item.id) === clientId);
  if (index >= 0) messages[index] = message;
  else messages.push(message);
  writeMessageOutbox(userId, messages);
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(MESSAGE_EVENT_NAME, { detail: { message } }));
  }
}

export function removeOutboxMessage(userId: string | null | undefined, clientIdOrId: string): void {
  const messages = readMessageOutbox(userId);
  const next = messages.filter((item) => item.id !== clientIdOrId && item.clientId !== clientIdOrId);
  if (next.length === messages.length) return;
  writeMessageOutbox(userId, next);
}

export function getConversationOutbox(userId: string | null | undefined, conversationId: string): OutboxMessage[] {
  return readMessageOutbox(userId)
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function subscribeToOutbox(listener: (detail: { count: number; queuedCount: number }) => void): () => void {
  if (!isBrowser()) return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ count?: number; queuedCount?: number }>).detail;
    listener({ count: Number(detail?.count || 0), queuedCount: Number(detail?.queuedCount || 0) });
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function subscribeToOutboxMessages(listener: (message: OutboxMessage) => void): () => void {
  if (!isBrowser()) return () => {};
  const handler = (event: Event) => {
    const message = (event as CustomEvent<{ message?: OutboxMessage }>).detail?.message;
    if (message) listener(message);
  };
  window.addEventListener(MESSAGE_EVENT_NAME, handler);
  return () => window.removeEventListener(MESSAGE_EVENT_NAME, handler);
}
