// Global search — people, chats, messages and shared files.
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

async function safe(promise, fallback = { data: null, error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

function cleanQuery(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[%_(),\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function clampLimit(value, fallback = 12) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(30, Math.floor(parsed)));
}

function publicUser(user) {
  if (!user) return null;
  const avatarFrame = user.avatar_frame ?? null;
  return {
    id: String(user.id || ""),
    username: String(user.username || ""),
    displayName: String(user.display_name || user.username || "Пользователь"),
    avatarUrl: user.avatar_url ?? null,
    nameColor: String(user.name_color || "#ffffff"),
    role: String(user.role || "user"),
    isPremium: Boolean(user.is_premium),
    avatarFrame,
    verified: Boolean(user.verified || avatarFrame === "verified"),
  };
}

async function fetchUsers(ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const variants = [
    "id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame,verified",
    "id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame",
    "id,username,display_name,avatar_url,name_color,role,is_premium",
  ];
  for (const select of variants) {
    const result = await safe(supabase.from("users").select(select).in("id", unique), { data: [], error: null });
    if (!result.error) return new Map((result.data || []).map((user) => [String(user.id), user]));
  }
  return new Map();
}

async function visibleConversationContext(userId) {
  let ownPartsResult = await safe(
    supabase
      .from("conversation_participants")
      .select("conversation_id,hidden,request_status")
      .eq("user_id", userId),
    { data: [], error: null },
  );
  if (ownPartsResult.error && /hidden|request_status|schema cache/i.test(ownPartsResult.error.message || "")) {
    ownPartsResult = await safe(
      supabase.from("conversation_participants").select("conversation_id").eq("user_id", userId),
      { data: [], error: null },
    );
  }

  const ownParts = (ownPartsResult.data || []).filter((part) => !part.hidden && part.request_status !== "blocked");
  const conversationIds = [...new Set(ownParts.map((part) => part.conversation_id).filter(Boolean).map(String))];
  if (conversationIds.length === 0) return { conversationIds, byId: new Map() };

  const [conversationsResult, allPartsResult] = await Promise.all([
    safe(
      supabase.from("conversations").select("id,type,title,avatar_url,description").in("id", conversationIds),
      { data: [], error: null },
    ),
    safe(
      supabase.from("conversation_participants").select("conversation_id,user_id,role").in("conversation_id", conversationIds),
      { data: [], error: null },
    ),
  ]);

  const allParts = allPartsResult.data || [];
  const userMap = await fetchUsers(allParts.map((part) => part.user_id));
  const conversationRows = new Map((conversationsResult.data || []).map((row) => [String(row.id), row]));
  const byId = new Map();

  for (const conversationId of conversationIds) {
    const row = conversationRows.get(conversationId) || { id: conversationId, type: "direct", title: "Чат", avatar_url: null, description: null };
    const participants = allParts
      .filter((part) => String(part.conversation_id) === conversationId)
      .map((part) => {
        const user = publicUser(userMap.get(String(part.user_id)));
        return user ? { ...user, role: String(part.role || "member") } : null;
      })
      .filter(Boolean);
    const other = participants.find((participant) => participant.id !== String(userId));
    const direct = (row.type || "direct") === "direct";
    byId.set(conversationId, {
      id: conversationId,
      type: direct ? "direct" : "group",
      title: direct ? (other?.displayName || other?.username || row.title || "Чат") : (row.title || "Группа"),
      avatarUrl: direct ? (other?.avatarUrl || null) : (row.avatar_url || null),
      description: direct ? null : (row.description || null),
      participants,
    });
  }

  return { conversationIds, byId };
}

function conversationScore(conversation, normalizedQuery) {
  const values = [
    conversation.title,
    conversation.description,
    ...(conversation.participants || []).flatMap((participant) => [participant.username, participant.displayName]),
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  let score = 0;
  for (const value of values) {
    if (value === normalizedQuery) score = Math.max(score, 100);
    else if (value.startsWith(normalizedQuery)) score = Math.max(score, 70);
    else if (value.includes(normalizedQuery)) score = Math.max(score, 40);
  }
  return score;
}

function messageResult(row, senderMap, conversationMap) {
  const conversation = conversationMap.get(String(row.conversation_id));
  const sender = publicUser(senderMap.get(String(row.sender_id)));
  return {
    id: String(row.id || ""),
    conversationId: String(row.conversation_id || ""),
    conversationTitle: conversation?.title || "Чат",
    conversationType: conversation?.type || "direct",
    conversationAvatarUrl: conversation?.avatarUrl || null,
    conversationParticipants: conversation?.participants || [],
    sender,
    text: row.text ?? null,
    type: row.type || (row.attachment_url ? "file" : "text"),
    attachmentUrl: row.attachment_url ?? null,
    attachmentThumbnailUrl: row.attachment_thumbnail_url ?? null,
    mediaWidth: row.media_width ?? null,
    mediaHeight: row.media_height ?? null,
    mediaDurationSec: row.media_duration_sec ?? null,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
  };
}

// GET /api/search/global?q=&type=all|people|chats|messages|files&limit=12
router.get("/global", async (req, res) => {
  const query = cleanQuery(req.query.q);
  const type = ["all", "people", "chats", "messages", "files"].includes(String(req.query.type))
    ? String(req.query.type)
    : "all";
  const limit = clampLimit(req.query.limit);
  if (query.length < 2) {
    return res.json({ query, users: [], conversations: [], messages: [], files: [] });
  }

  const normalizedQuery = query.toLowerCase();
  const pattern = `%${query}%`;
  const includePeople = type === "all" || type === "people";
  const includeChats = type === "all" || type === "chats";
  const includeMessages = type === "all" || type === "messages";
  const includeFiles = type === "all" || type === "files";

  const [context, usersResult] = await Promise.all([
    visibleConversationContext(req.userId),
    includePeople
      ? safe(
        supabase
          .from("users")
          .select("id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame,verified")
          .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
          .neq("id", req.userId)
          .limit(limit),
        { data: [], error: null },
      )
      : Promise.resolve({ data: [] }),
  ]);

  const conversations = includeChats
    ? [...context.byId.values()]
      .map((conversation) => ({ conversation, score: conversationScore(conversation, normalizedQuery) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.conversation.title.localeCompare(right.conversation.title, "ru"))
      .slice(0, limit)
      .map((entry) => entry.conversation)
    : [];

  let messageRows = [];
  let fileRows = [];
  if (context.conversationIds.length > 0) {
    const baseSelect = "id,conversation_id,sender_id,text,type,attachment_url,attachment_thumbnail_url,media_width,media_height,media_duration_sec,created_at,edited_at,deleted_at";
    const queries = [];
    if (includeMessages) {
      queries.push(safe(
        supabase
          .from("messages")
          .select(baseSelect)
          .in("conversation_id", context.conversationIds)
          .is("deleted_at", null)
          .ilike("text", pattern)
          .order("created_at", { ascending: false })
          .limit(limit),
        { data: [], error: null },
      ));
    } else queries.push(Promise.resolve({ data: [] }));

    if (includeFiles) {
      queries.push(safe(
        supabase
          .from("messages")
          .select(baseSelect)
          .in("conversation_id", context.conversationIds)
          .is("deleted_at", null)
          .not("attachment_url", "is", null)
          .or(`text.ilike.${pattern},attachment_url.ilike.${pattern}`)
          .order("created_at", { ascending: false })
          .limit(limit),
        { data: [], error: null },
      ));
    } else queries.push(Promise.resolve({ data: [] }));

    const [messagesResult, filesResult] = await Promise.all(queries);
    messageRows = messagesResult.data || [];
    fileRows = filesResult.data || [];
  }

  const senderMap = await fetchUsers([...messageRows, ...fileRows].map((row) => row.sender_id));
  res.json({
    query,
    users: (usersResult.data || []).map(publicUser).filter(Boolean),
    conversations,
    messages: messageRows.map((row) => messageResult(row, senderMap, context.byId)),
    files: fileRows.map((row) => messageResult(row, senderMap, context.byId)),
  });
});

module.exports = router;
