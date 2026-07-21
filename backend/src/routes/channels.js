// Channels routes — public channel directory, channel roles, subscriptions and channel posts
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { supabase } = require("../lib/supabase");

const SITE_ADMIN_ROLES = ["admin", "owner", "co_owner", "moderator"];
const CHANNEL_ROLES = ["owner", "co_owner", "admin", "editor", "moderator"];
const ROLE_LABELS = {
  owner: "Владелец",
  co_owner: "Совладелец",
  admin: "Админ",
  editor: "Редактор",
  moderator: "Модератор",
};
const CHANNEL_MAX_LEVEL = 3;
const CHANNEL_COLORS_PER_LEVEL = 8;
const CHANNEL_FRAMES_PER_LEVEL = 8;
const CHANNEL_COLOR_OPTIONS = [
  // Old channel colors kept exactly, duplicates removed.
  "#a855f7", "#ec4899", "#fbbf24", "#22d3ee", "#34d399", "#818cf8", "#fb7185", "#f97316",
  "#14b8a6", "#e879f9", "#c084fc", "#60a5fa", "#facc15", "#f472b6", "#ffffff",
  // New colors.
  "#a78bfa", "#ff4ecd", "#8b5cf6", "#fde047", "#2dd4bf", "#ff7f50", "#cbd5e1", "#84cc16", "#bae6fd", "#d97706", "#00f5d4", "#ef4444", "#6ee7b7", "#c4b5fd", "#38bdf8", "#2563eb", "#9ca3af",
];
const CHANNEL_FRAME_OPTIONS = [
  // Level 1 — one-color frames.
  "solid:#a855f7", "solid:#ec4899", "solid:#fbbf24", "solid:#22d3ee", "solid:#34d399", "solid:#fb7185", "solid:#60a5fa", "solid:#f97316",
  // Level 2 — two-color frames.
  "dual:#a855f7:#ec4899", "dual:#22d3ee:#a855f7", "dual:#fbbf24:#f97316", "dual:#34d399:#14b8a6", "dual:#60a5fa:#818cf8", "dual:#f472b6:#c084fc", "dual:#ffffff:#a855f7", "dual:#fb7185:#fbbf24",
  // Level 3 — animated/special frames.
  "rainbow", "gradient", "premium", "aurora", "prism", "cosmic", "fire", "ice",
];

async function safe(promise, fallback = { data: [], error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

async function fetchUsersByIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return new Map();
  let result = await safe(
    supabase.from("users").select("id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame,verified").in("id", ids),
    { data: [], error: null },
  );
  if (result.error && /verified|schema cache/i.test(result.error.message || "")) {
    result = await safe(
      supabase.from("users").select("id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame").in("id", ids),
      { data: [], error: null },
    );
  }
  const map = new Map();
  for (const user of result.data || []) map.set(String(user.id), user);
  return map;
}

function serializeChatParticipant(part, user) {
  if (!user) return null;
  const avatarFrame = user.avatar_frame || null;
  return {
    id: user.id,
    username: user.username || "",
    displayName: user.display_name || user.username || "Пользователь",
    avatarUrl: user.avatar_url || null,
    nameColor: user.name_color || "#ffffff",
    role: "member",
    appRole: user.role || "user",
    isPremium: user.is_premium || false,
    avatarFrame,
    verified: Boolean(user.verified || avatarFrame === "verified"),
    isOnline: false,
  };
}

function channelChatTitle(channel) {
  return `${channel.name} · чат`;
}

function channelChatDescription(channel) {
  return `Чат канала @${channel.handle}`;
}

async function findReusableChannelChat(channel) {
  const candidates = [];
  const add = (rows) => {
    for (const row of rows || []) {
      if (row?.id && !candidates.some((item) => item.id === row.id)) candidates.push(row);
    }
  };

  const byChannel = await safe(
    supabase.from("conversations").select("*").eq("type", "group").eq("channel_id", channel.id),
    { data: [], error: null },
  );
  if (!byChannel.error) add(byChannel.data);

  const byDescription = await safe(
    supabase.from("conversations").select("*").eq("type", "group").eq("description", channelChatDescription(channel)),
    { data: [], error: null },
  );
  if (!byDescription.error) add(byDescription.data);

  const byTitle = await safe(
    supabase.from("conversations").select("*").eq("type", "group").eq("title", channelChatTitle(channel)),
    { data: [], error: null },
  );
  if (!byTitle.error) add(byTitle.data);

  if (candidates.length === 0) return null;
  const ids = candidates.map((row) => row.id);
  const { data: parts } = await safe(
    supabase.from("conversation_participants").select("conversation_id,user_id").in("conversation_id", ids),
    { data: [], error: null },
  );
  const counts = new Map();
  const hasOwner = new Set();
  for (const part of parts || []) {
    counts.set(part.conversation_id, (counts.get(part.conversation_id) || 0) + 1);
    if (part.user_id === channel.owner_id) hasOwner.add(part.conversation_id);
  }

  return candidates
    .map((row) => ({ ...row, _count: counts.get(row.id) || 0, _hasOwner: hasOwner.has(row.id) }))
    .sort((a, b) => Number(b._hasOwner) - Number(a._hasOwner) || b._count - a._count || new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())[0];
}

async function upsertChannelChatConversationLink(channel, conversationId) {
  await safe(supabase.from("channels").update({ chat_conversation_id: conversationId }).eq("id", channel.id));
  await safe(supabase.from("conversations").update({ channel_id: channel.id }).eq("id", conversationId));
}

function slugifyHandle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
}

function validHandle(handle) {
  return /^[a-z0-9_]{3,32}$/.test(handle || "");
}

async function handleTaken(handle, excludeChannelId = null) {
  const normalized = slugifyHandle(handle);
  const [{ data: user }, channelResult] = await Promise.all([
    safe(supabase.from("users").select("id").eq("username", normalized).maybeSingle(), { data: null, error: null }),
    safe(supabase.from("channels").select("id").eq("handle", normalized).maybeSingle(), { data: null, error: null }),
  ]);
  const channel = channelResult.data;
  return Boolean(user || (channel && String(channel.id) !== String(excludeChannelId || "")));
}

async function getActiveChannelBoosts(channelId) {
  const now = new Date().toISOString();
  const { data: boosts } = await safe(
    supabase
      .from("channel_boosts")
      .select("id,user_id,expires_at,kind,value")
      .eq("channel_id", channelId)
      .gt("expires_at", now),
    { data: [], error: null },
  );
  const userIds = [...new Set((boosts || []).map((b) => b.user_id).filter(Boolean))];
  if (userIds.length === 0) return [];
  const { data: users } = await safe(
    supabase.from("users").select("id,is_premium,premium_until").in("id", userIds),
    { data: [], error: null },
  );
  const premiumUsers = new Set((users || [])
    .filter((u) => u.is_premium && (!u.premium_until || new Date(u.premium_until).getTime() > Date.now()))
    .map((u) => u.id));
  return (boosts || []).filter((b) => premiumUsers.has(b.user_id));
}

function getChannelBoostMeta(channel, activeBoostCount = 0) {
  const subscribers = Math.max(1, Number(channel?.subscribers_count || 1));
  const needPerLevel = Math.max(1, Math.ceil(subscribers / 25));
  const activeBoosts = Math.max(0, Number(activeBoostCount || 0));
  const level = Math.min(CHANNEL_MAX_LEVEL, Math.floor(activeBoosts / needPerLevel));
  const nextLevelBoosts = level >= CHANNEL_MAX_LEVEL ? CHANNEL_MAX_LEVEL * needPerLevel : (level + 1) * needPerLevel;
  return {
    level,
    activeBoosts,
    needPerLevel,
    nextLevelBoosts,
    maxBoosts: CHANNEL_MAX_LEVEL * needPerLevel,
    storyLimit: level,
    unlockedColors: level * CHANNEL_COLORS_PER_LEVEL,
    unlockedFrames: level * CHANNEL_FRAMES_PER_LEVEL,
    priority: level >= 3,
  };
}

function normalizeBoostColor(value) {
  const color = String(value || "").trim().toLowerCase();
  if (!color || color === "#ffffff" || color === "white" || color === "none" || color === "null") return null;
  return color;
}

function normalizeBoostFrame(value) {
  const frame = String(value || "").trim();
  if (!frame || frame === "none" || frame === "null") return null;
  return frame;
}

function isMissingBoostBalance(error) {
  return /boost_balance|schema cache|column .*boost/i.test(error?.message || "");
}

function isAllowedBoostColor(value, meta) {
  if (!value) return true;
  return CHANNEL_COLOR_OPTIONS.slice(0, meta.unlockedColors).map((x) => x.toLowerCase()).includes(String(value).toLowerCase());
}

function isAllowedBoostFrame(value, meta) {
  if (!value) return true;
  return CHANNEL_FRAME_OPTIONS.slice(0, meta.unlockedFrames).includes(value);
}

async function getChannelRole(channelId, userId) {
  const { data: channel } = await safe(
    supabase.from("channels").select("owner_id").eq("id", channelId).maybeSingle(),
    { data: null, error: null },
  );
  if (!channel) return null;
  if (channel.owner_id === userId) return "owner";
  const { data: role } = await safe(
    supabase.from("channel_roles").select("role").eq("channel_id", channelId).eq("user_id", userId).maybeSingle(),
    { data: null, error: null },
  );
  return role?.role || null;
}

function isSiteAdmin(req) {
  return SITE_ADMIN_ROLES.includes(req.userRole || "");
}

async function canEditChannel(req, channel) {
  if (isSiteAdmin(req) || channel.owner_id === req.userId) return true;
  const role = await getChannelRole(channel.id, req.userId);
  return ["co_owner", "admin"].includes(role || "");
}

async function canPostAsChannel(req, channel) {
  if (isSiteAdmin(req) || channel.owner_id === req.userId) return true;
  const role = await getChannelRole(channel.id, req.userId);
  return ["co_owner", "admin", "editor"].includes(role || "");
}

async function canManageRoles(req, channel) {
  if (isSiteAdmin(req) || channel.owner_id === req.userId) return true;
  const role = await getChannelRole(channel.id, req.userId);
  return role === "co_owner";
}

async function canModerateChannel(req, channel) {
  if (isSiteAdmin(req) || channel.owner_id === req.userId) return true;
  const role = await getChannelRole(channel.id, req.userId);
  return ["co_owner", "admin", "moderator"].includes(role || "");
}

async function getActiveChannelBan(channelId, userId) {
  if (!channelId || !userId) return null;
  const { data } = await safe(
    supabase.from("channel_bans").select("*").eq("channel_id", channelId).eq("user_id", userId).maybeSingle(),
    { data: null, error: null },
  );
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    await safe(supabase.from("channel_bans").delete().eq("channel_id", channelId).eq("user_id", userId));
    return null;
  }
  return data;
}

async function logChannelModeration({ channelId, actorId, action, targetUserId = null, targetPostId = null, targetCommentId = null, reason = null, meta = {} }) {
  await safe(supabase.from("channel_moderation_log").insert({
    channel_id: channelId,
    actor_id: actorId,
    action,
    target_user_id: targetUserId,
    target_post_id: targetPostId,
    target_comment_id: targetCommentId,
    reason: reason || null,
    meta: meta || {},
  }));
}

async function isChannelSubscriber(channelId, userId) {
  const { data } = await safe(
    supabase
      .from("channel_subscriptions")
      .select("channel_id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .maybeSingle(),
    { data: null, error: null },
  );
  return Boolean(data);
}

async function canAccessChannel(req, channel) {
  if (await canModerateChannel(req, channel)) return true;
  if (await getActiveChannelBan(channel.id, req.userId)) return false;
  if (!channel.is_private) return true;
  return isChannelSubscriber(channel.id, req.userId);
}

async function ensureOwnerRole(channelId, ownerId) {
  if (!channelId || !ownerId) return;
  await safe(
    supabase
      .from("channel_roles")
      .upsert({ channel_id: channelId, user_id: ownerId, role: "owner" }, { onConflict: "channel_id,user_id" }),
  );
}

function serializeChannel(c, subscribed = false, myRole = null) {
  const boostMeta = c.boost_meta || getChannelBoostMeta(c, c.active_boosts || 0);
  return {
    id: c.id,
    name: c.name,
    handle: c.handle,
    avatarUrl: c.avatar_url,
    bannerUrl: c.banner_url || null,
    description: c.description,
    tags: c.tags || [],
    subscribersCount: c.subscribers_count || 0,
    verified: c.verified || false,
    ownerId: c.owner_id,
    hideSubscribers: c.hide_subscribers || false,
    isPrivate: c.is_private || false,
    chatEnabled: c.chat_enabled !== false,
    commentsEnabled: c.comments_enabled !== false,
    commentSlowModeSeconds: Math.max(0, Number(c.comment_slow_mode_seconds || 0)),
    chatConversationId: c.chat_conversation_id || null,
    boostColor: c.boost_color || null,
    boostGlow: c.boost_glow || null,
    boostAvatarFrame: c.boost_avatar_frame || null,
    boostedUntil: c.boosted_until || null,
    activeBoosts: boostMeta.activeBoosts,
    boostLevel: boostMeta.level,
    boostMeta,
    availableBoostColors: CHANNEL_COLOR_OPTIONS.slice(0, boostMeta.unlockedColors),
    availableBoostFrames: CHANNEL_FRAME_OPTIONS.slice(0, boostMeta.unlockedFrames),
    myRole,
    subscribed,
  };
}

async function serializeChannelPosts(posts, channel, userId) {
  const activeBoosts = await getActiveChannelBoosts(channel.id);
  channel.active_boosts = activeBoosts.length;
  channel.boost_meta = getChannelBoostMeta(channel, activeBoosts.length);
  const myRole = await getChannelRole(channel.id, userId);
  const ids = posts.map((p) => p.id);
  const [{ data: media }, { data: likes }, { data: saves }] = await Promise.all([
    ids.length ? supabase.from("post_media").select("*").in("post_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("post_likes").select("post_id").eq("user_id", userId) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("post_saves").select("post_id").eq("user_id", userId) : Promise.resolve({ data: [] }),
  ]);
  const likedSet = new Set((likes || []).map((x) => x.post_id));
  const savedSet = new Set((saves || []).map((x) => x.post_id));
  const mediaByPost = (media || []).reduce((acc, m) => { (acc[m.post_id] = acc[m.post_id] || []).push(m); return acc; }, {});
  return posts.map((p) => ({
    id: p.id,
    author: { kind: "channel", channel: serializeChannel(channel, false, myRole) },
    text: p.text,
    media: mediaByPost[p.id] || [],
    tags: p.tags || [],
    likesCount: p.likes_count || 0,
    commentsCount: p.comments_count || 0,
    viewsCount: p.views_count || 0,
    sharesCount: p.shares_count || 0,
    liked: likedSet.has(p.id),
    saved: savedSet.has(p.id),
    createdAt: p.created_at,
  }));
}

router.get("/", async (req, res) => {
  const { data: channels, error } = await safe(
    supabase.from("channels").select("*").order("subscribers_count", { ascending: false }).limit(100),
  );
  if (error) return res.json([]);

  const { data: subs } = await safe(
    supabase.from("channel_subscriptions").select("channel_id").eq("user_id", req.userId),
  );
  const subscribed = new Set((subs || []).map((s) => s.channel_id));
  const out = [];
  for (const c of channels || []) {
    const activeBoosts = await getActiveChannelBoosts(c.id);
    c.active_boosts = activeBoosts.length;
    c.boost_meta = getChannelBoostMeta(c, activeBoosts.length);
    const myRole = await getChannelRole(c.id, req.userId);
    out.push(serializeChannel(c, subscribed.has(c.id), myRole));
  }
  res.json(out);
});

router.get("/my-boosts", async (req, res) => {
  const { data: me } = await safe(supabase.from("users").select("is_premium,premium_until").eq("id", req.userId).single(), { data: null, error: null });
  if (!me?.is_premium || (me.premium_until && new Date(me.premium_until).getTime() <= Date.now())) return res.json([]);
  const now = new Date().toISOString();
  const { data, error } = await safe(
    supabase
      .from("channel_boosts")
      .select("*, channel:channels(id,name,handle,avatar_url,subscribers_count)")
      .eq("user_id", req.userId)
      .gt("expires_at", now)
      .order("created_at", { ascending: false }),
  );
  if (error) return res.json([]);
  res.json((data || []).map((b) => ({
    id: b.id,
    channelId: b.channel_id,
    kind: b.kind,
    value: b.value,
    expiresAt: b.expires_at,
    channel: b.channel,
  })));
});

router.delete("/boosts/:boostId", async (req, res) => {
  const { data: boost } = await safe(
    supabase.from("channel_boosts").select("*").eq("id", req.params.boostId).eq("user_id", req.userId).maybeSingle(),
    { data: null, error: null },
  );
  if (!boost) return res.status(404).json({ error: "Boost not found" });
  await safe(supabase.from("channel_boosts").delete().eq("id", req.params.boostId).eq("user_id", req.userId));
  const userResult = await safe(supabase.from("users").select("boost_balance").eq("id", req.userId).single(), { data: null, error: null });
  if (userResult.error && isMissingBoostBalance(userResult.error)) {
    return res.status(503).json({ error: "В Supabase нет users.boost_balance. Запусти supabase/repair_boost_balance.sql" });
  }
  const balance = (userResult.data?.boost_balance ?? 0) + 1;
  await safe(supabase.from("users").update({ boost_balance: balance }).eq("id", req.userId));
  res.json({ ok: true, boostBalance: balance });
});

router.post("/invite/:code/join", async (req, res) => {
  const { data: invite, error } = await safe(
    supabase
      .from("channel_invites")
      .select("*, channel:channels(*)")
      .eq("code", req.params.code)
      .maybeSingle(),
    { data: null, error: null },
  );
  if (error) return res.status(503).json({ error: "Run channel_invites migration", detail: error.message });
  if (!invite?.channel) return res.status(404).json({ error: "Invite not found" });
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return res.status(410).json({ error: "Invite expired" });
  if (await getActiveChannelBan(invite.channel_id, req.userId)) return res.status(403).json({ error: "Вы заблокированы в этом канале" });

  const existing = await isChannelSubscriber(invite.channel_id, req.userId);
  if (!existing) {
    await safe(supabase.from("channel_subscriptions").insert({ channel_id: invite.channel_id, user_id: req.userId }));
    const count = (invite.channel.subscribers_count || 0) + 1;
    await safe(supabase.from("channels").update({ subscribers_count: count }).eq("id", invite.channel_id));
  }
  await safe(supabase.from("channel_invites").update({ uses_count: (invite.uses_count || 0) + 1 }).eq("id", invite.id));

  let conversationId = invite.channel.chat_conversation_id || null;
  if (invite.channel.chat_enabled !== false) {
    if (!conversationId) {
      const created = await safe(
        supabase.from("conversations").insert({
          type: "group",
          title: `${invite.channel.name} · чат`,
          avatar_url: invite.channel.avatar_url || null,
          description: `Чат канала @${invite.channel.handle}`,
        }).select("*").single(),
        { data: null, error: null },
      );
      if (created.data?.id) {
        conversationId = created.data.id;
        await safe(supabase.from("channels").update({ chat_conversation_id: conversationId }).eq("id", invite.channel_id));
      }
    }
    if (conversationId) {
      await safe(supabase.from("conversation_participants").upsert({
        conversation_id: conversationId,
        user_id: req.userId,
        role: invite.channel.owner_id === req.userId ? "owner" : "member",
      }, { onConflict: "conversation_id,user_id" }));
    }
  }

  res.json({ ok: true, channelId: invite.channel_id, handle: invite.channel.handle, conversationId });
});

router.get("/by-handle/:handle", async (req, res) => {
  const { data: c, error } = await safe(
    supabase.from("channels").select("*").eq("handle", req.params.handle).maybeSingle(),
    { data: null, error: null },
  );
  if (error || !c) return res.status(404).json({ error: "Channel not found" });
  await ensureOwnerRole(c.id, c.owner_id);
  const { data: sub } = await safe(
    supabase.from("channel_subscriptions").select("channel_id").eq("channel_id", c.id).eq("user_id", req.userId).maybeSingle(),
    { data: null, error: null },
  );
  const activeBoosts = await getActiveChannelBoosts(c.id);
  c.active_boosts = activeBoosts.length;
  c.boost_meta = getChannelBoostMeta(c, activeBoosts.length);
  const myRole = await getChannelRole(c.id, req.userId);
  res.json(serializeChannel(c, Boolean(sub), myRole));
});

router.get("/:id/posts", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (!(await canAccessChannel(req, channel))) return res.status(403).json({ error: "Private channel" });
  const { data: rows, error } = await safe(
    supabase.from("posts").select("*").eq("author_channel_id", req.params.id).order("created_at", { ascending: false }).limit(80),
  );
  if (error) return res.status(500).json({ error: error.message });
  const now = Date.now();
  const posts = (rows || [])
    .filter((post) => {
      const status = post.status || "published";
      if (status === "draft") return false;
      if (status === "scheduled" && post.scheduled_at && new Date(post.scheduled_at).getTime() > now) return false;
      return true;
    })
    .slice(0, 40);
  res.json(await serializeChannelPosts(posts, channel, req.userId));
});

router.get("/:id/analytics", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (!(await canEditChannel(req, channel))) return res.status(403).json({ error: "No access" });

  const [{ data: posts }, activeBoosts] = await Promise.all([
    safe(
      supabase
        .from("posts")
        .select("id,text,likes_count,comments_count,views_count,shares_count,status,scheduled_at,created_at")
        .eq("author_channel_id", req.params.id),
      { data: [] },
    ),
    getActiveChannelBoosts(req.params.id),
  ]);
  const rows = posts || [];
  const now = Date.now();
  const published = rows.filter((p) => (p.status || "published") === "published" || ((p.status || "") === "scheduled" && p.scheduled_at && new Date(p.scheduled_at).getTime() <= now));
  const drafts = rows.filter((p) => (p.status || "") === "draft");
  const scheduled = rows.filter((p) => (p.status || "") === "scheduled" && (!p.scheduled_at || new Date(p.scheduled_at).getTime() > now));
  const totals = rows.reduce((acc, post) => {
    acc.likes += post.likes_count || 0;
    acc.comments += post.comments_count || 0;
    acc.views += post.views_count || 0;
    acc.shares += post.shares_count || 0;
    return acc;
  }, { likes: 0, comments: 0, views: 0, shares: 0 });

  const postIds = rows.map((p) => p.id);
  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
  const { data: views } = postIds.length > 0
    ? await safe(
      supabase
        .from("post_views")
        .select("post_id,viewed_at")
        .in("post_id", postIds)
        .gte("viewed_at", since.toISOString()),
      { data: [] },
    )
    : { data: [] };

  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(since.getTime() + index * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      label: date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      views: 0,
      posts: 0,
    };
  });
  const dayMap = new Map(days.map((day) => [day.date, day]));
  for (const view of views || []) {
    const key = String(view.viewed_at || "").slice(0, 10);
    const day = dayMap.get(key);
    if (day) day.views += 1;
  }
  for (const post of published) {
    const key = String(post.created_at || "").slice(0, 10);
    const day = dayMap.get(key);
    if (day) day.posts += 1;
  }

  const topPosts = [...published]
    .sort((a, b) => ((b.views_count || 0) + (b.likes_count || 0) + (b.comments_count || 0) * 2 + (b.shares_count || 0) * 3) - ((a.views_count || 0) + (a.likes_count || 0) + (a.comments_count || 0) * 2 + (a.shares_count || 0) * 3))
    .slice(0, 5)
    .map((post) => ({
      id: post.id,
      text: post.text || "Медиа-пост",
      views: post.views_count || 0,
      likes: post.likes_count || 0,
      comments: post.comments_count || 0,
      shares: post.shares_count || 0,
      engagement: (post.likes_count || 0) + (post.comments_count || 0) + (post.shares_count || 0),
      createdAt: post.created_at,
    }));
  const engagement = totals.likes + totals.comments + totals.shares;

  res.json({
    subscribers: channel.subscribers_count || 0,
    posts: published.length,
    drafts: drafts.length,
    scheduled: scheduled.length,
    boosts: activeBoosts.length,
    engagement,
    engagementRate: totals.views > 0 ? Number(((engagement / totals.views) * 100).toFixed(1)) : 0,
    daily: days,
    topPosts,
    ...totals,
  });
});

router.get("/:id/drafts", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (!(await canPostAsChannel(req, channel))) return res.status(403).json({ error: "No access" });
  const { data, error } = await safe(
    supabase.from("posts").select("*").eq("author_channel_id", req.params.id).in("status", ["draft", "scheduled"]).order("created_at", { ascending: false }).limit(50),
    { data: [], error: null },
  );
  if (error && /status|schema cache/i.test(error.message || "")) return res.json([]);
  if (error) return res.status(500).json({ error: error.message });
  res.json(await serializeChannelPosts(data || [], channel, req.userId));
});

router.post("/:id/drafts/:postId/publish", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (!(await canPostAsChannel(req, channel))) return res.status(403).json({ error: "No access" });
  const { data, error } = await safe(
    supabase.from("posts").update({ status: "published", scheduled_at: null, created_at: new Date().toISOString() }).eq("id", req.params.postId).eq("author_channel_id", req.params.id).select("*").single(),
    { data: null, error: null },
  );
  if (error) return res.status(500).json({ error: error.message });
  const [post] = await serializeChannelPosts([data], channel, req.userId);
  res.json(post);
});

router.delete("/:id/drafts/:postId", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (!(await canPostAsChannel(req, channel))) return res.status(403).json({ error: "No access" });
  await safe(supabase.from("posts").delete().eq("id", req.params.postId).eq("author_channel_id", req.params.id));
  res.json({ ok: true });
});

router.get("/:id/roles", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  const allowed = await canManageRoles(req, channel) || await canEditChannel(req, channel);
  if (!allowed) return res.status(403).json({ error: "No access" });
  await ensureOwnerRole(channel.id, channel.owner_id);

  const { data, error } = await safe(
    supabase
      .from("channel_roles")
      .select("*, user:users(id,username,display_name,avatar_url,name_color,role,is_premium)")
      .eq("channel_id", req.params.id)
      .order("created_at", { ascending: true }),
  );
  if (error) {
    // Graceful fallback if channel_roles migration has not been applied yet.
    const { data: owner } = await safe(
      supabase.from("users").select("id,username,display_name,avatar_url,name_color,role,is_premium").eq("id", channel.owner_id).maybeSingle(),
      { data: null, error: null },
    );
    return res.json([{ channelId: channel.id, userId: channel.owner_id, role: "owner", roleLabel: ROLE_LABELS.owner, user: owner }]);
  }
  res.json((data || []).map((r) => ({
    channelId: r.channel_id,
    userId: r.user_id,
    role: r.role,
    roleLabel: ROLE_LABELS[r.role] || r.role,
    assignedBy: r.assigned_by,
    createdAt: r.created_at,
    user: r.user,
  })));
});

router.post("/", async (req, res) => {
  const { name, handle, description = "", avatarUrl, bannerUrl, tags = [] } = req.body;
  const cleanName = String(name || "").trim().slice(0, 80);
  const cleanHandle = slugifyHandle(handle);
  const cleanTags = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8) : [];
  if (!cleanName) return res.status(400).json({ error: "Укажите название канала" });
  if (!validHandle(cleanHandle)) return res.status(400).json({ error: "Юзернейм канала: 3–32 символа, латиница, цифры и _" });
  if (await handleTaken(cleanHandle)) return res.status(409).json({ error: "Такой @username уже занят пользователем или каналом" });
  if (!avatarUrl) return res.status(400).json({ error: "Добавьте аватарку канала" });
  if (cleanTags.length === 0) return res.status(400).json({ error: "Добавьте хотя бы один тег" });

  const payload = {
    name: cleanName,
    handle: cleanHandle,
    description: String(description || "").slice(0, 300),
    avatar_url: avatarUrl,
    banner_url: bannerUrl || null,
    tags: cleanTags,
    owner_id: req.userId,
  };

  let result = await supabase.from("channels").insert(payload).select("*").single();
  if (result.error && /banner_url|tags|schema cache/i.test(result.error.message || "")) {
    result = await supabase.from("channels").insert({
      name: payload.name,
      handle: payload.handle,
      description: payload.description,
      avatar_url: payload.avatar_url,
      owner_id: req.userId,
    }).select("*").single();
  }
  if (result.error) return res.status(409).json({ error: result.error.message });
  await ensureOwnerRole(result.data.id, req.userId);
  res.status(201).json(result.data);
});

router.patch("/:id", async (req, res) => {
  const { data: channel } = await supabase.from("channels").select("*").eq("id", req.params.id).single();
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  const canEdit = await canEditChannel(req, channel);
  if (!canEdit) return res.status(403).json({ error: "No access" });

  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim().slice(0, 80);
  if (req.body.handle !== undefined) {
    const nextHandle = slugifyHandle(req.body.handle);
    if (!validHandle(nextHandle)) return res.status(400).json({ error: "Юзернейм канала: 3–32 символа, латиница, цифры и _" });
    if (nextHandle !== channel.handle && await handleTaken(nextHandle, channel.id)) return res.status(409).json({ error: "Такой @username уже занят пользователем или каналом" });
    patch.handle = nextHandle;
  }
  if (req.body.description !== undefined) patch.description = String(req.body.description).slice(0, 300);
  if (req.body.avatarUrl !== undefined) patch.avatar_url = req.body.avatarUrl || null;
  if (req.body.bannerUrl !== undefined) patch.banner_url = req.body.bannerUrl || null;
  if (req.body.tags !== undefined) patch.tags = Array.isArray(req.body.tags) ? req.body.tags.slice(0, 8) : [];

  let boostMeta = null;
  if (req.body.boostColor !== undefined || req.body.boostGlow !== undefined || req.body.boostAvatarFrame !== undefined) {
    const activeBoosts = await getActiveChannelBoosts(channel.id);
    boostMeta = getChannelBoostMeta(channel, activeBoosts.length);
  }
  if (req.body.boostColor !== undefined) {
    const color = normalizeBoostColor(req.body.boostColor);
    if (!isAllowedBoostColor(color, boostMeta)) {
      return res.status(403).json({ error: `Цвет доступен с уровня канала. Сейчас уровень ${boostMeta.level}.` });
    }
    patch.boost_color = color;
  }
  if (req.body.boostGlow !== undefined) {
    if (req.body.boostGlow && boostMeta.level < 1) return res.status(403).json({ error: "Glow доступен с 1 уровня буста канала" });
    patch.boost_glow = req.body.boostGlow || null;
  }
  if (req.body.boostAvatarFrame !== undefined) {
    const frame = normalizeBoostFrame(req.body.boostAvatarFrame);
    if (!isAllowedBoostFrame(frame, boostMeta)) {
      return res.status(403).json({ error: `Рамка доступна с уровня канала. Сейчас уровень ${boostMeta.level}.` });
    }
    patch.boost_avatar_frame = frame;
  }
  if (req.body.hideSubscribers !== undefined) patch.hide_subscribers = Boolean(req.body.hideSubscribers);
  if (req.body.isPrivate !== undefined) patch.is_private = Boolean(req.body.isPrivate);
  if (req.body.chatEnabled !== undefined) patch.chat_enabled = Boolean(req.body.chatEnabled);
  if (req.body.commentsEnabled !== undefined) patch.comments_enabled = Boolean(req.body.commentsEnabled);
  if (req.body.commentSlowModeSeconds !== undefined) {
    patch.comment_slow_mode_seconds = Math.min(3600, Math.max(0, Number(req.body.commentSlowModeSeconds) || 0));
  }

  let result = await supabase.from("channels").update(patch).eq("id", req.params.id).select("*").single();
  if (result.error && /banner_url|tags|boost_|hide_subscribers|is_private|chat_enabled|comments_enabled|comment_slow_mode_seconds|chat_conversation_id|schema cache/i.test(result.error.message || "")) {
    delete patch.banner_url;
    delete patch.tags;
    delete patch.boost_color;
    delete patch.boost_glow;
    delete patch.boost_avatar_frame;
    delete patch.hide_subscribers;
    delete patch.is_private;
    delete patch.chat_enabled;
    delete patch.comments_enabled;
    delete patch.comment_slow_mode_seconds;
    delete patch.chat_conversation_id;
    result = await supabase.from("channels").update(patch).eq("id", req.params.id).select("*").single();
  }
  if (result.error) return res.status(500).json({ error: result.error.message });
  if (req.body.commentsEnabled !== undefined || req.body.commentSlowModeSeconds !== undefined) {
    await logChannelModeration({ channelId: channel.id, actorId: req.userId, action: "update_comment_rules", meta: { commentsEnabled: result.data.comments_enabled !== false, commentSlowModeSeconds: Number(result.data.comment_slow_mode_seconds || 0) } });
  }
  res.json(result.data);
});

router.post("/:id/invite", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  const allowed = await canEditChannel(req, channel);
  if (!allowed) return res.status(403).json({ error: "No access" });

  const { data: existing } = await safe(
    supabase
      .from("channel_invites")
      .select("code,expires_at")
      .eq("channel_id", req.params.id)
      .eq("created_by", req.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    { data: null, error: null },
  );
  if (existing?.code && (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())) return res.json({ code: existing.code });

  const code = `ch_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  const { data, error } = await safe(
    supabase
      .from("channel_invites")
      .insert({ channel_id: req.params.id, code, created_by: req.userId, expires_at: null })
      .select("code")
      .single(),
    { data: null, error: null },
  );
  if (error) return res.status(503).json({ error: "Run channel_invites migration", detail: error.message });
  res.status(201).json({ code: data.code });
});

router.post("/:id/roles", async (req, res) => {
  const { userId, role } = req.body;
  if (!userId || !CHANNEL_ROLES.includes(role) || role === "owner") return res.status(400).json({ error: "Invalid role" });
  const { data: channel } = await supabase.from("channels").select("*").eq("id", req.params.id).single();
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  const allowed = await canManageRoles(req, channel);
  if (!allowed) return res.status(403).json({ error: "No access" });
  if (userId === channel.owner_id) return res.status(400).json({ error: "Owner role is managed by transfer" });

  const myRole = await getChannelRole(channel.id, req.userId);
  if (myRole === "co_owner" && role === "co_owner" && !isSiteAdmin(req) && channel.owner_id !== req.userId) {
    return res.status(403).json({ error: "Only owner can assign co-owner" });
  }

  const { error } = await safe(
    supabase.from("channel_roles").upsert({ channel_id: req.params.id, user_id: userId, role, assigned_by: req.userId }, { onConflict: "channel_id,user_id" }),
    { error: null },
  );
  if (error) return res.status(503).json({ error: "Run channel_roles migration", detail: error.message });
  await logChannelModeration({ channelId: channel.id, actorId: req.userId, action: "set_role", targetUserId: userId, meta: { role } });
  res.json({ ok: true, role });
});

router.delete("/:id/roles/:userId", async (req, res) => {
  const { data: channel } = await supabase.from("channels").select("*").eq("id", req.params.id).single();
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  const allowed = await canManageRoles(req, channel);
  if (!allowed) return res.status(403).json({ error: "No access" });
  if (req.params.userId === channel.owner_id) return res.status(400).json({ error: "Cannot remove owner" });
  const { error } = await safe(
    supabase.from("channel_roles").delete().eq("channel_id", req.params.id).eq("user_id", req.params.userId),
    { error: null },
  );
  if (error) return res.status(503).json({ error: "Run channel_roles migration", detail: error.message });
  await logChannelModeration({ channelId: channel.id, actorId: req.userId, action: "remove_role", targetUserId: req.params.userId });
  res.json({ ok: true });
});

router.post("/:id/transfer-owner", async (req, res) => {
  const { newOwnerId, password } = req.body;
  if (!newOwnerId || !password) return res.status(400).json({ error: "New owner and password required" });
  const { data: channel } = await supabase.from("channels").select("*").eq("id", req.params.id).single();
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (channel.owner_id !== req.userId && !isSiteAdmin(req)) return res.status(403).json({ error: "Only owner can transfer channel" });

  const { data: me } = await supabase.from("users").select("password_hash").eq("id", req.userId).single();
  const ok = me?.password_hash ? await bcrypt.compare(password, me.password_hash) : false;
  if (!ok) return res.status(401).json({ error: "Invalid password" });

  const { data: target } = await supabase.from("users").select("id").eq("id", newOwnerId).single();
  if (!target) return res.status(404).json({ error: "New owner not found" });

  const oldOwner = channel.owner_id;
  const { error } = await supabase.from("channels").update({ owner_id: newOwnerId }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await safe(supabase.from("channel_roles").upsert({ channel_id: req.params.id, user_id: newOwnerId, role: "owner", assigned_by: req.userId }, { onConflict: "channel_id,user_id" }));
  if (oldOwner && oldOwner !== newOwnerId) {
    await safe(supabase.from("channel_roles").upsert({ channel_id: req.params.id, user_id: oldOwner, role: "co_owner", assigned_by: req.userId }, { onConflict: "channel_id,user_id" }));
  }
  await logChannelModeration({ channelId: channel.id, actorId: req.userId, action: "transfer_owner", targetUserId: newOwnerId, meta: { previousOwnerId: oldOwner } });
  res.json({ ok: true, ownerId: newOwnerId });
});

router.delete("/:id", async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Password required" });
  const { data: channel } = await supabase.from("channels").select("*").eq("id", req.params.id).single();
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  const myRole = await getChannelRole(channel.id, req.userId);
  const canDelete = channel.owner_id === req.userId || isSiteAdmin(req) || myRole === "co_owner";
  if (!canDelete) return res.status(403).json({ error: "No access" });

  const { data: user } = await supabase.from("users").select("password_hash").eq("id", req.userId).single();
  const ok = user?.password_hash ? await bcrypt.compare(String(password), user.password_hash) : false;
  if (!ok) return res.status(401).json({ error: "Invalid password" });

  const { error } = await supabase.from("channels").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.get("/:id/subscribers", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  const canSeeHidden = await canEditChannel(req, channel) || isSiteAdmin(req);
  const { data, error } = await safe(
    supabase
      .from("channel_subscriptions")
      .select("created_at, user:users(id,username,display_name,avatar_url,name_color,role,is_premium,hide_social)")
      .eq("channel_id", req.params.id)
      .order("created_at", { ascending: false }),
  );
  if (error) return res.json([]);
  res.json((data || []).filter((r) => canSeeHidden || !r.user?.hide_social).map((r) => r.user).filter(Boolean));
});

router.get("/:id/bans", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).maybeSingle(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (!(await canModerateChannel(req, channel))) return res.status(403).json({ error: "No access" });
  const { data, error } = await safe(
    supabase.from("channel_bans").select("*, user:users(id,username,display_name,avatar_url,name_color)").eq("channel_id", req.params.id).order("created_at", { ascending: false }),
    { data: [], error: null },
  );
  if (error) return res.status(503).json({ error: "Run migration_channel_moderation.sql", detail: error.message });
  res.json((data || []).filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now()).map((row) => ({
    userId: row.user_id,
    reason: row.reason || "",
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
    user: row.user || null,
  })));
});

router.post("/:id/bans", async (req, res) => {
  const { userId, reason = "", expiresAt = null } = req.body || {};
  if (!userId) return res.status(400).json({ error: "User required" });
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).maybeSingle(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (!(await canModerateChannel(req, channel))) return res.status(403).json({ error: "No access" });
  if (String(userId) === String(channel.owner_id)) return res.status(400).json({ error: "Нельзя заблокировать владельца канала" });
  const targetRole = await getChannelRole(channel.id, userId);
  if (["owner", "co_owner", "admin", "moderator"].includes(targetRole || "") && !isSiteAdmin(req) && channel.owner_id !== req.userId) {
    return res.status(403).json({ error: "Только владелец может блокировать участника команды" });
  }
  const cleanReason = String(reason || "").trim().slice(0, 300);
  const cleanExpires = expiresAt && !Number.isNaN(new Date(expiresAt).getTime()) ? new Date(expiresAt).toISOString() : null;
  const { error } = await safe(supabase.from("channel_bans").upsert({ channel_id: channel.id, user_id: userId, banned_by: req.userId, reason: cleanReason || null, expires_at: cleanExpires }, { onConflict: "channel_id,user_id" }), { error: null });
  if (error) return res.status(503).json({ error: "Run migration_channel_moderation.sql", detail: error.message });
  await safe(supabase.from("channel_subscriptions").delete().eq("channel_id", channel.id).eq("user_id", userId));
  if (channel.chat_conversation_id) await safe(supabase.from("conversation_participants").delete().eq("conversation_id", channel.chat_conversation_id).eq("user_id", userId));
  const { count } = await safe(supabase.from("channel_subscriptions").select("*", { count: "exact", head: true }).eq("channel_id", channel.id), { count: null, error: null });
  if (typeof count === "number") await safe(supabase.from("channels").update({ subscribers_count: count }).eq("id", channel.id));
  await logChannelModeration({ channelId: channel.id, actorId: req.userId, action: "ban_subscriber", targetUserId: userId, reason: cleanReason, meta: { expiresAt: cleanExpires } });
  req.app.get("io")?.to(`user:${userId}`).emit("channel:banned", { channelId: channel.id, reason: cleanReason, expiresAt: cleanExpires });
  res.json({ ok: true });
});

router.delete("/:id/bans/:userId", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).maybeSingle(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (!(await canModerateChannel(req, channel))) return res.status(403).json({ error: "No access" });
  await safe(supabase.from("channel_bans").delete().eq("channel_id", channel.id).eq("user_id", req.params.userId));
  await logChannelModeration({ channelId: channel.id, actorId: req.userId, action: "unban_subscriber", targetUserId: req.params.userId });
  res.json({ ok: true });
});

router.get("/:id/moderation-log", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).maybeSingle(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (!(await canModerateChannel(req, channel))) return res.status(403).json({ error: "No access" });
  const { data, error } = await safe(
    supabase.from("channel_moderation_log").select("*, actor:users!channel_moderation_log_actor_id_fkey(id,username,display_name), target:users!channel_moderation_log_target_user_id_fkey(id,username,display_name)").eq("channel_id", channel.id).order("created_at", { ascending: false }).limit(100),
    { data: [], error: null },
  );
  if (error) return res.status(503).json({ error: "Run migration_channel_moderation.sql", detail: error.message });
  res.json((data || []).map((row) => ({ id: row.id, action: row.action, reason: row.reason || "", createdAt: row.created_at, actor: row.actor || null, target: row.target || null, meta: row.meta || {} })));
});

router.post("/:id/boost", async (req, res) => {
  const { kind, value } = req.body;
  let userResult = await safe(supabase.from("users").select("is_premium,premium_until,boost_balance").eq("id", req.userId).single(), { data: null, error: null });
  if (userResult.error && isMissingBoostBalance(userResult.error)) {
    return res.status(503).json({ error: "В Supabase нет users.boost_balance. Запусти supabase/repair_boost_balance.sql" });
  }
  const user = userResult.data;
  if (!user?.is_premium || (user.premium_until && new Date(user.premium_until).getTime() <= Date.now())) return res.status(403).json({ error: "Premium required" });
  if ((user.boost_balance ?? 0) <= 0) return res.status(402).json({ error: "No boosts available" });
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });

  const until = user.premium_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const beforeBoosts = await getActiveChannelBoosts(req.params.id);
  const nextMeta = getChannelBoostMeta(channel, beforeBoosts.length + 1);
  const patch = { boosted_until: until };

  if (nextMeta.level > 0) {
    if (kind === "color") {
      const preferred = normalizeBoostColor(value) || CHANNEL_COLOR_OPTIONS[0];
      patch.boost_color = isAllowedBoostColor(preferred, nextMeta) ? preferred : CHANNEL_COLOR_OPTIONS[0];
    }
    if (kind === "glow") patch.boost_glow = value || "gold";
    if (kind === "frame") {
      const preferredFrame = normalizeBoostFrame(value) || CHANNEL_FRAME_OPTIONS[0];
      patch.boost_avatar_frame = isAllowedBoostFrame(preferredFrame, nextMeta) ? preferredFrame : CHANNEL_FRAME_OPTIONS[0];
    }
  }

  const boostInsert = await safe(
    supabase.from("channel_boosts").insert({ channel_id: req.params.id, user_id: req.userId, kind, value: value || null, expires_at: until }),
    { data: null, error: null },
  );
  if (boostInsert.error) return res.status(503).json({ error: "Run channel_boosts migration", detail: boostInsert.error.message });

  let result = await safe(supabase.from("channels").update(patch).eq("id", req.params.id).select("*").single(), { data: null, error: null });
  if (result.error && /boost_|schema cache/i.test(result.error.message || "")) {
    return res.status(503).json({ error: "Run channel boosts migration", detail: result.error.message });
  }
  const balance = Math.max(0, (user.boost_balance ?? 0) - 1);
  await safe(supabase.from("users").update({ boost_balance: balance }).eq("id", req.userId));
  res.json({ ok: true, until, boostBalance: balance, boostMeta: nextMeta, activeBoosts: nextMeta.activeBoosts });
});

router.post("/:id/chat", async (req, res) => {
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", req.params.id).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (channel.chat_enabled === false) return res.status(403).json({ error: "Channel chat disabled" });
  if (!(await canAccessChannel(req, channel))) return res.status(403).json({ error: "Private channel" });

  let conversationId = channel.chat_conversation_id;
  let conversation = null;
  if (conversationId) {
    const existing = await safe(supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle(), { data: null, error: null });
    conversation = existing.data;
    if (!conversation) conversationId = null;
  }

  if (!conversationId) {
    conversation = await findReusableChannelChat(channel);
    if (conversation?.id) {
      conversationId = conversation.id;
      await upsertChannelChatConversationLink(channel, conversationId);
    }
  }

  if (!conversationId) {
    const basePayload = {
      type: "group",
      title: channelChatTitle(channel),
      avatar_url: channel.avatar_url || null,
      description: channelChatDescription(channel),
      channel_id: channel.id,
    };
    let created = await safe(
      supabase.from("conversations").insert(basePayload).select("*").single(),
      { data: null, error: null },
    );
    if (created.error && /channel_id|description|schema cache/i.test(created.error.message || "")) {
      const fallbackPayload = { ...basePayload };
      if (/channel_id|schema cache/i.test(created.error.message || "")) delete fallbackPayload.channel_id;
      if (/description|schema cache/i.test(created.error.message || "")) delete fallbackPayload.description;
      created = await safe(
        supabase.from("conversations").insert(fallbackPayload).select("*").single(),
        { data: null, error: null },
      );
    }
    if (created.error) return res.status(500).json({ error: created.error.message });
    conversation = created.data;
    conversationId = conversation.id;
    await upsertChannelChatConversationLink(channel, conversationId);
  } else {
    const updatePayload = {
      title: channelChatTitle(channel),
      avatar_url: channel.avatar_url || null,
      description: channelChatDescription(channel),
      channel_id: channel.id,
    };
    const updateResult = await safe(supabase.from("conversations").update(updatePayload).eq("id", conversationId), { data: null, error: null });
    if (updateResult.error && /channel_id|description|schema cache/i.test(updateResult.error.message || "")) {
      const fallbackPatch = { ...updatePayload };
      if (/channel_id|schema cache/i.test(updateResult.error.message || "")) delete fallbackPatch.channel_id;
      if (/description|schema cache/i.test(updateResult.error.message || "")) delete fallbackPatch.description;
      await safe(supabase.from("conversations").update(fallbackPatch).eq("id", conversationId));
    }
    await upsertChannelChatConversationLink(channel, conversationId);
  }

  const memberRows = [
    { conversation_id: conversationId, user_id: req.userId, role: "member" },
  ];
  if (channel.owner_id) memberRows.push({ conversation_id: conversationId, user_id: channel.owner_id, role: "member" });

  const { data: roles } = await safe(
    supabase.from("channel_roles").select("user_id,role").eq("channel_id", channel.id).in("role", ["owner", "co_owner", "admin", "moderator", "editor"]),
    { data: [], error: null },
  );
  for (const role of roles || []) {
    if (!role.user_id) continue;
    memberRows.push({ conversation_id: conversationId, user_id: role.user_id, role: "member" });
  }

  const uniqueMembers = Array.from(new Map(memberRows.map((row) => [`${row.conversation_id}:${row.user_id}`, row])).values());
  const upserted = await safe(
    supabase.from("conversation_participants").upsert(uniqueMembers, { onConflict: "conversation_id,user_id" }),
    { data: null, error: null },
  );
  if (upserted.error) return res.status(503).json({ error: "Не удалось подключить чат канала. Проверь таблицу conversation_participants.", detail: upserted.error.message });

  let participantsResult = await safe(
    supabase.from("conversation_participants").select("conversation_id,user_id,role, users(id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame,verified)").eq("conversation_id", conversationId),
    { data: [], error: null },
  );
  if (participantsResult.error && /verified|schema cache/i.test(participantsResult.error.message || "")) {
    participantsResult = await safe(
      supabase.from("conversation_participants").select("conversation_id,user_id,role, users(id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame)").eq("conversation_id", conversationId),
      { data: [], error: null },
    );
  }
  let participants = participantsResult.data || [];
  if (participantsResult.error || participants.some((part) => !part.users)) {
    const plainParticipants = await safe(
      supabase.from("conversation_participants").select("conversation_id,user_id,role").eq("conversation_id", conversationId),
      { data: [], error: null },
    );
    if (!plainParticipants.error && plainParticipants.data?.length) {
      const embeddedByUser = new Map(participants.map((part) => [String(part.user_id || part.users?.id || ""), part.users]));
      participants = plainParticipants.data.map((part) => ({ ...part, users: embeddedByUser.get(String(part.user_id)) }));
    }
  }
  const participantUserMap = await fetchUsersByIds(participants.map((part) => part.user_id || part.users?.id));
  const serializedParticipants = (participants || [])
    .map((part) => serializeChatParticipant(part, part.users || participantUserMap.get(String(part.user_id || part.users?.id || ""))))
    .filter(Boolean);
  res.json({
    ok: true,
    conversationId,
    conversation: {
      id: conversationId,
      type: "group",
      title: channelChatTitle(channel),
      avatarUrl: channel.avatar_url || null,
      participants: serializedParticipants,
      lastMessage: null,
      unreadCount: 0,
      pinned: false,
      muted: false,
      requestStatus: "accepted",
      folder: "groups",
      isOnline: false,
      verified: false,
    },
  });
});

router.post("/:id/subscribe", async (req, res) => {
  const channelId = req.params.id;
  const { data: channel } = await safe(supabase.from("channels").select("*").eq("id", channelId).single(), { data: null, error: null });
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  if (await getActiveChannelBan(channelId, req.userId)) return res.status(403).json({ error: "Вы заблокированы в этом канале" });
  const canDirectSubscribe = !channel.is_private || await canEditChannel(req, channel);
  if (!canDirectSubscribe) return res.status(403).json({ error: "Private channel. Нужна пригласительная ссылка." });

  const { data: existing } = await safe(
    supabase.from("channel_subscriptions").select("channel_id").eq("channel_id", channelId).eq("user_id", req.userId).maybeSingle(),
    { data: null, error: null },
  );

  if (existing) {
    await safe(supabase.from("channel_subscriptions").delete().eq("channel_id", channelId).eq("user_id", req.userId));
    const { data: ch } = await safe(supabase.from("channels").select("subscribers_count").eq("id", channelId).single(), { data: null, error: null });
    await safe(supabase.from("channels").update({ subscribers_count: Math.max(0, (ch?.subscribers_count || 0) - 1) }).eq("id", channelId));
    return res.json({ ok: true, subscribed: false });
  }

  const { error } = await safe(supabase.from("channel_subscriptions").insert({ channel_id: channelId, user_id: req.userId }));
  if (error) return res.status(500).json({ error: error.message });
  const { data: ch } = await safe(supabase.from("channels").select("subscribers_count").eq("id", channelId).single(), { data: null, error: null });
  await safe(supabase.from("channels").update({ subscribers_count: (ch?.subscribers_count || 0) + 1 }).eq("id", channelId));
  res.json({ ok: true, subscribed: true });
});

module.exports = { channelsRouter: router };
