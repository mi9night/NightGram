import type { Conversation, Message } from "@/types";

const LOCAL_MESSAGE_STATUSES = new Set(["queued", "sending", "failed"]);

function sameMessage(left: Message | null, right: Message | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id
    && left.clientId === right.clientId
    && left.text === right.text
    && left.type === right.type
    && left.status === right.status
    && left.createdAt === right.createdAt
    && left.attachmentUrl === right.attachmentUrl;
}

function sameParticipants(left: Conversation["participants"], right: Conversation["participants"]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.id !== b.id
      || a.username !== b.username
      || a.displayName !== b.displayName
      || a.avatarUrl !== b.avatarUrl
      || a.nameColor !== b.nameColor
      || a.role !== b.role
      || a.appRole !== b.appRole
      || a.isPremium !== b.isPremium
      || a.avatarFrame !== b.avatarFrame
      || a.verified !== b.verified
      || a.isOnline !== b.isOnline
      || a.lastSeen !== b.lastSeen
      || a.nightStatusText !== b.nightStatusText
      || a.nightStatusEmoji !== b.nightStatusEmoji
      || a.nightStatusExpiresAt !== b.nightStatusExpiresAt
    ) return false;
  }
  return true;
}

function sameConversation(left: Conversation, right: Conversation): boolean {
  return left.id === right.id
    && left.type === right.type
    && left.title === right.title
    && left.avatarUrl === right.avatarUrl
    && sameParticipants(left.participants, right.participants)
    && sameMessage(left.lastMessage, right.lastMessage)
    && left.unreadCount === right.unreadCount
    && left.pinned === right.pinned
    && left.muted === right.muted
    && left.archived === right.archived
    && left.requestStatus === right.requestStatus
    && left.favorite === right.favorite
    && left.folder === right.folder
    && left.appRole === right.appRole
    && left.isPremium === right.isPremium
    && left.avatarFrame === right.avatarFrame
    && left.verified === right.verified
    && left.isOnline === right.isOnline
    && left.lastSeen === right.lastSeen
    && left.nightStatusText === right.nightStatusText
    && left.nightStatusEmoji === right.nightStatusEmoji
    && left.nightStatusExpiresAt === right.nightStatusExpiresAt;
}

function shouldPreserveLocalLastMessage(current: Message | null, incoming: Message | null): boolean {
  if (!current || !LOCAL_MESSAGE_STATUSES.has(current.status)) return false;
  if (!incoming) return true;
  return Date.parse(current.createdAt) >= Date.parse(incoming.createdAt);
}

// Preserve object identity for unchanged rows. A background refresh therefore
// updates only conversations whose server state really changed, rather than
// forcing every memoized ChatRow to render again.
export function reconcileConversationList(
  previous: Conversation[],
  incoming: Conversation[],
): Conversation[] {
  if (previous.length === 0) return incoming;
  const previousById = new Map(previous.map((conversation) => [conversation.id, conversation]));
  let changed = previous.length !== incoming.length;

  const next = incoming.map((serverConversation) => {
    const current = previousById.get(serverConversation.id);
    if (!current) {
      changed = true;
      return serverConversation;
    }
    const candidate = shouldPreserveLocalLastMessage(current.lastMessage, serverConversation.lastMessage)
      ? { ...serverConversation, lastMessage: current.lastMessage }
      : serverConversation;
    if (sameConversation(current, candidate)) return current;
    changed = true;
    return candidate;
  });

  if (!changed && previous.every((conversation, index) => conversation === next[index])) return previous;
  return next;
}
