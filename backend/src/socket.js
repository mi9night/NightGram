// =============================================================================
//  Socket.io — real-time messaging, presence, post events
//  Authenticates via the JWT passed in `auth.token`.
// =============================================================================

const { verifyAccessToken } = require("./lib/jwt");
const { supabase } = require("./lib/supabase");
const { blockState, canViewLastSeen, getPrivacySettings } = require("./lib/privacy");
const { getReceiptSummaries, markMessageReceipt, summarizeSingleMessage } = require("./lib/messageReceipts");
const { consumeRateLimitDistributed, checkDuplicate, assessLinksWithRules, getTrustProfile, trustLimit, shouldRestrictLinks, hasRestriction, socketRateLimitAck, logSpamEvent, createModerationFlag } = require("./lib/safety");
const { hasActivePunishment, punishmentMessage } = require("./lib/punishments");
const { syncMessageMentions } = require("./lib/pollsMentions");
const { MAX_GROUP_CALL_PARTICIPANTS, createCallRoom, acceptParticipant, rejectParticipant, leaveParticipant } = require("./lib/call-room-state");
const { createCallHistory, markParticipantAccepted, markParticipantRejected, markParticipantLeft, finishCallHistory } = require("./lib/call-history");
const { sendPushToUsers } = require("./lib/push");
const { sendNativePushToUsers } = require("./lib/native-push");
const { clampRingTimeoutSeconds, admitCall } = require("./lib/call-admission");

const ALLOWED_MESSAGE_TYPES = new Set(["text", "image", "video", "audio", "file", "sticker"]);

function cleanId(value, max = 128) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= max && /^[a-zA-Z0-9._:-]+$/.test(text) ? text : null;
}

function cleanAttachmentUrl(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (text.length > 2048) return null;
  try {
    const url = new URL(text);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanOptionalInt(value, max) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) return null;
  return number;
}

function safeSocketError(error, fallback = "Не удалось выполнить действие") {
  console.error("[Socket]", error?.stack || error?.message || error);
  return { error: "server_error", message: fallback };
}

async function ensureParticipant(conversationId, userId) {
  if (!conversationId || !userId) return false;
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

function serializeSender(sender, fallbackId = "") {
  if (!sender) return undefined;
  const username = String(sender.username || "");
  const avatarFrame = sender.avatar_frame ?? sender.avatarFrame ?? null;
  return {
    id: String(sender.id || fallbackId || ""),
    username,
    displayName: String(sender.display_name || sender.displayName || username || "Пользователь"),
    avatarUrl: sender.avatar_url ?? sender.avatarUrl ?? null,
    nameColor: String(sender.name_color || sender.nameColor || "#ffffff"),
    isPremium: Boolean(sender.is_premium ?? sender.isPremium ?? false),
    avatarFrame,
    verified: Boolean(sender.verified ?? sender.isVerified ?? avatarFrame === "verified"),
  };
}

async function fetchSocketSender(userId) {
  let result = await supabase
    .from("users")
    .select("id,username,display_name,avatar_url,name_color,is_premium,avatar_frame,verified")
    .eq("id", userId)
    .maybeSingle();
  if (result.error && /verified|schema cache/i.test(result.error.message || "")) {
    result = await supabase
      .from("users")
      .select("id,username,display_name,avatar_url,name_color,is_premium,avatar_frame")
      .eq("id", userId)
      .maybeSingle();
  }
  return result.data || null;
}

function serializeMessage(row, { clientId, reactions = [], receiptSummary = null } = {}) {
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
    ...((clientId || row.client_id || row.clientId) ? {
      clientId: clientId || row.client_id || row.clientId,
      client_id: clientId || row.client_id || row.clientId,
    } : {}),
  };
}

function isMissingClientIdColumn(error) {
  return Boolean(error && /client_id|schema cache|column .* does not exist/i.test(error.message || ""));
}

async function insertMessageIdempotent(payload) {
  const { clientId, ...row } = payload;
  const stripOptionalColumns = (input) => {
    const {
      attachment_thumbnail_url: _thumbnail,
      media_width: _width,
      media_height: _height,
      media_duration_sec: _duration,
      ...legacy
    } = input;
    return legacy;
  };
  const missingOptionalColumn = (error) => Boolean(error && /attachment_thumbnail_url|media_width|media_height|media_duration_sec|schema cache|column .* does not exist/i.test(error.message || ""));

  const insertRow = async (input, includeClientId = true) => {
    const record = includeClientId && clientId ? { ...input, client_id: clientId } : input;
    let result = await supabase.from("messages").insert(record).select("*").single();
    if (result.error && missingOptionalColumn(result.error)) {
      const legacyRecord = includeClientId && clientId
        ? { ...stripOptionalColumns(input), client_id: clientId }
        : stripOptionalColumns(input);
      result = await supabase.from("messages").insert(legacyRecord).select("*").single();
    }
    return result;
  };

  if (!clientId) {
    const result = await insertRow(row, false);
    return { ...result, deduplicated: false };
  }

  const inserted = await insertRow(row, true);
  if (!inserted.error) return { ...inserted, deduplicated: false };

  if (inserted.error.code === "23505") {
    const existing = await supabase
      .from("messages")
      .select("*")
      .eq("sender_id", row.sender_id)
      .eq("client_id", clientId)
      .maybeSingle();
    if (!existing.error && existing.data) return { data: existing.data, error: null, deduplicated: true };
  }

  // Backward compatibility for deployments where migration_message_client_ids.sql
  // has not been applied yet. Sending still works, only cross-retry dedupe is absent.
  if (isMissingClientIdColumn(inserted.error)) {
    const fallback = await insertRow(row, false);
    return { ...fallback, deduplicated: false };
  }

  return { ...inserted, deduplicated: false };
}

function setupSocket(io) {
  const activeCalls = new Map();
  const activeUserSockets = new Map();
  const callDisconnectTimers = new Map();

  async function emitPresenceRespectingPrivacy(userId, payload) {
    const viewers = [...activeUserSockets.keys()].filter((viewerId) => String(viewerId) !== String(userId));
    for (const viewerId of viewers) {
      if (await canViewLastSeen(userId, viewerId)) io.to(`user:${viewerId}`).emit("presence:update", payload);
    }
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  async function pushSystemMessage(conversationId, senderId, text) {
    const { data: msg, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        text,
        type: "system",
        status: "sent",
      })
      .select("*")
      .single();
    if (error || !msg) return null;

    const receiptSummaries = await getReceiptSummaries([msg]);
    const serialized = serializeMessage(msg, { reactions: [], receiptSummary: receiptSummaries.get(msg.id) });
    io.to(`conv:${conversationId}`).emit("message:new", serialized);

    const [{ data: participants }, { data: conv }] = await Promise.all([
      supabase
        .from("conversation_participants")
        .select("user_id,muted")
        .eq("conversation_id", conversationId),
      supabase
        .from("conversations")
        .select("title,avatar_url,type,channel_id")
        .eq("id", conversationId)
        .maybeSingle(),
    ]);

    for (const participant of participants || []) {
      if (participant.user_id === senderId) continue;
      io.to(`user:${participant.user_id}`).emit("message:push", {
        conversationId,
        message: serialized,
        muted: Boolean(participant.muted),
        conversationTitle: conv?.title || "Звонок",
        avatarUrl: conv?.avatar_url || null,
        conversationKind: conv?.channel_id ? "channel" : (conv?.type || "group"),
      });
    }
    return serialized;
  }

  async function emitReceiptUpdate(conversationId, messageId, userId, kind, timestamp) {
    const summarized = await summarizeSingleMessage(messageId);
    if (!summarized) return;
    const payload = {
      messageId,
      userId,
      status: summarized.summary.status,
      readBy: summarized.summary.readBy || [],
      deliveredTo: summarized.summary.deliveredTo || [],
      ...(kind === "read" ? { readAt: timestamp } : { deliveredAt: timestamp }),
    };
    io.to(`conv:${conversationId}`).emit("message:receipt", payload);
    io.to(`conv:${conversationId}`).emit(kind === "read" ? "message:read" : "message:delivered", payload);
    io.to(`conv:${conversationId}`).emit("message:status", {
      messageId,
      status: summarized.summary.status,
      readBy: summarized.summary.readBy || [],
      deliveredTo: summarized.summary.deliveredTo || [],
    });
  }

  // Auth middleware
  io.use(async (socket, next) => {
    const address = socket.handshake.address || socket.conn?.remoteAddress || "unknown";
    const handshakeLimit = await consumeRateLimitDistributed(`socket:handshake:${address}`, { limit: 60, windowMs: 60 * 1000 });
    if (!handshakeLimit.allowed) {
      const error = new Error("Too many socket connections");
      error.data = { code: "rate_limited", retryAfter: handshakeLimit.retryAfter || 1 };
      return next(error);
    }

    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token || token.length > 4096) return next(new Error("No token"));
    try {
      const payload = verifyAccessToken(token);
      const userLimit = await consumeRateLimitDistributed(`socket:handshake:user:${payload.sub}`, { limit: 40, windowMs: 60 * 1000 });
      if (!userLimit.allowed) {
        const error = new Error("Too many socket connections");
        error.data = { code: "rate_limited", retryAfter: userLimit.retryAfter || 1 };
        return next(error);
      }
      socket.userId = payload.sub;
      socket.username = payload.username;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    // Join personal room (used for webhook/admin-driven events like premium/coins/notifications)
    socket.join(`user:${socket.userId}`);
    const pendingCallDisconnect = callDisconnectTimers.get(socket.userId);
    if (pendingCallDisconnect) clearTimeout(pendingCallDisconnect);
    callDisconnectTimers.delete(socket.userId);

    // Mark online. Keep a per-process socket count so closing one tab does not mark user offline while another tab is open.
    const count = activeUserSockets.get(socket.userId) || 0;
    if (count >= 12) {
      socket.emit("server:error", { error: "too_many_connections", message: "Слишком много одновременных подключений" });
      socket.disconnect(true);
      return;
    }
    activeUserSockets.set(socket.userId, count + 1);
    supabase
      .from("presence")
      .upsert({ user_id: socket.userId, is_online: true, last_seen: new Date().toISOString() });
    if (count === 0) void emitPresenceRespectingPrivacy(socket.userId, { userId: socket.userId, isOnline: true, lastSeen: new Date().toISOString() });

    // ---- Conversations / rooms ----
    socket.on("conversation:join", async (conversationId, ack) => {
      const safeConversationId = cleanId(conversationId);
      if (!safeConversationId) return ack?.({ error: "invalid_conversation" });
      const allowed = await ensureParticipant(safeConversationId, socket.userId);
      if (!allowed) return ack?.({ error: "Not a participant" });
      socket.join(`conv:${safeConversationId}`);
      ack?.({ ok: true });
    });

    socket.on("conversation:leave", (conversationId) => {
      if (conversationId) socket.leave(`conv:${conversationId}`);
    });

    // ---- Messaging ----
    socket.on("message:send", async (payload = {}, ack) => {
      try {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ack?.({ error: "invalid_payload" });
        const conversationId = cleanId(payload.conversationId);
        const clientId = payload.clientId ? cleanId(payload.clientId) : null;
        const text = typeof payload.text === "string" ? payload.text.trim() : "";
        const attachmentUrl = cleanAttachmentUrl(payload.attachmentUrl);
        const attachmentThumbnailUrl = cleanAttachmentUrl(payload.attachmentThumbnailUrl);
        const mediaWidth = cleanOptionalInt(payload.mediaWidth, 16384);
        const mediaHeight = cleanOptionalInt(payload.mediaHeight, 16384);
        const mediaDurationSec = cleanOptionalInt(payload.mediaDurationSec, 86400);
        const replyTo = payload.replyTo ? cleanId(payload.replyTo) : null;
        const messageType = ALLOWED_MESSAGE_TYPES.has(payload.type) ? payload.type : (attachmentUrl ? "image" : "text");

        if (!conversationId) return ack?.({ error: "invalid_conversation", message: "Некорректный чат" });
        if (payload.clientId && !clientId) return ack?.({ error: "invalid_client_id" });
        if (typeof payload.text === "string" && payload.text.length > 8000) return ack?.({ error: "message_too_long", message: "Сообщение слишком длинное" });
        if (payload.attachmentUrl && !attachmentUrl) return ack?.({ error: "invalid_attachment", message: "Некорректная ссылка на вложение" });
        if (payload.attachmentThumbnailUrl && !attachmentThumbnailUrl) return ack?.({ error: "invalid_thumbnail", message: "Некорректная миниатюра" });
        if (payload.mediaWidth !== undefined && mediaWidth === null) return ack?.({ error: "invalid_media_width" });
        if (payload.mediaHeight !== undefined && mediaHeight === null) return ack?.({ error: "invalid_media_height" });
        if (payload.mediaDurationSec !== undefined && mediaDurationSec === null) return ack?.({ error: "invalid_media_duration" });
        if (payload.replyTo && !replyTo) return ack?.({ error: "invalid_reply" });
        if (!text && !attachmentUrl && messageType !== "sticker") return ack?.({ error: "empty_message", message: "Пустое сообщение" });

        const allowed = await ensureParticipant(conversationId, socket.userId);
        if (!allowed) return ack?.({ error: "Not a participant" });

        const ban = await hasActivePunishment(socket.userId, "ban");
        if (ban) return ack?.({ error: "punished", message: punishmentMessage(ban), type: "ban" });
        const muteDm = await hasActivePunishment(socket.userId, "mute_dm");
        if (muteDm) return ack?.({ error: "punished", message: punishmentMessage(muteDm), type: "mute_dm" });

        const trust = await getTrustProfile(socket.userId);
        const overallLimit = await consumeRateLimitDistributed(`messages:send:${socket.userId}`, { limit: trustLimit(80, trust, { new: 0.3, low: 0.55, trusted: 1.4, staff: 4 }), windowMs: 60 * 1000 });
        if (!overallLimit.allowed) {
          await logSpamEvent({ userId: socket.userId, eventType: "message_rate_limited", targetType: "conversation", targetId: conversationId, meta: { retryAfter: overallLimit.retryAfter, trust } });
          return socketRateLimitAck(ack, overallLimit, "Слишком много сообщений. Подожди немного.");
        }

        const normalizedText = text;
        const duplicate = checkDuplicate(`messages:text:${socket.userId}`, normalizedText, { limit: trust.level === "new" ? 3 : 5, windowMs: 10 * 60 * 1000 });
        if (!duplicate.allowed) {
          await logSpamEvent({ userId: socket.userId, eventType: "duplicate_message", targetType: "conversation", targetId: conversationId, fingerprint: duplicate.fingerprint, meta: { count: duplicate.count } });
          await createModerationFlag({ userId: socket.userId, type: "duplicate_message", severity: 2, reason: "Повторяющиеся сообщения", meta: { conversationId, count: duplicate.count } });
          return socketRateLimitAck(ack, duplicate, "Похожее сообщение уже отправлялось несколько раз. Подожди немного.");
        }

        const linkRisk = await assessLinksWithRules(normalizedText);
        const linkCount = linkRisk.links.length;
        if (linkRisk.blocked.length > 0) {
          await logSpamEvent({ userId: socket.userId, eventType: "blocked_message_link", targetType: "conversation", targetId: conversationId, meta: { domains: linkRisk.blocked, trust } });
          await createModerationFlag({ userId: socket.userId, type: "blocked_link_message", severity: 4, reason: "Заблокированная ссылка в сообщении", meta: { conversationId, domains: linkRisk.blocked } });
          return ack?.({ error: "blocked_link", message: "Эта ссылка заблокирована системой безопасности" });
        }
        if (linkCount > 0) {
          const baseLimit = shouldRestrictLinks(trust) ? (trust.level === "new" ? 2 : 4) : 8;
          const linkLimit = await consumeRateLimitDistributed(`messages:links:${socket.userId}`, { limit: baseLimit, windowMs: shouldRestrictLinks(trust) ? 60 * 60 * 1000 : 10 * 60 * 1000, cost: linkCount });
          if (!linkLimit.allowed) {
            await logSpamEvent({ userId: socket.userId, eventType: "message_link_rate_limited", targetType: "conversation", targetId: conversationId, meta: { retryAfter: linkLimit.retryAfter, linkCount, domains: linkRisk.domains, trust } });
            return socketRateLimitAck(ack, linkLimit, shouldRestrictLinks(trust) ? "Для новых аккаунтов ссылки в ЛС ограничены. Подожди немного." : "Слишком много ссылок в сообщениях. Подожди немного.");
          }
        }
        if (linkRisk.score >= 25) {
          await logSpamEvent({ userId: socket.userId, eventType: "suspicious_message_link", targetType: "conversation", targetId: conversationId, meta: { score: linkRisk.score, domains: linkRisk.domains, suspicious: linkRisk.suspicious, trust } });
          if (linkRisk.score >= 45) await createModerationFlag({ userId: socket.userId, type: "suspicious_message_link", severity: 3, reason: "Подозрительная ссылка в сообщении", meta: { conversationId, score: linkRisk.score, domains: linkRisk.domains } });
        }

        const { data: recipientParts } = await supabase
          .from("conversation_participants")
          .select("user_id,request_status")
          .eq("conversation_id", conversationId)
          .neq("user_id", socket.userId);
        const { data: conversationPrivacy } = await supabase.from("conversations").select("type").eq("id", conversationId).maybeSingle();
        if (conversationPrivacy?.type === "direct") {
          const recipientId = recipientParts?.[0]?.user_id;
          if (recipientId) {
            const blocks = await blockState(socket.userId, recipientId);
            if (blocks.blocked) return ack?.({ error: "blocked", message: "Сообщения недоступны из-за чёрного списка" });
          }
        }
        if (hasRestriction(trust, "messagingDisabled")) return ack?.({ error: "restricted", message: "Сообщения временно ограничены системой безопасности" });
        if (hasRestriction(trust, "noLinks") && linkCount > 0) return ack?.({ error: "restricted", message: "Ссылки временно ограничены системой безопасности" });
        if ((recipientParts || []).some((part) => part.request_status === "pending")) {
          if (hasRestriction(trust, "noUnknownDm")) return ack?.({ error: "restricted", message: "Сообщения незнакомым людям временно ограничены" });
          const requestLimit = await consumeRateLimitDistributed(`messages:requests:${socket.userId}`, { limit: trustLimit(10, trust, { new: 0.3, low: 0.5, trusted: 1.5, staff: 4 }), windowMs: 60 * 60 * 1000 });
          if (!requestLimit.allowed) {
            await logSpamEvent({ userId: socket.userId, eventType: "message_request_rate_limited", targetType: "conversation", targetId: conversationId, meta: { retryAfter: requestLimit.retryAfter } });
            return socketRateLimitAck(ack, requestLimit, "Слишком много сообщений незнакомым людям за час.");
          }
        }

        socket.join(`conv:${conversationId}`);

        const { data: msg, error, deduplicated } = await insertMessageIdempotent({
          clientId,
          conversation_id: conversationId,
          sender_id: socket.userId,
          text: text || null,
          type: messageType,
          attachment_url: attachmentUrl || null,
          attachment_thumbnail_url: attachmentThumbnailUrl || null,
          media_width: mediaWidth,
          media_height: mediaHeight,
          media_duration_sec: mediaDurationSec,
          reply_to: replyTo || null,
          status: "sent",
        });
        if (error) return ack?.(safeSocketError(error, "Не удалось отправить сообщение"));

        if (deduplicated) {
          return ack?.({ ok: true, id: msg.id, clientId, deduplicated: true });
        }

        const sender = await fetchSocketSender(socket.userId);
        const receiptSummaries = await getReceiptSummaries([msg]);
        const serialized = serializeMessage({ ...msg, sender }, { clientId, reactions: [], receiptSummary: receiptSummaries.get(msg.id) });
        io.to(`conv:${conversationId}`).emit("message:new", serialized);

        // Personal push event for users who are not currently joined to the room/page.
        const [{ data: participants }, { data: conv }] = await Promise.all([
          supabase
            .from("conversation_participants")
            .select("user_id,muted")
            .eq("conversation_id", conversationId),
          supabase
            .from("conversations")
            .select("title,avatar_url,type,channel_id")
            .eq("id", conversationId)
            .maybeSingle(),
        ]);
        const pushRecipientIds = [];
        for (const participant of participants || []) {
          if (participant.user_id === socket.userId) continue;
          const conversationKind = conv?.channel_id ? "channel" : (conv?.type || "group");
          io.to(`user:${participant.user_id}`).emit("message:push", {
            conversationId,
            message: serialized,
            muted: Boolean(participant.muted),
            conversationTitle: conv?.title || socket.username || "Сообщение",
            avatarUrl: conv?.avatar_url || null,
            conversationKind,
          });
          if (!participant.muted) pushRecipientIds.push(participant.user_id);
        }
        if (pushRecipientIds.length) {
          const conversationKind = conv?.channel_id ? "channel" : (conv?.type || "group");
          void sendPushToUsers(pushRecipientIds, {
            kind: "message",
            title: conv?.title || `@${socket.username || "NightGram"}`,
            body: "Новое сообщение",
            url: `/messages?conversation=${encodeURIComponent(conversationId)}`,
            tag: `message:${conversationId}`,
            conversationId,
          }, { category: conversationKind === "channel" ? "channel" : conversationKind === "direct" ? "direct" : "group" });
        }

        await syncMessageMentions({
          messageId: msg.id,
          conversationId,
          senderId: socket.userId,
          text,
          io,
        });

        ack?.({ ok: true, id: msg.id, clientId });
      } catch (error) {
        ack?.(safeSocketError(error, "Не удалось отправить сообщение"));
      }
    });

    socket.on("message:edit", async ({ messageId, text } = {}, ack) => {
      try {
        messageId = cleanId(messageId);
        text = typeof text === "string" ? text.trim() : "";
        if (!messageId || !text) return ack?.({ error: "invalid_message", message: "Введите текст сообщения" });
        if (text.length > 4096) return ack?.({ error: "message_too_long", message: "Сообщение слишком длинное" });

        const { data: message } = await supabase
          .from("messages")
          .select("id,conversation_id,sender_id,deleted_at")
          .eq("id", messageId)
          .maybeSingle();
        if (!message) return ack?.({ error: "not_found", message: "Сообщение не найдено" });
        if (message.sender_id !== socket.userId) return ack?.({ error: "forbidden", message: "Можно редактировать только свои сообщения" });
        if (message.deleted_at) return ack?.({ error: "deleted", message: "Удалённое сообщение нельзя редактировать" });
        if (!(await ensureParticipant(message.conversation_id, socket.userId))) return ack?.({ error: "forbidden" });

        const editedAt = new Date().toISOString();
        const result = await supabase
          .from("messages")
          .update({ text, edited_at: editedAt })
          .eq("id", messageId)
          .eq("sender_id", socket.userId)
          .select("id")
          .maybeSingle();
        if (result.error) {
          if (/edited_at|schema cache|column .* does not exist/i.test(result.error.message || "")) {
            return ack?.({ error: "migration_required", message: "Примените migration_message_edit_delete_media.sql" });
          }
          return ack?.(safeSocketError(result.error, "Не удалось изменить сообщение"));
        }
        io.to(`conv:${message.conversation_id}`).emit("message:edited", { messageId, text, editedAt });
        await syncMessageMentions({
          messageId,
          conversationId: message.conversation_id,
          senderId: socket.userId,
          text,
          io,
        });
        ack?.({ ok: true, messageId, text, editedAt });
      } catch (error) {
        ack?.(safeSocketError(error, "Не удалось изменить сообщение"));
      }
    });

    socket.on("message:delete", async ({ messageId } = {}, ack) => {
      try {
        messageId = cleanId(messageId);
        if (!messageId) return ack?.({ error: "invalid_message" });
        const { data: message } = await supabase
          .from("messages")
          .select("id,conversation_id,sender_id,deleted_at")
          .eq("id", messageId)
          .maybeSingle();
        if (!message) return ack?.({ error: "not_found", message: "Сообщение не найдено" });
        if (message.sender_id !== socket.userId) return ack?.({ error: "forbidden", message: "Можно удалить только своё сообщение" });
        if (!(await ensureParticipant(message.conversation_id, socket.userId))) return ack?.({ error: "forbidden" });
        if (message.deleted_at) return ack?.({ ok: true, messageId, deletedAt: message.deleted_at });

        const deletedAt = new Date().toISOString();
        const result = await supabase
          .from("messages")
          .update({
            text: null,
            attachment_url: null,
            attachment_thumbnail_url: null,
            media_width: null,
            media_height: null,
            media_duration_sec: null,
            deleted_at: deletedAt,
          })
          .eq("id", messageId)
          .eq("sender_id", socket.userId)
          .select("id")
          .maybeSingle();
        if (result.error) {
          if (/deleted_at|attachment_thumbnail_url|media_width|schema cache|column .* does not exist/i.test(result.error.message || "")) {
            return ack?.({ error: "migration_required", message: "Примените migration_message_edit_delete_media.sql" });
          }
          return ack?.(safeSocketError(result.error, "Не удалось удалить сообщение"));
        }
        await Promise.all([
          supabase.from("message_reactions").delete().eq("message_id", messageId),
          supabase.from("message_mentions").delete().eq("message_id", messageId),
        ]);
        io.to(`conv:${message.conversation_id}`).emit("message:deleted", { messageId, deletedAt });
        ack?.({ ok: true, messageId, deletedAt });
      } catch (error) {
        ack?.(safeSocketError(error, "Не удалось удалить сообщение"));
      }
    });

    socket.on("message:delivered", async ({ messageId, conversationId } = {}) => {
      if (!messageId || !conversationId) return;
      const allowed = await ensureParticipant(conversationId, socket.userId);
      if (!allowed) return;

      const { data: message } = await supabase
        .from("messages")
        .select("sender_id")
        .eq("id", messageId)
        .maybeSingle();
      if (!message || message.sender_id === socket.userId) return;

      const receipt = await markMessageReceipt({ messageId, conversationId, userId: socket.userId, read: false });
      if (receipt.ok) {
        await emitReceiptUpdate(conversationId, messageId, socket.userId, "delivered", receipt.deliveredAt);
      } else if (receipt.missing) {
        await supabase.from("messages").update({ status: "delivered" }).eq("id", messageId).eq("status", "sent");
        io.to(`conv:${conversationId}`).emit("message:delivered", { messageId, userId: socket.userId });
        io.to(`conv:${conversationId}`).emit("message:status", { messageId, status: "delivered" });
      }
    });

    socket.on("message:read", async ({ messageId, conversationId } = {}) => {
      if (!messageId || !conversationId) return;
      const privacy = await getPrivacySettings(socket.userId);
      if (privacy.hide_read_receipts) return;
      const allowed = await ensureParticipant(conversationId, socket.userId);
      if (!allowed) return;

      const { data: message } = await supabase
        .from("messages")
        .select("sender_id")
        .eq("id", messageId)
        .maybeSingle();
      if (!message || message.sender_id === socket.userId) return;

      const receipt = await markMessageReceipt({ messageId, conversationId, userId: socket.userId, read: true });
      await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", socket.userId);
      if (receipt.ok) {
        await emitReceiptUpdate(conversationId, messageId, socket.userId, "read", receipt.readAt);
      } else if (receipt.missing) {
        await supabase.from("messages").update({ status: "read" }).eq("id", messageId);
        io.to(`conv:${conversationId}`).emit("message:read", { messageId, userId: socket.userId });
        io.to(`conv:${conversationId}`).emit("message:status", { messageId, status: "read" });
      }
    });

    socket.on("message:react", async ({ messageId, emoji } = {}) => {
      messageId = cleanId(messageId);
      emoji = typeof emoji === "string" ? emoji.trim().slice(0, 16) : "";
      if (!messageId || !emoji) return;

      const { data: message } = await supabase
        .from("messages")
        .select("conversation_id")
        .eq("id", messageId)
        .maybeSingle();
      if (!message) return;

      const allowed = await ensureParticipant(message.conversation_id, socket.userId);
      if (!allowed) return;

      const { data: existing } = await supabase
        .from("message_reactions")
        .select("message_id")
        .eq("message_id", messageId)
        .eq("user_id", socket.userId)
        .eq("emoji", emoji)
        .maybeSingle();

      let active = true;
      if (existing) {
        active = false;
        await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", socket.userId)
          .eq("emoji", emoji);
      } else {
        await supabase
          .from("message_reactions")
          .upsert(
            { message_id: messageId, user_id: socket.userId, emoji },
            { onConflict: "message_id,user_id,emoji" },
          );
      }

      io.to(`conv:${message.conversation_id}`).emit("message:reaction", {
        messageId,
        emoji,
        userId: socket.userId,
        active,
      });
    });

    socket.on("typing", ({ conversationId, isTyping } = {}) => {
      if (!conversationId) return;
      socket.to(`conv:${conversationId}`).emit("typing", {
        conversationId,
        userId: socket.userId,
        isTyping: Boolean(isTyping),
      });
    });

    // ---- Calls (global WebRTC signaling; UI lives on the frontend) ----
    async function getConversationCallContext(conversationId) {
      const [{ data: parts }, { data: conv }] = await Promise.all([
        supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", conversationId),
        supabase
          .from("conversations")
          .select("title,avatar_url,type,channel_id")
          .eq("id", conversationId)
          .maybeSingle(),
      ]);
      return {
        participantIds: (parts || []).map((part) => part.user_id).filter(Boolean),
        conversationTitle: conv?.title || "Звонок NightGram",
        avatarUrl: conv?.avatar_url || null,
      };
    }

    async function emitCallToParticipants(event, payload, targetIds = null) {
      const allowed = await ensureParticipant(payload.conversationId, socket.userId);
      if (!allowed) return;
      const context = await getConversationCallContext(payload.conversationId);
      const enriched = {
        ...payload,
        conversationTitle: payload.conversationTitle || context.conversationTitle,
        avatarUrl: payload.avatarUrl ?? context.avatarUrl,
        participants: context.participantIds,
      };

      const recipients = targetIds
        ? [...new Set(targetIds)].filter((userId) => context.participantIds.includes(userId))
        : payload.toUserId
          ? [payload.toUserId]
          : context.participantIds;

      for (const userId of recipients) {
        if (!userId || userId === socket.userId) continue;
        io.to(`user:${userId}`).emit(event, enriched);
      }
    }

    function validActiveCall(callId, conversationId) {
      const call = activeCalls.get(callId);
      if (!call || call.conversationId !== conversationId) return null;
      return call;
    }

    async function finishActiveCall(callId, byUserId, reason = "ended") {
      const call = activeCalls.get(callId);
      if (!call) return;
      if (call.timeout) clearTimeout(call.timeout);
      if (call.startedAt) {
        await pushSystemMessage(
          call.conversationId,
          byUserId,
          `✅ ${call.type === "video" ? "Видеозвонок" : "Звонок"} завершён · длился ${formatDuration(Date.now() - call.startedAt)}`,
        );
      } else if (reason !== "empty") {
        await pushSystemMessage(
          call.conversationId,
          call.callerId,
          `Пропущенный ${call.type === "video" ? "видеозвонок" : "звонок"} от @${call.callerUsername || "user"}`,
        );
      }
      activeCalls.delete(callId);
      await finishCallHistory(callId, reason);
      void sendNativePushToUsers(call.participantIds, {
        kind: "call",
        action: "end-call",
        silent: true,
        callId,
        conversationId: call.conversationId,
        reason,
        url: `/messages?conversation=${encodeURIComponent(call.conversationId)}`,
        tag: `call:${callId}`,
      }, { category: "call", urgent: true });
      const eventByUserId = reason === "missed" ? "system" : byUserId;
      for (const participantId of call.participantIds) {
        io.to(`user:${participantId}`).emit("call:ended", {
          conversationId: call.conversationId,
          callId,
          byUserId: eventByUserId,
          reason,
          participants: call.participantIds,
          conversationTitle: call.conversationTitle,
          avatarUrl: call.avatarUrl,
        });
      }
    }

    async function leaveActiveCall(callId, userId, reason = "left") {
      const call = activeCalls.get(callId);
      if (!call || !call.joinedUserIds.has(userId)) return;
      const departure = leaveParticipant(call, userId);
      if (!departure.ok) return;
      activeCalls.set(callId, call);
      await markParticipantLeft(callId, userId);
      const remaining = departure.joinedParticipantIds;
      for (const participantId of remaining) {
        io.to(`user:${participantId}`).emit("call:participant-left", {
          conversationId: call.conversationId,
          callId,
          participantId: userId,
          joinedParticipantIds: remaining,
          reason,
          participants: call.participantIds,
          conversationTitle: call.conversationTitle,
          avatarUrl: call.avatarUrl,
        });
      }
      if (remaining.length === 0) await finishActiveCall(callId, userId, "empty");
    }

    socket.on("call:start", async ({ conversationId, callId, type } = {}, ack) => {
      if (!conversationId || !callId) return ack?.({ error: "invalid_call" });
      if (activeCalls.has(callId)) return ack?.({ error: "call_already_exists" });
      const allowed = await ensureParticipant(conversationId, socket.userId);
      if (!allowed) return ack?.({ error: "not_participant" });
      const context = await getConversationCallContext(conversationId);
      if (context.participantIds.length < 2) return ack?.({ error: "not_enough_participants" });
      const admission = admitCall(activeCalls, context.participantIds, socket.userId);
      if (!admission.ok) return ack?.({ error: admission.error, busyParticipantIds: admission.busyParticipantIds });
      const admittedParticipantIds = admission.participantIds;
      if (admittedParticipantIds.length > MAX_GROUP_CALL_PARTICIPANTS) return ack?.({ error: "group_call_too_large", maxParticipants: MAX_GROUP_CALL_PARTICIPANTS });
      const callType = type === "video" ? "video" : "audio";
      const ringTimeoutMs = clampRingTimeoutSeconds(process.env.CALL_RING_TIMEOUT_SECONDS, 60) * 1000;
      const timeout = setTimeout(async () => {
        const pending = activeCalls.get(callId);
        if (!pending || pending.startedAt) return;
        await finishActiveCall(callId, pending.callerId, "missed");
      }, ringTimeoutMs);
      activeCalls.set(callId, createCallRoom({
        conversationId,
        callerId: socket.userId,
        callerUsername: socket.username,
        type: callType,
        participantIds: admittedParticipantIds,
        conversationTitle: context.conversationTitle,
        avatarUrl: context.avatarUrl,
        timeout,
      }));
      await createCallHistory({
        callId,
        conversationId,
        initiatorId: socket.userId,
        initiatorUsername: socket.username,
        type: callType,
        participantIds: admittedParticipantIds,
        conversationTitle: context.conversationTitle,
        avatarUrl: context.avatarUrl,
      });
      void sendPushToUsers(admittedParticipantIds.filter((id) => id !== socket.userId), {
        kind: "call",
        title: admittedParticipantIds.length > 2 ? "Групповой звонок NightGram" : `Входящий ${callType === "video" ? "видеозвонок" : "звонок"}`,
        body: `@${socket.username || "user"} звонит`,
        url: `/messages?conversation=${encodeURIComponent(conversationId)}&call=${encodeURIComponent(callId)}`,
        tag: `call:${callId}`,
        requireInteraction: true,
        callId,
        conversationId,
        fromUserId: socket.userId,
        fromUsername: socket.username,
        type: callType,
        conversationTitle: context.conversationTitle,
        avatarUrl: context.avatarUrl,
        participants: admittedParticipantIds,
      }, { category: "call", urgent: true });
      await pushSystemMessage(
        conversationId,
        socket.userId,
        `@${socket.username || "user"} звонит${callType === "video" ? " по видео" : ""}${admittedParticipantIds.length > 2 ? ` · группа до ${Math.min(admittedParticipantIds.length, 8)} участников` : ""}`,
      );
      await emitCallToParticipants("call:incoming", {
        conversationId,
        callId,
        type: callType,
        fromUserId: socket.userId,
        fromUsername: socket.username,
        participants: admittedParticipantIds,
      }, admittedParticipantIds);
      ack?.({ ok: true, participants: admittedParticipantIds, busyParticipantIds: admission.busyParticipantIds, maxParticipants: MAX_GROUP_CALL_PARTICIPANTS });
    });

    socket.on("call:accept", async ({ conversationId, callId } = {}, ack) => {
      if (!conversationId || !callId) return ack?.({ error: "invalid_call" });
      const call = validActiveCall(callId, conversationId);
      if (!call || !call.participantIds.includes(socket.userId)) return ack?.({ error: "call_not_found" });
      const accepted = acceptParticipant(call, socket.userId);
      if (!accepted.ok) return ack?.({ error: accepted.error });
      if (call.timeout) clearTimeout(call.timeout);
      call.timeout = null;
      activeCalls.set(callId, call);
      await markParticipantAccepted(callId, socket.userId);
      const { wasJoined, joinedParticipantIds } = accepted;
      await emitCallToParticipants("call:accepted", { conversationId, callId, byUserId: socket.userId }, joinedParticipantIds);
      if (!wasJoined) {
        for (const participantId of joinedParticipantIds) {
          io.to(`user:${participantId}`).emit("call:participant-joined", {
            conversationId,
            callId,
            participantId: socket.userId,
            joinedParticipantIds,
            participants: call.participantIds,
            conversationTitle: call.conversationTitle,
            avatarUrl: call.avatarUrl,
          });
        }
      }
      ack?.({ ok: true, joinedParticipantIds });
    });

    socket.on("call:resume", async ({ conversationId, callId } = {}, ack) => {
      const call = validActiveCall(callId, conversationId);
      if (!call || !call.participantIds.includes(socket.userId)) return ack?.({ error: "call_not_found" });
      call.joinedUserIds.add(socket.userId);
      activeCalls.set(callId, call);
      const joinedParticipantIds = [...call.joinedUserIds];
      for (const participantId of joinedParticipantIds) {
        io.to(`user:${participantId}`).emit("call:participant-joined", {
          conversationId,
          callId,
          participantId: socket.userId,
          joinedParticipantIds,
          participants: call.participantIds,
          conversationTitle: call.conversationTitle,
          avatarUrl: call.avatarUrl,
          resumed: true,
        });
      }
      ack?.({ ok: true, joinedParticipantIds });
    });

    socket.on("call:offer", async ({ conversationId, callId, offer, type, toUserId, iceRestart } = {}) => {
      if (!conversationId || !callId || !offer) return;
      const call = validActiveCall(callId, conversationId);
      if (!call || !call.joinedUserIds.has(socket.userId)) return;
      if (toUserId && !call.participantIds.includes(toUserId)) return;
      await emitCallToParticipants("call:offer", { conversationId, callId, offer, type: type || call.type, fromUserId: socket.userId, toUserId, iceRestart: Boolean(iceRestart) });
    });

    socket.on("call:answer", async ({ conversationId, callId, answer, toUserId } = {}) => {
      if (!conversationId || !callId || !answer) return;
      const call = validActiveCall(callId, conversationId);
      if (!call || !call.joinedUserIds.has(socket.userId)) return;
      if (toUserId && !call.joinedUserIds.has(toUserId)) return;
      await emitCallToParticipants("call:answer", { conversationId, callId, answer, fromUserId: socket.userId, toUserId });
    });

    socket.on("call:ice-candidate", async ({ conversationId, callId, candidate, toUserId } = {}) => {
      if (!conversationId || !callId || !candidate) return;
      const call = validActiveCall(callId, conversationId);
      if (!call || !call.joinedUserIds.has(socket.userId)) return;
      if (toUserId && !call.participantIds.includes(toUserId)) return;
      await emitCallToParticipants("call:ice-candidate", { conversationId, callId, candidate, fromUserId: socket.userId, toUserId });
    });

    socket.on("call:reaction", async ({ conversationId, callId, emoji } = {}) => {
      const call = validActiveCall(callId, conversationId);
      if (!call || !call.joinedUserIds.has(socket.userId) || !emoji) return;
      await emitCallToParticipants("call:reaction", { conversationId, callId, emoji: String(emoji).slice(0, 8), fromUserId: socket.userId, fromUsername: socket.username }, [...call.joinedUserIds]);
    });

    socket.on("call:watch", async ({ conversationId, callId, url, action = "share" } = {}) => {
      const call = validActiveCall(callId, conversationId);
      if (!call || !call.joinedUserIds.has(socket.userId)) return;
      await emitCallToParticipants("call:watch", { conversationId, callId, url: String(url || "").slice(0, 1000), action, fromUserId: socket.userId, fromUsername: socket.username }, [...call.joinedUserIds]);
    });

    socket.on("call:media-state", async ({ conversationId, callId, micEnabled, cameraEnabled, screenSharing } = {}) => {
      const call = validActiveCall(callId, conversationId);
      if (!call || !call.joinedUserIds.has(socket.userId)) return;
      await emitCallToParticipants("call:media-state", {
        conversationId,
        callId,
        fromUserId: socket.userId,
        micEnabled: micEnabled === undefined ? undefined : Boolean(micEnabled),
        cameraEnabled: cameraEnabled === undefined ? undefined : Boolean(cameraEnabled),
        screenSharing: screenSharing === undefined ? undefined : Boolean(screenSharing),
      }, [...call.joinedUserIds]);
    });

    socket.on("call:reject", async ({ conversationId, callId } = {}) => {
      const call = validActiveCall(callId, conversationId);
      if (!call || !call.participantIds.includes(socket.userId)) return;
      const rejected = rejectParticipant(call, socket.userId);
      if (!rejected.ok) return;
      activeCalls.set(callId, call);
      await markParticipantRejected(callId, socket.userId);
      await emitCallToParticipants("call:rejected", { conversationId, callId, byUserId: socket.userId }, [...call.joinedUserIds]);
      if (rejected.shouldFinish) await finishActiveCall(callId, socket.userId, "rejected");
    });

    socket.on("call:leave", async ({ conversationId, callId } = {}) => {
      const call = validActiveCall(callId, conversationId);
      if (!call) return;
      if (socket.userId === call.callerId) return finishActiveCall(callId, socket.userId, "owner_left");
      if (call.participantIds.length <= 2) return finishActiveCall(callId, socket.userId, "left");
      await leaveActiveCall(callId, socket.userId, "left");
    });

    socket.on("call:end", async ({ conversationId, callId } = {}) => {
      const call = validActiveCall(callId, conversationId);
      if (!call) return;
      if (call.participantIds.length > 2 && socket.userId !== call.callerId) {
        await leaveActiveCall(callId, socket.userId, "left");
        return;
      }
      await finishActiveCall(callId, socket.userId, "ended");
    });

    // ---- Posts ----
    socket.on("post:like", ({ postId, liked }) => {
      socket.broadcast.emit("post:like", { postId, userId: socket.userId, liked });
    });

    // ---- Presence ----
    socket.on("presence:ping", () => {
      const ts = new Date().toISOString();
      supabase
        .from("presence")
        .upsert({ user_id: socket.userId, last_seen: ts, is_online: true });
      void emitPresenceRespectingPrivacy(socket.userId, { userId: socket.userId, isOnline: true, lastSeen: ts });
    });

    socket.on("disconnect", () => {
      const count = Math.max(0, (activeUserSockets.get(socket.userId) || 1) - 1);
      if (count > 0) {
        activeUserSockets.set(socket.userId, count);
        return;
      }
      activeUserSockets.delete(socket.userId);
      const ts = new Date().toISOString();
      supabase
        .from("presence")
        .upsert({ user_id: socket.userId, is_online: false, last_seen: ts });
      void emitPresenceRespectingPrivacy(socket.userId, { userId: socket.userId, isOnline: false, lastSeen: ts });

      const previousTimer = callDisconnectTimers.get(socket.userId);
      if (previousTimer) clearTimeout(previousTimer);
      const timer = setTimeout(async () => {
        callDisconnectTimers.delete(socket.userId);
        if (activeUserSockets.has(socket.userId)) return;
        for (const [callId, call] of activeCalls.entries()) {
          if (!call.joinedUserIds?.has(socket.userId)) continue;
          if (socket.userId === call.callerId) await finishActiveCall(callId, socket.userId, "owner_disconnected");
          else await leaveActiveCall(callId, socket.userId, "disconnected");
        }
      }, 20_000);
      callDisconnectTimers.set(socket.userId, timer);
    });
  });
}

module.exports = { setupSocket };
