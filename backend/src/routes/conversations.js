// Conversations routes — list + message history
const router = require("express").Router();
const { supabase } = require("../lib/supabase");
const { blockState, canMessage, canAddToGroups, canViewLastSeen, getPrivacySettings } = require("../lib/privacy");
const { getReceiptSummaries, markMessageReceipt } = require("../lib/messageReceipts");
const { consumeRateLimitDistributed, rateLimitResponse, logSpamEvent, getTrustProfile, hasRestriction, assessLinksWithRules } = require("../lib/safety");
const { hasActivePunishment, punishmentMessage } = require("../lib/punishments");
const { getPollMap, syncMessageMentions } = require("../lib/pollsMentions");

const SCHEDULED_MESSAGE_TYPES = new Set(["text", "image", "video", "file", "sticker"]);
const CHAT_ORGANIZATION_FOLDERS = new Set(["all", "work", "friends", "family"]);

function cleanScheduledUrl(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text || text.length > 2048) return null;
  try {
    const url = new URL(text);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function serializeScheduledMessage(row) {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    text: row.text ?? null,
    type: row.type || "text",
    attachmentUrl: row.attachment_url ?? null,
    attachmentThumbnailUrl: row.attachment_thumbnail_url ?? null,
    mediaWidth: row.media_width ?? null,
    mediaHeight: row.media_height ?? null,
    mediaDurationSec: row.media_duration_sec ?? null,
    replyTo: row.reply_to ?? null,
    scheduledAt: row.scheduled_at,
    status: row.status || "pending",
    createdAt: row.created_at,
    sentAt: row.sent_at ?? null,
    sentMessageId: row.sent_message_id ?? null,
    lastError: row.last_error ?? null,
  };
}

async function safe(promise, fallback = { data: null, error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

async function ensureParticipant(conversationId, userId) {
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

async function canManageMessagePins(conversationId, userId) {
  const [{ data: conversation }, { data: participant }] = await Promise.all([
    safe(supabase.from("conversations").select("type").eq("id", conversationId).maybeSingle(), { data: null, error: null }),
    safe(supabase.from("conversation_participants").select("role").eq("conversation_id", conversationId).eq("user_id", userId).maybeSingle(), { data: null, error: null }),
  ]);
  if (!participant) return false;
  if ((conversation?.type || "direct") === "direct") return true;
  return ["owner", "admin"].includes(String(participant.role || "member"));
}

const USER_SELECT_VARIANTS = [
  "id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame,verified,night_status_text,night_status_emoji,night_status_expires_at",
  "id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame,verified",
  "id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame",
  "id,username,display_name,avatar_url,name_color,role",
  "id,username,display_name,avatar_url,name_color",
  "id,username,display_name,avatar_url",
];

async function fetchUsersByIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return new Map();

  let rows = [];
  for (const select of USER_SELECT_VARIANTS) {
    const result = await safe(
      supabase.from("users").select(select).in("id", ids),
      { data: [], error: null },
    );
    if (!result.error) {
      rows = result.data || [];
      break;
    }
  }

  const map = new Map();
  for (const user of rows || []) map.set(String(user.id), user);
  return map;
}

function serializeSender(sender, fallbackId = "") {
  if (!sender) return undefined;
  const id = String(sender.id || fallbackId || "");
  const username = String(sender.username || "");
  const avatarFrame = sender.avatar_frame ?? sender.avatarFrame ?? null;
  return {
    id,
    username,
    displayName: String(sender.display_name || sender.displayName || username || "Пользователь"),
    avatarUrl: sender.avatar_url ?? sender.avatarUrl ?? null,
    nameColor: String(sender.name_color || sender.nameColor || "#ffffff"),
    isPremium: Boolean(sender.is_premium ?? sender.isPremium ?? false),
    avatarFrame,
    verified: Boolean(sender.verified ?? sender.isVerified ?? avatarFrame === "verified"),
  };
}

function serializeParticipant(part, user, presenceMap = new Map(), onlineSet = new Set()) {
  if (!user) return null;
  const sender = serializeSender(user, part.user_id);
  if (!sender?.id) return null;
  return {
    ...sender,
    role: part.role || "member",
    appRole: user.role || user.userRole || "user",
    isOnline: onlineSet.has(sender.id),
    lastSeen: presenceMap.get(sender.id)?.last_seen || null,
    nightStatusText: user.night_status_text ?? user.nightStatusText ?? null,
    nightStatusEmoji: user.night_status_emoji ?? user.nightStatusEmoji ?? null,
    nightStatusExpiresAt: user.night_status_expires_at ?? user.nightStatusExpiresAt ?? null,
  };
}

function serializeMessage(row, reactions = [], receiptSummary = null) {
  if (!row) return null;
  const senderId = row.sender_id || row.senderId || "";
  const sender = row.sender || row.users || null;
  return {
    ...row,
    conversationId: row.conversation_id || row.conversationId,
    senderId,
    sender: serializeSender(sender, senderId),
    attachmentUrl: row.attachment_url ?? row.attachmentUrl ?? undefined,
    attachmentThumbnailUrl: row.attachment_thumbnail_url ?? row.attachmentThumbnailUrl ?? undefined,
    mediaWidth: row.media_width ?? row.mediaWidth ?? undefined,
    mediaHeight: row.media_height ?? row.mediaHeight ?? undefined,
    mediaDurationSec: row.media_duration_sec ?? row.mediaDurationSec ?? undefined,
    replyTo: row.reply_to || row.replyTo ? { id: row.reply_to || row.replyTo, text: "", senderId: "" } : null,
    reactions,
    status: receiptSummary?.status || row.status || "sent",
    readBy: receiptSummary?.readBy || [],
    deliveredTo: receiptSummary?.deliveredTo || [],
    createdAt: row.created_at || row.createdAt,
    editedAt: row.edited_at ?? row.editedAt ?? null,
    deletedAt: row.deleted_at ?? row.deletedAt ?? null,
    pinnedAt: row.pinned_at ?? row.pinnedAt ?? null,
    pinnedBy: row.pinned_by ?? row.pinnedBy ?? null,
  };
}

async function buildConversationSummary(conversationId, viewerId, fallbackConversation = null) {
  const { data: conversation } = await safe(
    supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle(),
    { data: null, error: null },
  );
  const conv = conversation || fallbackConversation || { id: conversationId, type: "direct", title: "Чат", avatar_url: null, folder: "all" };
  let partsResult = await safe(
    supabase
      .from("conversation_participants")
      .select("conversation_id,user_id,role,pinned,muted,archived,folder,request_status,hidden")
      .eq("conversation_id", conversationId),
    { data: [], error: null },
  );
  if (partsResult.error && /request_status|hidden|archived|folder|schema cache/i.test(partsResult.error.message || "")) {
    partsResult = await safe(
      supabase
        .from("conversation_participants")
        .select("conversation_id,user_id,role,pinned,muted,archived,folder")
        .eq("conversation_id", conversationId),
      { data: [], error: null },
    );
    if (partsResult.error && /archived|folder|schema cache/i.test(partsResult.error.message || "")) {
      partsResult = await safe(
        supabase
          .from("conversation_participants")
          .select("conversation_id,user_id,role,pinned,muted")
          .eq("conversation_id", conversationId),
        { data: [], error: null },
      );
    }
  }
  const parts = partsResult.data || [];
  const userMap = await fetchUsersByIds(parts.map((part) => part.user_id));
  let participants = parts
    .map((part) => serializeParticipant(part, userMap.get(String(part.user_id))))
    .filter(Boolean);
  const selfPart = parts.find((part) => String(part.user_id) === String(viewerId));
  const isDirect = conv.type === "direct";
  let other = participants.find((part) => String(part.id) !== String(viewerId));

  // Some old direct chats were created with a broken/partial participants list.
  // If the other participant is missing, infer them from real message senders so
  // the UI never falls back to the fake "Чат" user.
  if (isDirect && !other) {
    const { data: senderRow } = await safe(
      supabase
        .from("messages")
        .select("sender_id")
        .eq("conversation_id", conversationId)
        .neq("sender_id", viewerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      { data: null, error: null },
    );
    if (senderRow?.sender_id) {
      const inferredUsers = await fetchUsersByIds([senderRow.sender_id]);
      const inferred = serializeParticipant({ conversation_id: conversationId, user_id: senderRow.sender_id, role: "member" }, inferredUsers.get(String(senderRow.sender_id)));
      if (inferred) {
        participants = [...participants.filter((part) => String(part.id) !== String(inferred.id)), inferred];
        other = inferred;
        await safe(
          supabase.from("conversation_participants").upsert({
            conversation_id: conversationId,
            user_id: senderRow.sender_id,
            role: "member",
          }, { onConflict: "conversation_id,user_id" }),
          { data: null, error: null },
        );
      }
    }
  }

  const mentionCountResult = await safe(
    supabase
      .from("message_mentions")
      .select("message_id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("user_id", viewerId)
      .is("read_at", null),
    { count: 0, data: null, error: null },
  );

  return {
    id: conv.id || conversationId,
    type: conv.type || "direct",
    title: isDirect ? (other?.displayName || other?.username || conv.title || "Чат") : (conv.title || "Группа"),
    avatarUrl: isDirect ? (other?.avatarUrl || null) : (conv.avatar_url || null),
    description: isDirect ? null : (conv.description || null),
    participants,
    lastMessage: null,
    unreadCount: 0,
    mentionCount: mentionCountResult.count || 0,
    pinned: Boolean(selfPart?.pinned),
    muted: Boolean(selfPart?.muted),
    archived: Boolean(selfPart?.archived),
    requestStatus: selfPart?.request_status || "accepted",
    folder: CHAT_ORGANIZATION_FOLDERS.has(String(selfPart?.folder || "")) ? selfPart.folder : (conv.folder || "all"),
    favorite: false,
    isOnline: false,
    appRole: isDirect ? other?.appRole : undefined,
    isPremium: isDirect ? other?.isPremium || false : false,
    avatarFrame: isDirect ? other?.avatarFrame || null : null,
    verified: isDirect ? Boolean(other?.verified || other?.avatarFrame === "verified") : false,
    lastSeen: null,
    nightStatusText: isDirect ? other?.nightStatusText || null : null,
    nightStatusEmoji: isDirect ? other?.nightStatusEmoji || null : null,
    nightStatusExpiresAt: isDirect ? other?.nightStatusExpiresAt || null : null,
  };
}

async function isKnownContact(ownerId, targetId) {
  const [{ data: follows }, { data: reverseFollow }, { data: friendship }, { data: favorite }] = await Promise.all([
    safe(supabase.from("follows").select("follower_id").eq("follower_id", ownerId).eq("following_id", targetId).maybeSingle(), { data: null }),
    safe(supabase.from("follows").select("follower_id").eq("follower_id", targetId).eq("following_id", ownerId).maybeSingle(), { data: null }),
    safe(supabase.from("friendships").select("user_id").eq("user_id", ownerId).eq("friend_id", targetId).eq("status", "accepted").maybeSingle(), { data: null }),
    safe(supabase.from("favorite_users").select("user_id").eq("user_id", ownerId).eq("target_id", targetId).maybeSingle(), { data: null }),
  ]);
  return Boolean(follows || reverseFollow || friendship || favorite);
}

async function hydrateMessages(rows, viewerId = null) {
  const ids = (rows || []).map((m) => m.id);
  if (ids.length === 0) return [];

  const missingSenderIds = (rows || [])
    .filter((message) => message.sender_id && !message.sender && !message.users)
    .map((message) => message.sender_id);

  const replyIds = [...new Set((rows || []).map((message) => message.reply_to).filter(Boolean))];
  const [{ data: reactions }, receiptSummaries, senderMap, replyResult, pollMap, mentionsResult] = await Promise.all([
    supabase
      .from("message_reactions")
      .select("message_id,user_id,emoji")
      .in("message_id", ids),
    getReceiptSummaries(rows || []),
    fetchUsersByIds(missingSenderIds),
    replyIds.length > 0
      ? safe(supabase.from("messages").select("id,text,sender_id,deleted_at").in("id", replyIds), { data: [], error: null })
      : Promise.resolve({ data: [], error: null }),
    getPollMap(ids, viewerId),
    safe(supabase.from("message_mentions").select("message_id,user_id").in("message_id", ids), { data: [], error: null }),
  ]);
  const replyMap = new Map((replyResult.data || []).map((reply) => [String(reply.id), reply]));

  const grouped = {};
  for (const reaction of reactions || []) {
    grouped[reaction.message_id] ||= {};
    grouped[reaction.message_id][reaction.emoji] ||= new Set();
    grouped[reaction.message_id][reaction.emoji].add(reaction.user_id);
  }

  return rows.map((message) => {
    const messageReactions = Object.entries(grouped[message.id] || {}).map(([emoji, users]) => ({
      emoji,
      userIds: Array.from(users),
    }));
    const sender = message.sender || message.users || senderMap.get(String(message.sender_id));
    const serialized = serializeMessage({ ...message, sender }, messageReactions, receiptSummaries.get(message.id));
    const reply = message.reply_to ? replyMap.get(String(message.reply_to)) : null;
    if (serialized?.replyTo && reply) {
      serialized.replyTo = {
        id: String(reply.id),
        text: reply.deleted_at ? "Сообщение удалено" : String(reply.text || "Медиа"),
        senderId: String(reply.sender_id || ""),
      };
    }
    if (serialized) {
      serialized.poll = pollMap.get(String(message.id)) || null;
      serialized.mentionedUserIds = (mentionsResult.data || [])
        .filter((mention) => String(mention.message_id) === String(message.id))
        .map((mention) => String(mention.user_id));
    }
    return serialized;
  });
}

// GET /api/conversations
router.get("/", async (req, res) => {
  let partsResult = await safe(
    supabase
      .from("conversation_participants")
      .select("conversation_id, role, pinned, muted, archived, folder, request_status, hidden, last_read_at, conversations(*)")
      .eq("user_id", req.userId),
    { data: [], error: null },
  );
  if (partsResult.error && /request_status|hidden|archived|folder|schema cache/i.test(partsResult.error.message || "")) {
    partsResult = await safe(
      supabase
        .from("conversation_participants")
        .select("conversation_id, role, pinned, muted, archived, folder, last_read_at, conversations(*)")
        .eq("user_id", req.userId),
      { data: [], error: null },
    );
    if (partsResult.error && /archived|folder|schema cache/i.test(partsResult.error.message || "")) {
      partsResult = await safe(
        supabase
          .from("conversation_participants")
          .select("conversation_id, role, pinned, muted, last_read_at, conversations(*)")
          .eq("user_id", req.userId),
        { data: [], error: null },
      );
    }
  }
  const { data: parts, error } = partsResult;
  if (error) return res.status(500).json({ error: error.message });

  const visibleParts = (parts || []).filter((p) => !p.hidden && p.conversations);
  const convIds = visibleParts.map((p) => p.conversation_id).filter(Boolean);
  if (convIds.length === 0) return res.json([]);

  let allPartsResult = await safe(
    supabase
      .from("conversation_participants")
      .select("conversation_id,user_id,role,users(id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame,verified,night_status_text,night_status_emoji,night_status_expires_at)")
      .in("conversation_id", convIds),
    { data: [], error: null },
  );
  if (allPartsResult.error && /verified|schema cache/i.test(allPartsResult.error.message || "")) {
    allPartsResult = await safe(
      supabase
        .from("conversation_participants")
        .select("conversation_id,user_id,role,users(id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame,night_status_text,night_status_emoji,night_status_expires_at)")
        .in("conversation_id", convIds),
      { data: [], error: null },
    );
  }
  let allParts = allPartsResult.data || [];
  if (allPartsResult.error || allParts.some((part) => !part.users)) {
    const plainPartsResult = await safe(
      supabase
        .from("conversation_participants")
        .select("conversation_id,user_id,role")
        .in("conversation_id", convIds),
      { data: [], error: null },
    );
    if (!plainPartsResult.error && plainPartsResult.data?.length) {
      const embeddedByKey = new Map(allParts.map((part) => [`${part.conversation_id}:${part.user_id || part.users?.id || ""}`, part]));
      allParts = plainPartsResult.data.map((part) => ({
        ...part,
        users: embeddedByKey.get(`${part.conversation_id}:${part.user_id}`)?.users,
      }));
    }
  }
  const participantUserIds = [...new Set(allParts.map((p) => p.user_id || p.users?.id).filter(Boolean))];
  const participantUserMap = await fetchUsersByIds(participantUserIds);

  const [presenceResult, favoritesResult, latestResults, unreadResults] = await Promise.all([
    participantUserIds.length
      ? safe(supabase.from("presence").select("user_id,is_online,last_seen").in("user_id", participantUserIds), { data: [], error: null })
      : Promise.resolve({ data: [] }),
    safe(supabase.from("favorite_users").select("target_id").eq("user_id", req.userId), { data: [], error: null }),
    Promise.all(convIds.map((cid) => safe(
      supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", cid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      { data: null, error: null },
    ))),
    Promise.all(visibleParts.map((cp) => {
      let query = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", cp.conversation_id)
        .neq("sender_id", req.userId);
      if (cp.last_read_at) query = query.gt("created_at", cp.last_read_at);
      return safe(query, { count: 0, data: null, error: null });
    })),
  ]);

  const presenceAllowedIds = new Set();
  for (const participantUserId of participantUserIds) {
    if (String(participantUserId) === String(req.userId) || await canViewLastSeen(participantUserId, req.userId)) presenceAllowedIds.add(String(participantUserId));
  }
  const visiblePresenceRows = (presenceResult.data || []).filter((row) => presenceAllowedIds.has(String(row.user_id)));
  const presenceMap = new Map(visiblePresenceRows.map((p) => [p.user_id, p]));
  const onlineSet = new Set(visiblePresenceRows
    .filter((p) => p.is_online && (!p.last_seen || Date.now() - new Date(p.last_seen).getTime() < 90_000))
    .map((p) => p.user_id));
  const favoriteSet = new Set((favoritesResult.data || []).map((f) => f.target_id));
  const latestRows = latestResults.map((result) => result.data).filter(Boolean);
  const latestReceiptSummaries = await getReceiptSummaries(latestRows);
  const latestMap = new Map(latestRows.map((row) => [row.conversation_id, row]));
  const latestSenderMap = await fetchUsersByIds(latestRows.map((row) => row.sender_id));
  const unreadMap = new Map(visibleParts.map((cp, index) => [cp.conversation_id, unreadResults[index]?.count || 0]));
  const mentionResult = convIds.length > 0
    ? await safe(
      supabase
        .from("message_mentions")
        .select("conversation_id")
        .eq("user_id", req.userId)
        .is("read_at", null)
        .in("conversation_id", convIds),
      { data: [], error: null },
    )
    : { data: [] };
  const mentionMap = new Map();
  for (const mention of mentionResult.data || []) {
    const key = String(mention.conversation_id);
    mentionMap.set(key, (mentionMap.get(key) || 0) + 1);
  }

  const directConvIds = visibleParts
    .filter((cp) => cp.conversations?.type === "direct")
    .map((cp) => cp.conversation_id)
    .filter(Boolean);
  const messageSenderRowsResult = directConvIds.length > 0
    ? await safe(
      supabase
        .from("messages")
        .select("conversation_id,sender_id,created_at")
        .in("conversation_id", directConvIds)
        .neq("sender_id", req.userId)
        .order("created_at", { ascending: false })
        .limit(Math.min(1000, Math.max(50, directConvIds.length * 20))),
      { data: [], error: null },
    )
    : { data: [] };
  const inferredSenderByConversation = new Map();
  for (const row of messageSenderRowsResult.data || []) {
    if (row.conversation_id && row.sender_id && !inferredSenderByConversation.has(row.conversation_id)) {
      inferredSenderByConversation.set(row.conversation_id, row.sender_id);
    }
  }
  const inferredSenderMap = await fetchUsersByIds([...inferredSenderByConversation.values()]);
  const existingParticipantKeys = new Set((allParts || []).map((part) => `${part.conversation_id}:${part.user_id || part.users?.id || ""}`));
  const repairParticipantRows = [...inferredSenderByConversation.entries()]
    .filter(([cid, senderId]) => senderId && !existingParticipantKeys.has(`${cid}:${senderId}`))
    .map(([cid, senderId]) => ({ conversation_id: cid, user_id: senderId, role: "member" }));
  if (repairParticipantRows.length > 0) {
    await safe(
      supabase.from("conversation_participants").upsert(repairParticipantRows, { onConflict: "conversation_id,user_id" }),
      { data: null, error: null },
    );
  }

  const result = convIds.map((cid) => {
    const cp = visibleParts.find((p) => p.conversation_id === cid);
    if (!cp?.conversations) return null;
    let participants = (allParts || [])
      .filter((p) => p.conversation_id === cid)
      .map((p) => serializeParticipant(
        p,
        p.users || participantUserMap.get(String(p.user_id || p.users?.id || "")),
        presenceMap,
        onlineSet,
      ))
      .filter(Boolean);
    const latest = latestMap.get(cid);
    const latestSender = latest ? latestSenderMap.get(String(latest.sender_id)) : null;
    const lastMessage = latest ? serializeMessage({ ...latest, sender: latestSender }, [], latestReceiptSummaries.get(latest.id)) : null;
    const isDirect = cp.conversations.type === "direct";
    let other = participants.find((p) => String(p.id) !== String(req.userId));
    if (isDirect && !other) {
      const inferredSenderId = inferredSenderByConversation.get(cid) || (latest?.sender_id && String(latest.sender_id) !== String(req.userId) ? latest.sender_id : null);
      const inferredUser = inferredSenderId ? (inferredSenderMap.get(String(inferredSenderId)) || latestSenderMap.get(String(inferredSenderId))) : null;
      const inferred = inferredSenderId
        ? serializeParticipant({ conversation_id: cid, user_id: inferredSenderId, role: "member" }, inferredUser, presenceMap, onlineSet)
        : null;
      if (inferred) {
        participants = [...participants.filter((p) => String(p.id) !== String(inferred.id)), inferred];
        other = inferred;
      }
    }
    return {
      id: cid,
      type: cp.conversations.type,
      title: isDirect ? (other?.displayName || other?.username || "Чат") : (cp.conversations.title || "Группа"),
      avatarUrl: isDirect ? (other?.avatarUrl || null) : (cp.conversations.avatar_url || null),
      description: isDirect ? null : (cp.conversations.description || null),
      participants,
      lastMessage,
      unreadCount: unreadMap.get(cid) || 0,
      mentionCount: mentionMap.get(String(cid)) || 0,
      pinned: cp.pinned,
      muted: cp.muted || false,
      archived: Boolean(cp.archived),
      requestStatus: cp.request_status || "accepted",
      favorite: isDirect && other ? favoriteSet.has(other.id) : false,
      folder: CHAT_ORGANIZATION_FOLDERS.has(String(cp.folder || "")) ? cp.folder : (cp.conversations.folder || "all"),
      isOnline: isDirect && other ? onlineSet.has(other.id) : false,
      appRole: isDirect ? other?.appRole : undefined,
      isPremium: isDirect ? other?.isPremium : false,
      avatarFrame: isDirect ? other?.avatarFrame : null,
      verified: isDirect ? Boolean(other?.verified || other?.avatarFrame === "verified") : false,
      lastSeen: isDirect ? other?.lastSeen || null : null,
      nightStatusText: isDirect ? other?.nightStatusText || null : null,
      nightStatusEmoji: isDirect ? other?.nightStatusEmoji || null : null,
      nightStatusExpiresAt: isDirect ? other?.nightStatusExpiresAt || null : null,
    };
  }).filter(Boolean);

  result.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bt = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bt - at;
  });

  res.json(result);
});


// POST /api/conversations/direct — create/find direct chat with a user
router.post("/direct", async (req, res) => {
  const directLimit = await consumeRateLimitDistributed(`conversations:direct:${req.userId}`, { limit: 15, windowMs: 60 * 60 * 1000 });
  if (!directLimit.allowed) {
    await logSpamEvent({ userId: req.userId, eventType: "direct_create_rate_limited", targetType: "conversation", meta: { retryAfter: directLimit.retryAfter } });
    return rateLimitResponse(res, directLimit, "Слишком много новых диалогов за час. Подожди немного.");
  }
  const { userId } = req.body;
  if (!userId || userId === req.userId) return res.status(400).json({ error: "Invalid user" });
  const trust = await getTrustProfile(req.userId);
  if (hasRestriction(trust, "noUnknownDm") && !(await isKnownContact(req.userId, userId))) {
    return res.status(403).json({ error: "Создание диалогов с незнакомыми временно ограничено системой безопасности" });
  }
  const blocks = await blockState(req.userId, userId);
  if (blocks.blocked) return res.status(403).json({ error: "blocked", message: "Личные сообщения недоступны из-за чёрного списка" });

  const { data: myParts } = await supabase
    .from("conversation_participants")
    .select("conversation_id, conversations(type)")
    .eq("user_id", req.userId);
  const directIds = (myParts || []).filter((p) => p.conversations?.type === "direct").map((p) => p.conversation_id);
  if (directIds.length > 0) {
    const { data: existing } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId)
      .in("conversation_id", directIds)
      .maybeSingle();
    if (existing) {
      const summary = await buildConversationSummary(existing.conversation_id, req.userId);
      return res.json(summary || { id: existing.conversation_id });
    }
  }

  if (!(await canMessage(userId, req.userId))) return res.status(403).json({ error: "privacy_restricted", message: "Пользователь ограничил новые личные сообщения" });

  const { data: target } = await supabase.from("users").select("username,avatar_url").eq("id", userId).single();
  if (!target) return res.status(404).json({ error: "User not found" });

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ type: "direct", title: target.username || "Чат", avatar_url: target.avatar_url || null })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const recipientKnowsSender = await isKnownContact(userId, req.userId);
  const recipientPrivacy = await getPrivacySettings(userId);
  const recipientStatus = recipientKnowsSender || recipientPrivacy.filter_unknown_messages === false ? "accepted" : "pending";
  let participantInsert = await safe(supabase.from("conversation_participants").insert([
    { conversation_id: conv.id, user_id: req.userId, role: "member", request_status: "accepted", hidden: false },
    { conversation_id: conv.id, user_id: userId, role: "member", request_status: recipientStatus, hidden: false },
  ]), { error: null });
  if (participantInsert.error && /request_status|hidden|schema cache/i.test(participantInsert.error.message || "")) {
    participantInsert = await safe(supabase.from("conversation_participants").insert([
      { conversation_id: conv.id, user_id: req.userId, role: "member" },
      { conversation_id: conv.id, user_id: userId, role: "member" },
    ]), { error: null });
  }

  const summary = await buildConversationSummary(conv.id, req.userId, conv);
  res.status(201).json({ ...summary, skippedPrivacyCount: Math.max(0, requestedIds.length - acceptedIds.length) });
});


async function getGroupContext(conversationId, userId) {
  let conversationResult = await safe(
    supabase.from("conversations").select("id,type,title,avatar_url,description").eq("id", conversationId).maybeSingle(),
    { data: null, error: null },
  );
  if (conversationResult.error && /description|schema cache|column/i.test(conversationResult.error.message || "")) {
    conversationResult = await safe(
      supabase.from("conversations").select("id,type,title,avatar_url").eq("id", conversationId).maybeSingle(),
      { data: null, error: null },
    );
  }
  const { data: participant } = await safe(
    supabase.from("conversation_participants").select("user_id,role").eq("conversation_id", conversationId).eq("user_id", userId).maybeSingle(),
    { data: null, error: null },
  );
  return { conversation: conversationResult.data, participant };
}

async function getUserLabel(userId) {
  const users = await fetchUsersByIds([userId]);
  const user = users.get(String(userId));
  return user?.display_name || user?.username || "Пользователь";
}

async function pushGroupSystemMessage(req, conversationId, actorId, text) {
  const { data: row, error } = await safe(
    supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: actorId,
      text: String(text || "").slice(0, 1000),
      type: "system",
      status: "sent",
    }).select("*").single(),
    { data: null, error: null },
  );
  if (error || !row) return null;
  const [message] = await hydrateMessages([row]);
  const io = req.app.get("io");
  io?.to(`conv:${conversationId}`).emit("message:new", message);

  const [{ data: participants }, { data: conversation }] = await Promise.all([
    safe(supabase.from("conversation_participants").select("user_id,muted").eq("conversation_id", conversationId), { data: [], error: null }),
    safe(supabase.from("conversations").select("title,avatar_url").eq("id", conversationId).maybeSingle(), { data: null, error: null }),
  ]);
  for (const participant of participants || []) {
    if (String(participant.user_id) === String(actorId)) continue;
    io?.to(`user:${participant.user_id}`).emit("message:push", {
      conversationId,
      message,
      muted: Boolean(participant.muted),
      conversationTitle: conversation?.title || "Группа",
      avatarUrl: conversation?.avatar_url || null,
    });
  }
  return message;
}

async function emitConversationChanged(req, conversationId, removedUserIds = []) {
  const io = req.app.get("io");
  const { data: participants } = await safe(
    supabase.from("conversation_participants").select("user_id").eq("conversation_id", conversationId),
    { data: [], error: null },
  );
  for (const participant of participants || []) {
    const conversation = await buildConversationSummary(conversationId, participant.user_id);
    io?.to(`user:${participant.user_id}`).emit("conversation:changed", {
      conversationId,
      conversation,
      removed: false,
    });
  }
  for (const userId of removedUserIds || []) {
    io?.to(`user:${userId}`).emit("conversation:changed", {
      conversationId,
      removed: true,
    });
  }
}

function isGroupManager(role) {
  return role === "owner" || role === "admin";
}

// POST /api/conversations/groups — create a group chat
router.post("/groups", async (req, res) => {
  const { title, description = "", avatarUrl, userIds = [] } = req.body;
  const cleanTitle = String(title || "").trim().slice(0, 80) || "Новая группа";
  const requestedIds = [...new Set((Array.isArray(userIds) ? userIds : []).map(String).filter((id) => id && id !== req.userId))].slice(0, 49);
  const requestedUsers = await fetchUsersByIds(requestedIds);
  const acceptedIds = [];
  for (const id of requestedIds) {
    if (!requestedUsers.has(String(id))) continue;
    const blocks = await blockState(req.userId, id);
    if (!blocks.blocked && await canAddToGroups(id, req.userId)) acceptedIds.push(id);
  }
  const uniqueIds = [req.userId, ...acceptedIds];
  if (uniqueIds.length < 2) return res.status(403).json({ error: "privacy_restricted", message: "Выбранные пользователи запретили добавление в группы" });

  let result = await supabase
    .from("conversations")
    .insert({ type: "group", title: cleanTitle, avatar_url: avatarUrl || null, description: String(description || "").slice(0, 240) })
    .select("*")
    .single();
  if (result.error && /description|schema cache/i.test(result.error.message || "")) {
    result = await supabase
      .from("conversations")
      .insert({ type: "group", title: cleanTitle, avatar_url: avatarUrl || null })
      .select("*")
      .single();
  }
  const { data: conv, error } = result;
  if (error) return res.status(500).json({ error: error.message });

  const participants = uniqueIds.map((id) => ({
    conversation_id: conv.id,
    user_id: id,
    role: id === req.userId ? "owner" : "member",
  }));
  await supabase.from("conversation_participants").insert(participants);

  const summary = await buildConversationSummary(conv.id, req.userId, conv);
  res.status(201).json(summary);
});


// PATCH /api/conversations/:id/group — update group profile.
router.patch("/:id/group", async (req, res) => {
  const { conversation, participant } = await getGroupContext(req.params.id, req.userId);
  if (!conversation || conversation.type !== "group") return res.status(404).json({ error: "Группа не найдена" });
  if (!isGroupManager(participant?.role)) return res.status(403).json({ error: "Изменять группу могут только администраторы" });

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(req.body, "title")) {
    const title = String(req.body.title || "").trim().slice(0, 80);
    if (!title) return res.status(400).json({ error: "Введите название группы" });
    patch.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "avatarUrl")) {
    const avatarUrl = req.body.avatarUrl ? String(req.body.avatarUrl).trim().slice(0, 2048) : null;
    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) return res.status(400).json({ error: "Некорректный адрес аватара" });
    patch.avatar_url = avatarUrl;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
    patch.description = String(req.body.description || "").trim().slice(0, 240);
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Нет изменений" });

  let result = await safe(
    supabase.from("conversations").update(patch).eq("id", req.params.id).select("*").single(),
    { data: null, error: null },
  );
  if (result.error && /description|schema cache|column/i.test(result.error.message || "")) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.description;
    if (Object.keys(fallbackPatch).length === 0) {
      return res.status(503).json({ error: "Примените migration_group_management.sql" });
    }
    result = await safe(supabase.from("conversations").update(fallbackPatch).eq("id", req.params.id).select("*").single(), { data: null, error: null });
  }
  if (result.error) return res.status(500).json({ error: result.error.message });

  const actor = await getUserLabel(req.userId);
  await pushGroupSystemMessage(req, req.params.id, req.userId, `${actor} обновил(а) информацию о группе`);
  await emitConversationChanged(req, req.params.id);
  res.json(await buildConversationSummary(req.params.id, req.userId, result.data));
});

// POST /api/conversations/:id/members — add group members.
router.post("/:id/members", async (req, res) => {
  const { conversation, participant } = await getGroupContext(req.params.id, req.userId);
  if (!conversation || conversation.type !== "group") return res.status(404).json({ error: "Группа не найдена" });
  if (!isGroupManager(participant?.role)) return res.status(403).json({ error: "Добавлять участников могут только администраторы" });

  const requestedIds = Array.isArray(req.body.userIds) ? req.body.userIds.map(String) : [];
  const userIds = [...new Set(requestedIds.filter((id) => id && id !== req.userId))].slice(0, 25);
  if (userIds.length === 0) return res.status(400).json({ error: "Выберите участников" });

  const users = await fetchUsersByIds(userIds);
  const validIds = [];
  const rejectedIds = [];
  for (const id of userIds) {
    if (!users.has(String(id))) continue;
    const blocked = await blockState(req.userId, id);
    const allowed = !blocked.blocked && await canAddToGroups(id, req.userId);
    if (allowed) validIds.push(id); else rejectedIds.push(id);
  }
  if (validIds.length === 0) return res.status(403).json({ error: "privacy_restricted", message: "Выбранные пользователи запретили добавление в группы" });

  const rows = validIds.map((userId) => ({ conversation_id: req.params.id, user_id: userId, role: "member" }));
  const { error } = await safe(
    supabase.from("conversation_participants").upsert(rows, { onConflict: "conversation_id,user_id", ignoreDuplicates: true }),
    { error: null },
  );
  if (error) return res.status(500).json({ error: error.message });

  const actor = await getUserLabel(req.userId);
  const labels = validIds.map((id) => users.get(String(id))?.display_name || users.get(String(id))?.username || "пользователя");
  await pushGroupSystemMessage(req, req.params.id, req.userId, `${actor} добавил(а): ${labels.join(", ")}`);
  await emitConversationChanged(req, req.params.id);
  const summary = await buildConversationSummary(req.params.id, req.userId);
  res.status(201).json({ ...summary, skippedPrivacyCount: rejectedIds.length });
});

// PATCH /api/conversations/:id/members/:userId — promote or demote a member.
router.patch("/:id/members/:userId", async (req, res) => {
  const role = String(req.body.role || "");
  if (!["member", "admin"].includes(role)) return res.status(400).json({ error: "Некорректная роль" });
  const { conversation, participant } = await getGroupContext(req.params.id, req.userId);
  if (!conversation || conversation.type !== "group") return res.status(404).json({ error: "Группа не найдена" });
  if (participant?.role !== "owner") return res.status(403).json({ error: "Роли может менять только владелец" });
  if (String(req.params.userId) === String(req.userId)) return res.status(400).json({ error: "Нельзя изменить роль владельца" });

  const { data: target } = await safe(
    supabase.from("conversation_participants").select("role").eq("conversation_id", req.params.id).eq("user_id", req.params.userId).maybeSingle(),
    { data: null, error: null },
  );
  if (!target) return res.status(404).json({ error: "Участник не найден" });
  if (target.role === "owner") return res.status(400).json({ error: "Сначала передайте права владельца" });

  const { error } = await supabase.from("conversation_participants").update({ role }).eq("conversation_id", req.params.id).eq("user_id", req.params.userId);
  if (error) return res.status(500).json({ error: error.message });

  const [actor, targetName] = await Promise.all([getUserLabel(req.userId), getUserLabel(req.params.userId)]);
  await pushGroupSystemMessage(req, req.params.id, req.userId, role === "admin" ? `${actor} назначил(а) ${targetName} администратором` : `${actor} снял(а) ${targetName} с должности администратора`);
  await emitConversationChanged(req, req.params.id);
  res.json(await buildConversationSummary(req.params.id, req.userId));
});

// POST /api/conversations/:id/transfer-owner — transfer group ownership.
router.post("/:id/transfer-owner", async (req, res) => {
  const targetId = String(req.body.userId || "");
  const { conversation, participant } = await getGroupContext(req.params.id, req.userId);
  if (!conversation || conversation.type !== "group") return res.status(404).json({ error: "Группа не найдена" });
  if (participant?.role !== "owner") return res.status(403).json({ error: "Передать группу может только владелец" });
  if (!targetId || targetId === req.userId) return res.status(400).json({ error: "Выберите другого участника" });

  const { data: target } = await safe(
    supabase.from("conversation_participants").select("user_id").eq("conversation_id", req.params.id).eq("user_id", targetId).maybeSingle(),
    { data: null, error: null },
  );
  if (!target) return res.status(404).json({ error: "Участник не найден" });

  const demote = await supabase.from("conversation_participants").update({ role: "admin" }).eq("conversation_id", req.params.id).eq("user_id", req.userId);
  if (demote.error) return res.status(500).json({ error: demote.error.message });
  const promote = await supabase.from("conversation_participants").update({ role: "owner" }).eq("conversation_id", req.params.id).eq("user_id", targetId);
  if (promote.error) {
    await supabase.from("conversation_participants").update({ role: "owner" }).eq("conversation_id", req.params.id).eq("user_id", req.userId);
    return res.status(500).json({ error: promote.error.message });
  }

  const [actor, targetName] = await Promise.all([getUserLabel(req.userId), getUserLabel(targetId)]);
  await pushGroupSystemMessage(req, req.params.id, req.userId, `${actor} передал(а) права владельца пользователю ${targetName}`);
  await emitConversationChanged(req, req.params.id);
  res.json(await buildConversationSummary(req.params.id, req.userId));
});

// DELETE /api/conversations/:id/members/:userId — remove member from group.
router.delete("/:id/members/:userId", async (req, res) => {
  const { conversation, participant } = await getGroupContext(req.params.id, req.userId);
  if (!conversation || conversation.type !== "group") return res.status(404).json({ error: "Группа не найдена" });
  if (!isGroupManager(participant?.role)) return res.status(403).json({ error: "Удалять участников могут только администраторы" });
  if (String(req.params.userId) === String(req.userId)) return res.status(400).json({ error: "Используйте выход из группы" });

  const { data: target } = await safe(
    supabase.from("conversation_participants").select("role").eq("conversation_id", req.params.id).eq("user_id", req.params.userId).maybeSingle(),
    { data: null, error: null },
  );
  if (!target) return res.status(404).json({ error: "Участник не найден" });
  if (target.role === "owner") return res.status(403).json({ error: "Нельзя удалить владельца" });
  if (participant.role === "admin" && target.role === "admin") return res.status(403).json({ error: "Администратор не может удалить другого администратора" });

  const targetName = await getUserLabel(req.params.userId);
  const { error } = await supabase.from("conversation_participants").delete().eq("conversation_id", req.params.id).eq("user_id", req.params.userId);
  if (error) return res.status(500).json({ error: error.message });
  const actor = await getUserLabel(req.userId);
  await pushGroupSystemMessage(req, req.params.id, req.userId, `${actor} удалил(а) ${targetName} из группы`);
  await emitConversationChanged(req, req.params.id, [req.params.userId]);
  res.json(await buildConversationSummary(req.params.id, req.userId));
});

// POST /api/conversations/:id/leave — leave group.
router.post("/:id/leave", async (req, res) => {
  const { conversation, participant } = await getGroupContext(req.params.id, req.userId);
  if (!conversation || conversation.type !== "group" || !participant) return res.status(404).json({ error: "Группа не найдена" });

  const { data: members } = await safe(supabase.from("conversation_participants").select("user_id").eq("conversation_id", req.params.id), { data: [], error: null });
  if (participant.role === "owner" && (members || []).length > 1) {
    return res.status(409).json({ error: "Перед выходом передайте права владельца" });
  }
  const actor = await getUserLabel(req.userId);
  if ((members || []).length === 1) {
    await supabase.from("conversation_participants").delete().eq("conversation_id", req.params.id).eq("user_id", req.userId);
    await supabase.from("conversations").delete().eq("id", req.params.id);
    req.app.get("io")?.to(`user:${req.userId}`).emit("conversation:changed", { conversationId: req.params.id, removed: true });
    return res.json({ ok: true, removed: true });
  }

  await pushGroupSystemMessage(req, req.params.id, req.userId, `${actor} покинул(а) группу`);
  const { error } = await supabase.from("conversation_participants").delete().eq("conversation_id", req.params.id).eq("user_id", req.userId);
  if (error) return res.status(500).json({ error: error.message });
  await emitConversationChanged(req, req.params.id, [req.userId]);
  res.json({ ok: true, removed: true });
});

// POST /api/conversations/:id/pin — toggle pin for current user
router.post("/:id/pin", async (req, res) => {
  const allowed = await ensureParticipant(req.params.id, req.userId);
  if (!allowed) return res.status(403).json({ error: "Not a participant" });
  const { data: part } = await supabase
    .from("conversation_participants")
    .select("pinned")
    .eq("conversation_id", req.params.id)
    .eq("user_id", req.userId)
    .single();
  const pinned = !Boolean(part?.pinned);
  const { error } = await supabase
    .from("conversation_participants")
    .update({ pinned })
    .eq("conversation_id", req.params.id)
    .eq("user_id", req.userId);
  if (error) return res.status(500).json({ error: error.message });
  req.app.get("io")?.to(`user:${req.userId}`).emit("conversation:changed", { conversationId: req.params.id, conversation: { id: req.params.id, pinned }, removed: false });
  res.json({ ok: true, pinned });
});

// POST /api/conversations/:id/mute — toggle message notifications for current user
router.post("/:id/mute", async (req, res) => {
  const allowed = await ensureParticipant(req.params.id, req.userId);
  if (!allowed) return res.status(403).json({ error: "Not a participant" });
  const { data: part } = await supabase
    .from("conversation_participants")
    .select("muted")
    .eq("conversation_id", req.params.id)
    .eq("user_id", req.userId)
    .single();
  const muted = !Boolean(part?.muted);
  const { error } = await supabase
    .from("conversation_participants")
    .update({ muted })
    .eq("conversation_id", req.params.id)
    .eq("user_id", req.userId);
  if (error) return res.status(500).json({ error: error.message });
  req.app.get("io")?.to(`user:${req.userId}`).emit("conversation:changed", { conversationId: req.params.id, conversation: { id: req.params.id, muted }, removed: false });
  res.json({ ok: true, muted });
});

// POST /api/conversations/:id/archive — toggle archive for current user.
router.post("/:id/archive", async (req, res) => {
  const allowed = await ensureParticipant(req.params.id, req.userId);
  if (!allowed) return res.status(403).json({ error: "Not a participant" });
  const { data: part, error: lookupError } = await supabase
    .from("conversation_participants")
    .select("archived")
    .eq("conversation_id", req.params.id)
    .eq("user_id", req.userId)
    .single();
  if (lookupError && /archived|schema cache|column .* does not exist/i.test(lookupError.message || "")) {
    return res.status(409).json({ error: "Сначала выполните migration_chat_organization.sql" });
  }
  if (lookupError) return res.status(500).json({ error: lookupError.message });
  const archived = !Boolean(part?.archived);
  const { error } = await supabase
    .from("conversation_participants")
    .update({ archived })
    .eq("conversation_id", req.params.id)
    .eq("user_id", req.userId);
  if (error) return res.status(500).json({ error: error.message });
  req.app.get("io")?.to(`user:${req.userId}`).emit("conversation:changed", { conversationId: req.params.id, conversation: { id: req.params.id, archived }, removed: false });
  res.json({ ok: true, archived });
});

// POST /api/conversations/:id/folder — assign a per-user organization folder.
router.post("/:id/folder", async (req, res) => {
  const allowed = await ensureParticipant(req.params.id, req.userId);
  if (!allowed) return res.status(403).json({ error: "Not a participant" });
  const folder = String(req.body?.folder || "all").toLowerCase();
  if (!CHAT_ORGANIZATION_FOLDERS.has(folder)) return res.status(400).json({ error: "Unknown chat folder" });
  const { error } = await supabase
    .from("conversation_participants")
    .update({ folder })
    .eq("conversation_id", req.params.id)
    .eq("user_id", req.userId);
  if (error && /folder|schema cache|column .* does not exist/i.test(error.message || "")) {
    return res.status(409).json({ error: "Сначала выполните migration_chat_organization.sql" });
  }
  if (error) return res.status(500).json({ error: error.message });
  req.app.get("io")?.to(`user:${req.userId}`).emit("conversation:changed", { conversationId: req.params.id, conversation: { id: req.params.id, folder }, removed: false });
  res.json({ ok: true, folder });
});

// POST /api/conversations/:id/request — accept/hide/block an incoming message request
router.post("/:id/request", async (req, res) => {
  const action = String(req.body.action || "");
  if (!["accept", "hide", "block"].includes(action)) return res.status(400).json({ error: "Invalid request action" });
  const allowed = await ensureParticipant(req.params.id, req.userId);
  if (!allowed) return res.status(403).json({ error: "Not a participant" });

  const { data: conversation } = await safe(supabase.from("conversations").select("type").eq("id", req.params.id).maybeSingle(), { data: null });
  if (conversation?.type !== "direct") return res.status(400).json({ error: "Only direct requests can be handled" });

  const { data: parts } = await safe(
    supabase.from("conversation_participants").select("user_id").eq("conversation_id", req.params.id),
    { data: [] },
  );
  const other = (parts || []).find((p) => p.user_id !== req.userId);

  if (action === "block" && other?.user_id) {
    await safe(supabase.from("user_blocks").upsert({ user_id: req.userId, blocked_id: other.user_id }, { onConflict: "user_id,blocked_id" }));
  }

  const patch = action === "accept"
    ? { request_status: "accepted", hidden: false }
    : { request_status: action === "block" ? "blocked" : "hidden", hidden: true };
  const result = await safe(
    supabase
      .from("conversation_participants")
      .update(patch)
      .eq("conversation_id", req.params.id)
      .eq("user_id", req.userId),
    { error: null },
  );
  if (result.error && /request_status|hidden|schema cache/i.test(result.error.message || "")) {
    return res.status(503).json({ error: "Run message requests migration", detail: result.error.message });
  }
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json({ ok: true, requestStatus: patch.request_status, hidden: patch.hidden });
});

// POST /api/conversations/:id/invite — create/get invite link for group
router.post("/:id/invite", async (req, res) => {
  const allowed = await ensureParticipant(req.params.id, req.userId);
  if (!allowed) return res.status(403).json({ error: "Not a participant" });
  const { data: participant } = await supabase
    .from("conversation_participants")
    .select("role")
    .eq("conversation_id", req.params.id)
    .eq("user_id", req.userId)
    .single();
  if (!["owner", "admin"].includes(participant?.role || "")) return res.status(403).json({ error: "Only group admins can create invite" });

  const { data: existing } = await supabase
    .from("conversation_invites")
    .select("code")
    .eq("conversation_id", req.params.id)
    .eq("created_by", req.userId)
    .maybeSingle();
  if (existing?.code) return res.json({ code: existing.code });

  const code = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const { data, error } = await supabase
    .from("conversation_invites")
    .insert({ conversation_id: req.params.id, code, created_by: req.userId })
    .select("code")
    .single();
  if (error) return res.status(503).json({ error: "Run conversation_invites migration", detail: error.message });
  res.status(201).json({ code: data.code });
});

// POST /api/conversations/invite/:code/join — join group by invite code
router.post("/invite/:code/join", async (req, res) => {
  const { data: invite } = await supabase
    .from("conversation_invites")
    .select("conversation_id,expires_at")
    .eq("code", req.params.code)
    .maybeSingle();
  if (!invite) return res.status(404).json({ error: "Invite not found" });
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return res.status(410).json({ error: "Invite expired" });

  await supabase.from("conversation_participants").upsert({
    conversation_id: invite.conversation_id,
    user_id: req.userId,
    role: "member",
  }, { onConflict: "conversation_id,user_id" });
  res.json({ ok: true, conversationId: invite.conversation_id });
});


// POST /api/conversations/:id/polls — create an in-chat poll.
router.post("/:id/polls", async (req, res) => {
  if (!await ensureParticipant(req.params.id, req.userId)) return res.status(403).json({ error: "Not a participant" });
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  const rawOptions = Array.isArray(req.body?.options) ? req.body.options : [];
  const options = [...new Set(rawOptions.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 10);
  const allowMultiple = Boolean(req.body?.allowMultiple);
  const anonymous = req.body?.anonymous !== false;
  if (question.length < 3 || question.length > 300) return res.status(400).json({ error: "poll_question", message: "Вопрос должен содержать от 3 до 300 символов" });
  if (options.length < 2 || options.some((option) => option.length > 120)) return res.status(400).json({ error: "poll_options", message: "Добавьте от 2 до 10 коротких вариантов" });

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: req.params.id,
      sender_id: req.userId,
      text: question,
      type: "poll",
      status: "sent",
    })
    .select("*")
    .single();
  if (messageError) {
    if (/type|poll|constraint|schema cache/i.test(messageError.message || "")) {
      return res.status(503).json({ error: "migration_required", message: "Примените migration_polls_mentions.sql" });
    }
    return res.status(500).json({ error: messageError.message });
  }

  const { data: poll, error: pollError } = await supabase
    .from("message_polls")
    .insert({
      message_id: message.id,
      conversation_id: req.params.id,
      created_by: req.userId,
      question,
      allow_multiple: allowMultiple,
      anonymous,
    })
    .select("*")
    .single();
  if (pollError || !poll) {
    await supabase.from("messages").delete().eq("id", message.id);
    return res.status(503).json({ error: "migration_required", message: "Примените migration_polls_mentions.sql" });
  }

  const optionRows = options.map((text, position) => ({ poll_id: poll.id, text, position }));
  const { error: optionsError } = await supabase.from("message_poll_options").insert(optionRows);
  if (optionsError) {
    await supabase.from("messages").delete().eq("id", message.id);
    return res.status(500).json({ error: optionsError.message });
  }

  const [serialized] = await hydrateMessages([message], req.userId);
  const io = req.app.get("io");
  io?.to(`conv:${req.params.id}`).emit("message:new", serialized);

  const [{ data: participants }, { data: conversation }] = await Promise.all([
    safe(supabase.from("conversation_participants").select("user_id,muted").eq("conversation_id", req.params.id), { data: [], error: null }),
    safe(supabase.from("conversations").select("title,avatar_url").eq("id", req.params.id).maybeSingle(), { data: null, error: null }),
  ]);
  for (const participant of participants || []) {
    if (String(participant.user_id) === String(req.userId)) continue;
    io?.to(`user:${participant.user_id}`).emit("message:push", {
      conversationId: req.params.id,
      message: serialized,
      muted: Boolean(participant.muted),
      conversationTitle: conversation?.title || "Опрос",
      avatarUrl: conversation?.avatar_url || null,
    });
  }
  res.status(201).json(serialized);
});

// POST /api/conversations/:id/messages/:messageId/poll-vote — replace own poll vote.
router.post("/:id/messages/:messageId/poll-vote", async (req, res) => {
  if (!await ensureParticipant(req.params.id, req.userId)) return res.status(403).json({ error: "Not a participant" });
  const { data: poll, error: pollError } = await supabase
    .from("message_polls")
    .select("id,message_id,conversation_id,allow_multiple,closed_at")
    .eq("message_id", req.params.messageId)
    .eq("conversation_id", req.params.id)
    .maybeSingle();
  if (pollError) return res.status(503).json({ error: "migration_required", message: "Примените migration_polls_mentions.sql" });
  if (!poll) return res.status(404).json({ error: "poll_not_found", message: "Опрос не найден" });
  if (poll.closed_at) return res.status(409).json({ error: "poll_closed", message: "Опрос уже завершён" });

  const requested = [...new Set((Array.isArray(req.body?.optionIds) ? req.body.optionIds : []).map(String).filter(Boolean))];
  if (!poll.allow_multiple && requested.length > 1) return res.status(400).json({ error: "single_choice", message: "Можно выбрать только один вариант" });
  const { data: validOptions } = await supabase.from("message_poll_options").select("id").eq("poll_id", poll.id);
  const validIds = new Set((validOptions || []).map((option) => String(option.id)));
  if (requested.some((id) => !validIds.has(id))) return res.status(400).json({ error: "invalid_option", message: "Вариант ответа не найден" });

  await supabase.from("message_poll_votes").delete().eq("poll_id", poll.id).eq("user_id", req.userId);
  if (requested.length > 0) {
    const { error: voteError } = await supabase.from("message_poll_votes").insert(requested.map((optionId) => ({
      poll_id: poll.id,
      option_id: optionId,
      user_id: req.userId,
    })));
    if (voteError) return res.status(500).json({ error: voteError.message });
  }

  const pollMap = await getPollMap([req.params.messageId], req.userId);
  const serialized = pollMap.get(String(req.params.messageId));
  if (!serialized) return res.status(500).json({ error: "poll_unavailable" });
  const io = req.app.get("io");
  io?.to(`conv:${req.params.id}`).emit("poll:updated", {
    messageId: req.params.messageId,
    conversationId: req.params.id,
    poll: { ...serialized, myOptionIds: [] },
  });
  io?.to(`user:${req.userId}`).emit("poll:updated", {
    messageId: req.params.messageId,
    conversationId: req.params.id,
    poll: serialized,
  });
  res.json(serialized);
});

// POST /api/conversations/:id/messages/:messageId/poll-close — close a poll.
router.post("/:id/messages/:messageId/poll-close", async (req, res) => {
  if (!await ensureParticipant(req.params.id, req.userId)) return res.status(403).json({ error: "Not a participant" });
  const [{ data: message }, { data: participant }, { data: poll }] = await Promise.all([
    supabase.from("messages").select("id,sender_id").eq("id", req.params.messageId).eq("conversation_id", req.params.id).maybeSingle(),
    supabase.from("conversation_participants").select("role").eq("conversation_id", req.params.id).eq("user_id", req.userId).maybeSingle(),
    supabase.from("message_polls").select("id,closed_at").eq("message_id", req.params.messageId).eq("conversation_id", req.params.id).maybeSingle(),
  ]);
  if (!message || !poll) return res.status(404).json({ error: "poll_not_found" });
  if (String(message.sender_id) !== String(req.userId) && !["owner", "admin"].includes(participant?.role || "")) {
    return res.status(403).json({ error: "forbidden", message: "Завершить опрос может автор или администратор" });
  }
  const closedAt = poll.closed_at || new Date().toISOString();
  const { error } = await supabase.from("message_polls").update({ closed_at: closedAt }).eq("id", poll.id);
  if (error) return res.status(500).json({ error: error.message });
  const pollMap = await getPollMap([req.params.messageId], req.userId);
  const serialized = pollMap.get(String(req.params.messageId));
  const payload = { messageId: req.params.messageId, conversationId: req.params.id, poll: { ...serialized, myOptionIds: [] } };
  req.app.get("io")?.to(`conv:${req.params.id}`).emit("poll:updated", payload);
  res.json(serialized);
});

// GET /api/conversations/:id/pinned-messages — newest pins first.
router.get("/:id/pinned-messages", async (req, res) => {
  if (!await ensureParticipant(req.params.id, req.userId)) return res.status(403).json({ error: "Not a participant" });

  let result = await safe(
    supabase
      .from("messages")
      .select("*, sender:users!messages_sender_id_fkey(id,username,display_name,avatar_url,name_color,is_premium,avatar_frame,verified)")
      .eq("conversation_id", req.params.id)
      .not("pinned_at", "is", null)
      .is("deleted_at", null)
      .order("pinned_at", { ascending: false })
      .limit(50),
    { data: [], error: null },
  );
  if (result.error && /relationship|schema cache|sender|verified/i.test(result.error.message || "")) {
    result = await safe(
      supabase.from("messages").select("*").eq("conversation_id", req.params.id).not("pinned_at", "is", null).is("deleted_at", null).order("pinned_at", { ascending: false }).limit(50),
      { data: [], error: null },
    );
  }
  if (result.error) {
    if (/pinned_at|pinned_by|schema cache|column .* does not exist/i.test(result.error.message || "")) {
      return res.status(503).json({ error: "migration_required", message: "Примените migration_message_pins.sql" });
    }
    return res.status(500).json({ error: result.error.message });
  }
  res.json(await hydrateMessages(result.data || [], req.userId));
});

// POST /api/conversations/:id/messages/:messageId/pin — toggle a message pin.
router.post("/:id/messages/:messageId/pin", async (req, res) => {
  if (!await ensureParticipant(req.params.id, req.userId)) return res.status(403).json({ error: "Not a participant" });
  if (!await canManageMessagePins(req.params.id, req.userId)) return res.status(403).json({ error: "Only chat admins can pin messages" });

  const { data: message, error: lookupError } = await supabase
    .from("messages")
    .select("id,conversation_id,deleted_at,pinned_at,pinned_by")
    .eq("id", req.params.messageId)
    .eq("conversation_id", req.params.id)
    .maybeSingle();
  if (lookupError) {
    if (/pinned_at|pinned_by|schema cache|column .* does not exist/i.test(lookupError.message || "")) {
      return res.status(503).json({ error: "migration_required", message: "Примените migration_message_pins.sql" });
    }
    return res.status(500).json({ error: lookupError.message });
  }
  if (!message) return res.status(404).json({ error: "Message not found" });
  if (message.deleted_at) return res.status(409).json({ error: "Deleted messages cannot be pinned" });

  const pinned = !message.pinned_at;
  const pinnedAt = pinned ? new Date().toISOString() : null;
  const pinnedBy = pinned ? req.userId : null;
  const { error } = await supabase.from("messages").update({ pinned_at: pinnedAt, pinned_by: pinnedBy }).eq("id", message.id);
  if (error) {
    if (/pinned_at|pinned_by|schema cache|column .* does not exist/i.test(error.message || "")) {
      return res.status(503).json({ error: "migration_required", message: "Примените migration_message_pins.sql" });
    }
    return res.status(500).json({ error: error.message });
  }

  const payload = { messageId: message.id, conversationId: req.params.id, pinned, pinnedAt, pinnedBy };
  req.app.get("io")?.to(`conv:${req.params.id}`).emit("message:pinned", payload);
  res.json({ ok: true, ...payload });
});


// GET /api/conversations/:id/scheduled — pending messages created by the current user.
router.get("/:id/scheduled", async (req, res) => {
  if (!await ensureParticipant(req.params.id, req.userId)) return res.status(403).json({ error: "Not a participant" });
  const result = await safe(
    supabase
      .from("scheduled_messages")
      .select("*")
      .eq("conversation_id", req.params.id)
      .eq("sender_id", req.userId)
      .in("status", ["pending", "processing", "failed"])
      .order("scheduled_at", { ascending: true })
      .limit(100),
    { data: [], error: null },
  );
  if (result.error) {
    if (/scheduled_messages|schema cache|relation .* does not exist/i.test(result.error.message || "")) {
      return res.status(503).json({ error: "migration_required", message: "Примените migration_scheduled_messages.sql" });
    }
    return res.status(500).json({ error: result.error.message });
  }
  res.json((result.data || []).map(serializeScheduledMessage));
});

// POST /api/conversations/:id/scheduled — schedule a message on the server.
router.post("/:id/scheduled", async (req, res) => {
  if (!await ensureParticipant(req.params.id, req.userId)) return res.status(403).json({ error: "Not a participant" });
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const type = SCHEDULED_MESSAGE_TYPES.has(String(req.body?.type || "text")) ? String(req.body?.type || "text") : "text";
  const attachmentUrl = cleanScheduledUrl(req.body?.attachmentUrl);
  const attachmentThumbnailUrl = cleanScheduledUrl(req.body?.attachmentThumbnailUrl);
  const replyTo = typeof req.body?.replyTo === "string" && req.body.replyTo.length <= 128 ? req.body.replyTo : null;
  const scheduledAt = new Date(req.body?.scheduledAt);
  const now = Date.now();
  if (Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ error: "invalid_schedule", message: "Укажите дату отправки" });
  if (scheduledAt.getTime() < now + 30_000) return res.status(400).json({ error: "invalid_schedule", message: "Выберите время минимум на 30 секунд позже" });
  if (scheduledAt.getTime() > now + 366 * 24 * 60 * 60 * 1000) return res.status(400).json({ error: "invalid_schedule", message: "Нельзя планировать дальше чем на год" });
  if (!text && !attachmentUrl) return res.status(400).json({ error: "empty_message", message: "Добавьте текст или вложение" });
  if (text.length > 4096) return res.status(400).json({ error: "message_too_long", message: "Сообщение слишком длинное" });

  const rate = await consumeRateLimitDistributed(`scheduled:create:${req.userId}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return rateLimitResponse(res, rate, "Слишком много запланированных сообщений");

  const ban = await hasActivePunishment(req.userId, "ban");
  if (ban) return res.status(403).json({ error: "punished", message: punishmentMessage(ban), type: "ban" });
  const muteDm = await hasActivePunishment(req.userId, "mute_dm");
  if (muteDm) return res.status(403).json({ error: "punished", message: punishmentMessage(muteDm), type: "mute_dm" });

  const trust = await getTrustProfile(req.userId);
  if (hasRestriction(trust, "messagingDisabled")) {
    return res.status(403).json({ error: "restricted", message: "Сообщения временно ограничены системой безопасности" });
  }
  const recipientParts = await safe(
    supabase
      .from("conversation_participants")
      .select("user_id,request_status")
      .eq("conversation_id", req.params.id)
      .neq("user_id", req.userId),
    { data: [], error: null },
  );
  if ((recipientParts.data || []).some((part) => part.request_status === "pending") && hasRestriction(trust, "noUnknownDm")) {
    return res.status(403).json({ error: "restricted", message: "Сообщения незнакомым людям временно ограничены" });
  }

  if (text) {
    const linkRisk = await assessLinksWithRules(text);
    if (linkRisk.blocked.length > 0) {
      await logSpamEvent({ userId: req.userId, eventType: "blocked_scheduled_link", targetType: "conversation", targetId: req.params.id, meta: { domains: linkRisk.blocked } });
      return res.status(400).json({ error: "blocked_link", message: "Эта ссылка заблокирована системой безопасности" });
    }
    if (hasRestriction(trust, "noLinks") && linkRisk.links.length > 0) {
      return res.status(403).json({ error: "restricted", message: "Ссылки временно ограничены системой безопасности" });
    }
  }

  if (replyTo) {
    const replyResult = await safe(
      supabase.from("messages").select("id").eq("id", replyTo).eq("conversation_id", req.params.id).maybeSingle(),
      { data: null, error: null },
    );
    if (!replyResult.data) return res.status(400).json({ error: "invalid_reply", message: "Сообщение для ответа не найдено" });
  }

  const payload = {
    conversation_id: req.params.id,
    sender_id: req.userId,
    text: text || null,
    type,
    attachment_url: attachmentUrl,
    attachment_thumbnail_url: attachmentThumbnailUrl,
    media_width: Number.isInteger(req.body?.mediaWidth) ? Math.max(0, Math.min(20000, req.body.mediaWidth)) : null,
    media_height: Number.isInteger(req.body?.mediaHeight) ? Math.max(0, Math.min(20000, req.body.mediaHeight)) : null,
    media_duration_sec: Number.isInteger(req.body?.mediaDurationSec) ? Math.max(0, Math.min(86400, req.body.mediaDurationSec)) : null,
    reply_to: replyTo,
    scheduled_at: scheduledAt.toISOString(),
    status: "pending",
  };
  const result = await safe(supabase.from("scheduled_messages").insert(payload).select("*").single(), { data: null, error: null });
  if (result.error) {
    if (/scheduled_messages|schema cache|relation .* does not exist/i.test(result.error.message || "")) {
      return res.status(503).json({ error: "migration_required", message: "Примените migration_scheduled_messages.sql" });
    }
    return res.status(500).json({ error: result.error.message });
  }
  const serialized = serializeScheduledMessage(result.data);
  req.app.get("io")?.to(`user:${req.userId}`).emit("scheduled:changed", { action: "created", scheduled: serialized });
  res.status(201).json(serialized);
});

// POST /api/conversations/:id/scheduled/:scheduledId/retry — retry a failed scheduled message.
router.post("/:id/scheduled/:scheduledId/retry", async (req, res) => {
  if (!await ensureParticipant(req.params.id, req.userId)) return res.status(403).json({ error: "Not a participant" });
  const scheduledAt = new Date(Date.now() + 30_000).toISOString();
  const result = await safe(
    supabase
      .from("scheduled_messages")
      .update({ status: "pending", scheduled_at: scheduledAt, last_error: null, updated_at: new Date().toISOString() })
      .eq("id", req.params.scheduledId)
      .eq("conversation_id", req.params.id)
      .eq("sender_id", req.userId)
      .eq("status", "failed")
      .select("*")
      .maybeSingle(),
    { data: null, error: null },
  );
  if (result.error) {
    if (/scheduled_messages|schema cache|relation .* does not exist/i.test(result.error.message || "")) {
      return res.status(503).json({ error: "migration_required", message: "Примените migration_scheduled_messages.sql" });
    }
    return res.status(500).json({ error: result.error.message });
  }
  if (!result.data) return res.status(409).json({ error: "not_retryable", message: "Сообщение уже отправляется или отменено" });
  const serialized = serializeScheduledMessage(result.data);
  req.app.get("io")?.to(`user:${req.userId}`).emit("scheduled:changed", { action: "created", scheduled: serialized });
  res.json(serialized);
});

// DELETE /api/conversations/:id/scheduled/:scheduledId — cancel own pending message.
router.delete("/:id/scheduled/:scheduledId", async (req, res) => {
  if (!await ensureParticipant(req.params.id, req.userId)) return res.status(403).json({ error: "Not a participant" });
  const lookup = await safe(
    supabase
      .from("scheduled_messages")
      .select("id,status")
      .eq("id", req.params.scheduledId)
      .eq("conversation_id", req.params.id)
      .eq("sender_id", req.userId)
      .maybeSingle(),
    { data: null, error: null },
  );
  if (lookup.error) {
    if (/scheduled_messages|schema cache|relation .* does not exist/i.test(lookup.error.message || "")) {
      return res.status(503).json({ error: "migration_required", message: "Примените migration_scheduled_messages.sql" });
    }
    return res.status(500).json({ error: lookup.error.message });
  }
  if (!lookup.data) return res.status(404).json({ error: "not_found", message: "Запланированное сообщение не найдено" });
  if (!["pending", "failed"].includes(lookup.data.status)) return res.status(409).json({ error: "already_processing", message: "Сообщение уже отправляется" });
  const result = await safe(
    supabase.from("scheduled_messages").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", lookup.data.id).in("status", ["pending", "failed"]),
    { data: null, error: null },
  );
  if (result.error) return res.status(500).json({ error: result.error.message });
  req.app.get("io")?.to(`user:${req.userId}`).emit("scheduled:changed", { action: "cancelled", scheduledId: lookup.data.id, conversationId: req.params.id });
  res.json({ ok: true });
});

// GET /api/conversations/:id/messages/:messageId/context — a small window around a message.
router.get("/:id/messages/:messageId/context", async (req, res) => {
  if (!await ensureParticipant(req.params.id, req.userId)) return res.status(403).json({ error: "Not a participant" });
  const { data: target, error: targetError } = await supabase
    .from("messages")
    .select("id,created_at")
    .eq("id", req.params.messageId)
    .eq("conversation_id", req.params.id)
    .maybeSingle();
  if (targetError) return res.status(500).json({ error: targetError.message });
  if (!target) return res.status(404).json({ error: "Message not found" });

  const [beforeResult, afterResult] = await Promise.all([
    safe(supabase.from("messages").select("*").eq("conversation_id", req.params.id).lte("created_at", target.created_at).order("created_at", { ascending: false }).limit(30), { data: [], error: null }),
    safe(supabase.from("messages").select("*").eq("conversation_id", req.params.id).gt("created_at", target.created_at).order("created_at", { ascending: true }).limit(30), { data: [], error: null }),
  ]);
  if (beforeResult.error || afterResult.error) return res.status(500).json({ error: beforeResult.error?.message || afterResult.error?.message });
  const rows = [...(beforeResult.data || []).reverse(), ...(afterResult.data || [])];
  const unique = [...new Map(rows.map((row) => [String(row.id), row])).values()];
  res.json(await hydrateMessages(unique, req.userId));
});

// GET /api/conversations/:id/messages
// Supports cursor pagination without breaking older clients:
//   ?paged=1&limit=80&before=<ISO>  -> older history
//   ?paged=1&limit=80&after=<ISO>   -> messages missed after reconnect
router.get("/:id/messages", async (req, res) => {
  const allowed = await ensureParticipant(req.params.id, req.userId);
  if (!allowed) return res.status(403).json({ error: "Not a participant" });

  const { data: viewerParticipant } = await safe(
    supabase
      .from("conversation_participants")
      .select("last_read_at")
      .eq("conversation_id", req.params.id)
      .eq("user_id", req.userId)
      .maybeSingle(),
    { data: null, error: null },
  );
  const previousLastReadAt = viewerParticipant?.last_read_at ? Date.parse(viewerParticipant.last_read_at) : 0;

  const requestedLimit = Number.parseInt(String(req.query.limit || "80"), 10);
  const limit = Math.min(100, Math.max(20, Number.isFinite(requestedLimit) ? requestedLimit : 80));
  const before = typeof req.query.before === "string" && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : null;
  const after = typeof req.query.after === "string" && !Number.isNaN(Date.parse(req.query.after)) ? req.query.after : null;
  const paged = req.query.paged === "1" || Boolean(before || after);
  if (before && after) return res.status(400).json({ error: "Use either before or after cursor" });

  const buildMessagesQuery = (select) => {
    let query = supabase
      .from("messages")
      .select(select)
      .eq("conversation_id", req.params.id);
    if (before) query = query.lt("created_at", before);
    if (after) query = query.gt("created_at", after);
    return query
      .order("created_at", { ascending: Boolean(after) })
      .limit(limit + 1);
  };

  let messagesResult = await safe(
    buildMessagesQuery("*, sender:users!messages_sender_id_fkey(id,username,display_name,avatar_url,name_color,is_premium,avatar_frame,verified)"),
    { data: [], error: null },
  );
  if (messagesResult.error && /relationship|schema cache|sender|verified/i.test(messagesResult.error.message || "")) {
    messagesResult = await safe(buildMessagesQuery("*"), { data: [], error: null });
  }
  const { data: rawMessages, error } = messagesResult;
  if (error) return res.status(500).json({ error: error.message });

  const hasMore = (rawMessages || []).length > limit;
  const pageRows = (rawMessages || []).slice(0, limit);
  const data = after ? pageRows : pageRows.slice().reverse();

  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", req.params.id)
    .eq("user_id", req.userId);

  await safe(
    supabase
      .from("message_mentions")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", req.params.id)
      .eq("user_id", req.userId)
      .is("read_at", null),
    { data: null, error: null },
  );

  const unreadRows = data.filter((message) => (
    message.sender_id !== req.userId
    && (!previousLastReadAt || Date.parse(message.created_at || message.createdAt) > previousLastReadAt)
  ));
  const touchedIds = new Set();
  for (const row of unreadRows) {
    const receipt = await markMessageReceipt({
      messageId: row.id,
      conversationId: req.params.id,
      userId: req.userId,
      read: true,
    });
    if (receipt.ok) {
      touchedIds.add(row.id);
    } else if (receipt.missing) {
      await supabase.from("messages").update({ status: "read" }).eq("id", row.id);
      row.status = "read";
      touchedIds.add(row.id);
    }
  }

  const hydrated = await hydrateMessages(data, req.userId);
  const io = req.app.get("io");
  for (const message of hydrated) {
    if (!touchedIds.has(message.id)) continue;
    const payload = {
      messageId: message.id,
      userId: req.userId,
      readAt: new Date().toISOString(),
      status: message.status,
      readBy: message.readBy || [],
      deliveredTo: message.deliveredTo || [],
    };
    io?.to(`conv:${req.params.id}`).emit("message:receipt", payload);
    io?.to(`conv:${req.params.id}`).emit("message:read", payload);
    io?.to(`conv:${req.params.id}`).emit("message:status", {
      messageId: message.id,
      status: message.status,
      readBy: message.readBy || [],
      deliveredTo: message.deliveredTo || [],
    });
  }

  if (!paged) return res.json(hydrated);
  return res.json({
    messages: hydrated,
    hasMore,
    nextBefore: hydrated[0]?.createdAt || null,
    nextAfter: hydrated[hydrated.length - 1]?.createdAt || null,
  });
});

module.exports = { conversationsRouter: router };
