export interface ChatDraft {
  conversationId: string;
  text: string;
  replyTo?: { id: string; text?: string; senderId?: string } | null;
  updatedAt: string;
}

const STORAGE_PREFIX = "ng_chat_drafts_v1";
const EVENT_NAME = "nightgram:chat-drafts-changed";

function storageKey(userId?: string | null) {
  return `${STORAGE_PREFIX}:${userId || "guest"}`;
}

function readMap(userId?: string | null): Record<string, ChatDraft> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || "{}") as Record<string, ChatDraft>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(userId: string | null | undefined, drafts: Record<string, ChatDraft>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(userId), JSON.stringify(drafts));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { userId: userId || "guest" } }));
}

export function getChatDraft(userId: string | null | undefined, conversationId: string): ChatDraft | null {
  return readMap(userId)[conversationId] || null;
}

export function getAllChatDrafts(userId?: string | null): Record<string, ChatDraft> {
  return readMap(userId);
}

export function saveChatDraft(userId: string | null | undefined, draft: ChatDraft) {
  const text = draft.text.trimEnd();
  const drafts = readMap(userId);
  if (!text && !draft.replyTo) {
    if (drafts[draft.conversationId]) {
      delete drafts[draft.conversationId];
      writeMap(userId, drafts);
    }
    return;
  }
  drafts[draft.conversationId] = {
    ...draft,
    text,
    updatedAt: new Date().toISOString(),
  };
  writeMap(userId, drafts);
}

export function clearChatDraft(userId: string | null | undefined, conversationId: string) {
  const drafts = readMap(userId);
  if (!drafts[conversationId]) return;
  delete drafts[conversationId];
  writeMap(userId, drafts);
}

export function subscribeToChatDrafts(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}
