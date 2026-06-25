// =============================================================================
//  Socket.io — real-time messaging, presence, post events
//  Authenticates via the JWT passed in `auth.token`.
// =============================================================================

const { verifyAccessToken } = require("./lib/jwt");
const { supabase } = require("./lib/supabase");
const { getReceiptSummaries, markMessageReceipt, summarizeSingleMessage } = require("./lib/messageReceipts");
const { consumeRateLimitDistributed, checkDuplicate, assessLinksWithRules, getTrustProfile, trustLimit, shouldRestrictLinks, hasRestriction, socketRateLimitAck, logSpamEvent, createModerationFlag } = require("./lib/safety");
const { hasActivePunishment, punishmentMessage } = require("./lib/punishments");

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
    replyTo: row.reply_to || row.replyTo ? { id: row.reply_to || row.replyTo, text: "", senderId: "" } : null,
    reactions,
    status: receiptSummary?.status || row.status || "sent",
    readBy: receiptSummary?.readBy || [],
    deliveredTo: receiptSummary?.deliveredTo || [],
    createdAt: row.created_at || row.createdAt,
    ...(clientId ? { clientId, client_id: clientId } : {}),
  };
}

function setupSocket(io) {
  const activeCalls = new Map();
  const activeUserSockets = new Map();

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
        .select("title,avatar_url,type")
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
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));
    try {
      const payload = verifyAccessToken(token);
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

    // Mark online. Keep a per-process socket count so closing one tab does not mark user offline while another tab is open.
    const count = activeUserSockets.get(socket.userId) || 0;
    activeUserSockets.set(socket.userId, count + 1);
    supabase
      .from("presence")
      .upsert({ user_id: socket.userId, is_online: true, last_seen: new Date().toISOString() });
    if (count === 0) socket.broadcast.emit("presence:update", { userId: socket.userId, isOnline: true, lastSeen: new Date().toISOString() });

    // ---- Conversations / rooms ----
    socket.on("conversation:join", async (conversationId, ack) => {
      const allowed = await ensureParticipant(conversationId, socket.userId);
      if (!allowed) return ack?.({ error: "Not a participant" });
      socket.join(`conv:${conversationId}`);
      ack?.({ ok: true });
    });

    socket.on("conversation:leave", (conversationId) => {
      if (conversationId) socket.leave(`conv:${conversationId}`);
    });

    // ---- Messaging ----
    socket.on("message:send", async (payload = {}, ack) => {
      try {
        const { conversationId, clientId, text, type, attachmentUrl, replyTo } = payload;
        const messageType = type || (attachmentUrl ? "image" : "text");

        if (!conversationId) return ack?.({ error: "Missing conversation" });
        if (!text && !attachmentUrl && messageType !== "sticker") {
          return ack?.({ error: "Empty message" });
        }

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

        const normalizedText = String(text || "");
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

        const { data: msg, error } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            sender_id: socket.userId,
            text: text || null,
            type: messageType,
            attachment_url: attachmentUrl || null,
            reply_to: replyTo || null,
            status: "sent",
          })
          .select("*")
          .single();
        if (error) return ack?.({ error: error.message });

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
            .select("title,avatar_url,type")
            .eq("id", conversationId)
            .maybeSingle(),
        ]);
        for (const participant of participants || []) {
          if (participant.user_id === socket.userId) continue;
          io.to(`user:${participant.user_id}`).emit("message:push", {
            conversationId,
            message: serialized,
            muted: Boolean(participant.muted),
            conversationTitle: conv?.title || socket.username || "Сообщение",
            avatarUrl: conv?.avatar_url || null,
          });
        }

        ack?.({ ok: true, id: msg.id, clientId });
      } catch (error) {
        ack?.({ error: error.message || "Message failed" });
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
    async function emitCallToParticipants(event, payload) {
      const allowed = await ensureParticipant(payload.conversationId, socket.userId);
      if (!allowed) return;
      const [{ data: parts }, { data: conv }] = await Promise.all([
        supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", payload.conversationId),
        supabase
          .from("conversations")
          .select("title,avatar_url,type")
          .eq("id", payload.conversationId)
          .maybeSingle(),
      ]);
      const participantIds = (parts || []).map((part) => part.user_id).filter(Boolean);
      const enriched = {
        ...payload,
        conversationTitle: payload.conversationTitle || conv?.title || "Звонок NightGram",
        avatarUrl: payload.avatarUrl ?? conv?.avatar_url ?? null,
        participants: participantIds,
      };

      if (payload.toUserId) {
        if (participantIds.includes(payload.toUserId) && payload.toUserId !== socket.userId) {
          io.to(`user:${payload.toUserId}`).emit(event, enriched);
        }
        return;
      }

      for (const userId of participantIds) {
        if (userId === socket.userId) continue;
        io.to(`user:${userId}`).emit(event, enriched);
      }
    }

    socket.on("call:start", async ({ conversationId, callId, type } = {}) => {
      if (!conversationId || !callId) return;
      const allowed = await ensureParticipant(conversationId, socket.userId);
      if (!allowed) return;
      const callType = type || "audio";
      const timeout = setTimeout(async () => {
        const pending = activeCalls.get(callId);
        if (!pending || pending.startedAt) return;
        await pushSystemMessage(
          conversationId,
          pending.callerId,
          `Пропущенный ${pending.type === "video" ? "видеозвонок" : "звонок"} от @${pending.callerUsername || "user"}`,
        );
        activeCalls.delete(callId);
        io.to(`user:${pending.callerId}`).emit("call:ended", { conversationId, callId, byUserId: "system" });
        const { data: parts } = await supabase.from("conversation_participants").select("user_id").eq("conversation_id", conversationId);
        for (const part of parts || []) {
          if (part.user_id !== pending.callerId) io.to(`user:${part.user_id}`).emit("call:ended", { conversationId, callId, byUserId: "system" });
        }
      }, 60_000);
      activeCalls.set(callId, {
        conversationId,
        callerId: socket.userId,
        callerUsername: socket.username,
        type: callType,
        startedAt: null,
        createdAt: Date.now(),
        timeout,
      });
      await pushSystemMessage(
        conversationId,
        socket.userId,
        `@${socket.username || "user"} звонит${callType === "video" ? " по видео" : ""}`,
      );
      await emitCallToParticipants("call:incoming", { conversationId, callId, type: callType, fromUserId: socket.userId, fromUsername: socket.username });
    });

    socket.on("call:accept", async ({ conversationId, callId } = {}) => {
      if (!conversationId || !callId) return;
      const call = activeCalls.get(callId);
      if (call && !call.startedAt) {
        if (call.timeout) clearTimeout(call.timeout);
        call.startedAt = Date.now();
        activeCalls.set(callId, call);
      }
      await emitCallToParticipants("call:accepted", { conversationId, callId, byUserId: socket.userId });
    });

    socket.on("call:offer", async ({ conversationId, callId, offer, type, toUserId } = {}) => {
      if (!conversationId || !callId || !offer) return;
      await emitCallToParticipants("call:offer", { conversationId, callId, offer, type: type || "audio", fromUserId: socket.userId, toUserId });
    });

    socket.on("call:answer", async ({ conversationId, callId, answer, toUserId } = {}) => {
      if (!conversationId || !callId || !answer) return;
      const call = activeCalls.get(callId);
      if (call && !call.startedAt) {
        if (call.timeout) clearTimeout(call.timeout);
        call.startedAt = Date.now();
        activeCalls.set(callId, call);
      }
      await emitCallToParticipants("call:answer", { conversationId, callId, answer, fromUserId: socket.userId, toUserId });
    });

    socket.on("call:ice-candidate", async ({ conversationId, callId, candidate, toUserId } = {}) => {
      if (!conversationId || !callId || !candidate) return;
      await emitCallToParticipants("call:ice-candidate", { conversationId, callId, candidate, fromUserId: socket.userId, toUserId });
    });

    socket.on("call:reaction", async ({ conversationId, callId, emoji } = {}) => {
      if (!conversationId || !callId || !emoji) return;
      await emitCallToParticipants("call:reaction", { conversationId, callId, emoji: String(emoji).slice(0, 8), fromUserId: socket.userId, fromUsername: socket.username });
    });

    socket.on("call:watch", async ({ conversationId, callId, url, action = "share" } = {}) => {
      if (!conversationId || !callId) return;
      await emitCallToParticipants("call:watch", { conversationId, callId, url: String(url || "").slice(0, 1000), action, fromUserId: socket.userId, fromUsername: socket.username });
    });

    socket.on("call:media-state", async ({ conversationId, callId, micEnabled, cameraEnabled, screenSharing } = {}) => {
      if (!conversationId || !callId) return;
      await emitCallToParticipants("call:media-state", {
        conversationId,
        callId,
        fromUserId: socket.userId,
        micEnabled: micEnabled === undefined ? undefined : Boolean(micEnabled),
        cameraEnabled: cameraEnabled === undefined ? undefined : Boolean(cameraEnabled),
        screenSharing: screenSharing === undefined ? undefined : Boolean(screenSharing),
      });
    });

    socket.on("call:reject", async ({ conversationId, callId } = {}) => {
      if (!conversationId || !callId) return;
      const call = activeCalls.get(callId);
      if (call && !call.startedAt) {
        if (call.timeout) clearTimeout(call.timeout);
        await pushSystemMessage(
          conversationId,
          socket.userId,
          `Пропущенный ${call.type === "video" ? "видеозвонок" : "звонок"} от @${call.callerUsername || "user"}`,
        );
        activeCalls.delete(callId);
      }
      await emitCallToParticipants("call:rejected", { conversationId, callId, byUserId: socket.userId });
    });

    socket.on("call:end", async ({ conversationId, callId } = {}) => {
      if (!conversationId || !callId) return;
      const call = activeCalls.get(callId);
      if (call) {
        if (call.timeout) clearTimeout(call.timeout);
        if (call.startedAt) {
          await pushSystemMessage(
            conversationId,
            socket.userId,
            `✅ ${call.type === "video" ? "Видеозвонок" : "Звонок"} завершён · длился ${formatDuration(Date.now() - call.startedAt)}`,
          );
        } else {
          await pushSystemMessage(
            conversationId,
            socket.userId,
            `Пропущенный ${call.type === "video" ? "видеозвонок" : "звонок"} от @${call.callerUsername || "user"}`,
          );
        }
        activeCalls.delete(callId);
      }
      await emitCallToParticipants("call:ended", { conversationId, callId, byUserId: socket.userId });
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
      socket.broadcast.emit("presence:update", { userId: socket.userId, isOnline: true, lastSeen: ts });
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
      socket.broadcast.emit("presence:update", { userId: socket.userId, isOnline: false, lastSeen: ts });
    });
  });
}

module.exports = { setupSocket };
