// Conversations routes — list + message history
const router = require("express").Router();
const { supabase } = require("../lib/supabase");
const { getReceiptSummaries, markMessageReceipt } = require("../lib/messageReceipts");
const { consumeRateLimitDistributed, rateLimitResponse, logSpamEvent, getTrustProfile, hasRestriction } = require("../lib/safety");

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
    replyTo: row.reply_to || row.replyTo ? { id: row.reply_to || row.replyTo, text: "", senderId: "" } : null,
    reactions,
    status: receiptSummary?.status || row.status || "sent",
    readBy: receiptSummary?.readBy || [],
    deliveredTo: receiptSummary?.deliveredTo || [],
    createdAt: row.created_at || row.createdAt,
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
      .select("conversation_id,user_id,role,pinned,muted,request_status,hidden")
      .eq("conversation_id", conversationId),
    { data: [], error: null },
  );
  if (partsResult.error && /request_status|hidden|schema cache/i.test(partsResult.error.message || "")) {
    partsResult = await safe(
      supabase
        .from("conversation_participants")
        .select("conversation_id,user_id,role,pinned,muted")
        .eq("conversation_id", conversationId),
      { data: [], error: null },
    );
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

  return {
    id: conv.id || conversationId,
    type: conv.type || "direct",
    title: isDirect ? (other?.displayName || other?.username || conv.title || "Чат") : (conv.title || "Группа"),
    avatarUrl: isDirect ? (other?.avatarUrl || null) : (conv.avatar_url || null),
    participants,
    lastMessage: null,
    unreadCount: 0,
    pinned: Boolean(selfPart?.pinned),
    muted: Boolean(selfPart?.muted),
    requestStatus: selfPart?.request_status || "accepted",
    folder: conv.folder || "all",
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

async function hydrateMessages(rows) {
  const ids = (rows || []).map((m) => m.id);
  if (ids.length === 0) return [];

  const missingSenderIds = (rows || [])
    .filter((message) => message.sender_id && !message.sender && !message.users)
    .map((message) => message.sender_id);

  const [{ data: reactions }, receiptSummaries, senderMap] = await Promise.all([
    supabase
      .from("message_reactions")
      .select("message_id,user_id,emoji")
      .in("message_id", ids),
    getReceiptSummaries(rows || []),
    fetchUsersByIds(missingSenderIds),
  ]);

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
    return serializeMessage({ ...message, sender }, messageReactions, receiptSummaries.get(message.id));
  });
}

// GET /api/conversations
router.get("/", async (req, res) => {
  let partsResult = await safe(
    supabase
      .from("conversation_participants")
      .select("conversation_id, role, pinned, muted, request_status, hidden, last_read_at, conversations(*)")
      .eq("user_id", req.userId),
    { data: [], error: null },
  );
  if (partsResult.error && /request_status|hidden|schema cache/i.test(partsResult.error.message || "")) {
    partsResult = await safe(
      supabase
        .from("conversation_participants")
        .select("conversation_id, role, pinned, muted, last_read_at, conversations(*)")
        .eq("user_id", req.userId),
      { data: [], error: null },
    );
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

  const presenceMap = new Map((presenceResult.data || []).map((p) => [p.user_id, p]));
  const onlineSet = new Set((presenceResult.data || [])
    .filter((p) => p.is_online && (!p.last_seen || Date.now() - new Date(p.last_seen).getTime() < 90_000))
    .map((p) => p.user_id));
  const favoriteSet = new Set((favoritesResult.data || []).map((f) => f.target_id));
  const latestRows = latestResults.map((result) => result.data).filter(Boolean);
  const latestReceiptSummaries = await getReceiptSummaries(latestRows);
  const latestMap = new Map(latestRows.map((row) => [row.conversation_id, row]));
  const latestSenderMap = await fetchUsersByIds(latestRows.map((row) => row.sender_id));
  const unreadMap = new Map(visibleParts.map((cp, index) => [cp.conversation_id, unreadResults[index]?.count || 0]));

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
      participants,
      lastMessage,
      unreadCount: unreadMap.get(cid) || 0,
      pinned: cp.pinned,
      muted: cp.muted || false,
      requestStatus: cp.request_status || "accepted",
      favorite: isDirect && other ? favoriteSet.has(other.id) : false,
      folder: cp.conversations.folder || "all",
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

  const { data: target } = await supabase.from("users").select("username,avatar_url").eq("id", userId).single();
  if (!target) return res.status(404).json({ error: "User not found" });

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ type: "direct", title: target.username || "Чат", avatar_url: target.avatar_url || null })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const recipientKnowsSender = await isKnownContact(userId, req.userId);
  let participantInsert = await safe(supabase.from("conversation_participants").insert([
    { conversation_id: conv.id, user_id: req.userId, role: "member", request_status: "accepted", hidden: false },
    { conversation_id: conv.id, user_id: userId, role: "member", request_status: recipientKnowsSender ? "accepted" : "pending", hidden: false },
  ]), { error: null });
  if (participantInsert.error && /request_status|hidden|schema cache/i.test(participantInsert.error.message || "")) {
    participantInsert = await safe(supabase.from("conversation_participants").insert([
      { conversation_id: conv.id, user_id: req.userId, role: "member" },
      { conversation_id: conv.id, user_id: userId, role: "member" },
    ]), { error: null });
  }

  const summary = await buildConversationSummary(conv.id, req.userId, conv);
  res.status(201).json(summary);
});

// POST /api/conversations/groups — create a group chat
router.post("/groups", async (req, res) => {
  const { title, description = "", avatarUrl, userIds = [] } = req.body;
  const cleanTitle = String(title || "").trim().slice(0, 80) || "Новая группа";
  const uniqueIds = [...new Set([req.userId, ...(Array.isArray(userIds) ? userIds : [])])].filter(Boolean);
  if (uniqueIds.length < 2) return res.status(400).json({ error: "Добавьте хотя бы одного участника" });

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
  res.json({ ok: true, muted });
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

// GET /api/conversations/:id/messages
router.get("/:id/messages", async (req, res) => {
  const allowed = await ensureParticipant(req.params.id, req.userId);
  if (!allowed) return res.status(403).json({ error: "Not a participant" });

  let messagesResult = await safe(
    supabase
      .from("messages")
      .select("*, sender:users!messages_sender_id_fkey(id,username,display_name,avatar_url,name_color,is_premium,avatar_frame,verified)")
      .eq("conversation_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(80),
    { data: [], error: null },
  );
  if (messagesResult.error && /relationship|schema cache|sender|verified/i.test(messagesResult.error.message || "")) {
    messagesResult = await safe(
      supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", req.params.id)
        .order("created_at", { ascending: false })
        .limit(80),
      { data: [], error: null },
    );
  }
  const { data: rawMessages, error } = messagesResult;
  if (error) return res.status(500).json({ error: error.message });
  const data = (rawMessages || []).slice().reverse();

  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", req.params.id)
    .eq("user_id", req.userId);

  const unreadRows = (data || [])
    .filter((m) => m.sender_id !== req.userId);
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

  const hydrated = await hydrateMessages(data || []);
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
  res.json(hydrated);
});

module.exports = { conversationsRouter: router };
