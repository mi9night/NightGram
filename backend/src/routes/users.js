// User routes — profile + update + posts
const router = require("express").Router();
const { supabase } = require("../lib/supabase");
const { blockState, canViewProfile, canViewLastSeen, canMessage } = require("../lib/privacy");

async function safe(promise, fallback = { data: null, error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

const PUBLIC_USER_SELECT = "id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame";


async function pushNotification(req, userId, notification) {
  try {
    const { data } = await supabase.from("notifications").insert({ user_id: userId, ...notification }).select("*").single();
    req.app.get("io")?.to(`user:${userId}`).emit("notification:new", {
      id: data.id, type: data.type, title: data.title, body: data.body || "", avatarUrl: data.avatar_url || null, read: data.read || false, createdAt: data.created_at,
    });
  } catch { /* ignore */ }
}

// CamelCase → snake_case converter
function toSnake(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}


function serializeWallPost(row, liked = false, commentsCount = 0) {
  return {
    ...row,
    profileUserId: row.profile_user_id,
    authorId: row.author_id,
    likesCount: row.likes_count || 0,
    commentsCount,
    liked,
    pinned: Boolean(row.pinned),
    pinnedAt: row.pinned_at || null,
    createdAt: row.created_at,
  };
}

function serializeWallComment(row, liked = false) {
  return {
    ...row,
    wallPostId: row.wall_post_id,
    parentId: row.parent_id || null,
    authorId: row.author_id,
    likesCount: row.likes_count || 0,
    liked,
    pinned: Boolean(row.pinned),
    pinnedAt: row.pinned_at || null,
    createdAt: row.created_at,
  };
}

// GET /api/users/search?q= — search users by username/display name
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (q.length < 2) return res.json([]);
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url, name_color, role, is_premium")
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(25);
  if (error) return res.json([]);
  const visible = [];
  for (const candidate of data || []) {
    if (String(candidate.id) === String(req.userId)) continue;
    const state = await blockState(req.userId, candidate.id);
    if (!state.blocked) visible.push(candidate);
    if (visible.length >= 10) break;
  }
  res.json(visible);
});

// GET /api/users/me  (must be before /:username)
router.get("/me", async (req, res) => {
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", req.userId)
    .single();
  if (!user) return res.status(404).json({ error: "User not found" });
  const { password_hash, ...safe } = user;
  res.json(safe);
});

// GET /api/users/:username/wall — profile wall posts
router.get("/:username/wall", async (req, res) => {
  if (!await assertProfileContentAccess(req, res, req.params.username)) return;
  const { data: profile } = await supabase.from("users").select("id,username").eq("username", req.params.username).single();
  if (!profile) return res.status(404).json({ error: "User not found" });
  let result = await safe(
    supabase
      .from("profile_wall_posts")
      .select("*, author:users!profile_wall_posts_author_id_fkey(id,username,display_name,avatar_url,name_color,role,is_premium)")
      .eq("profile_user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50),
    { data: [], error: null },
  );
  if (result.error) return res.json([]);
  const rows = result.data || [];
  const ids = rows.map((row) => row.id).filter(Boolean);
  const [likesResult, commentsResult] = await Promise.all([
    ids.length ? safe(supabase.from("profile_wall_likes").select("wall_post_id").eq("user_id", req.userId).in("wall_post_id", ids), { data: [], error: null }) : Promise.resolve({ data: [] }),
    ids.length ? safe(supabase.from("profile_wall_comments").select("wall_post_id").in("wall_post_id", ids), { data: [], error: null }) : Promise.resolve({ data: [] }),
  ]);
  const likedSet = new Set((likesResult.data || []).map((row) => row.wall_post_id));
  const counts = new Map();
  for (const comment of commentsResult.data || []) counts.set(comment.wall_post_id, (counts.get(comment.wall_post_id) || 0) + 1);
  const sorted = rows.slice().sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
    || new Date(b.pinned_at || 0).getTime() - new Date(a.pinned_at || 0).getTime()
    || new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  res.json(sorted.map((row) => serializeWallPost(row, likedSet.has(row.id), counts.get(row.id) || 0)));
});

// POST /api/users/:username/wall — write on profile wall
router.post("/:username/wall", async (req, res) => {
  if (!await assertProfileContentAccess(req, res, req.params.username)) return;
  const { text, media = [] } = req.body;
  if (!text && (!Array.isArray(media) || media.length === 0)) return res.status(400).json({ error: "Empty wall post" });
  const { data: profile } = await supabase.from("users").select("id,username").eq("username", req.params.username).single();
  if (!profile) return res.status(404).json({ error: "User not found" });
  if (String(profile.id) !== String(req.userId) && !(await canMessage(profile.id, req.userId))) return res.status(403).json({ error: "privacy_restricted", message: "Пользователь ограничил записи в профиле" });
  const { data, error } = await supabase
    .from("profile_wall_posts")
    .insert({ profile_user_id: profile.id, author_id: req.userId, text: text || null, media })
    .select("*, author:users!profile_wall_posts_author_id_fkey(id,username,display_name,avatar_url,name_color,role,is_premium)")
    .single();
  if (error) return res.status(503).json({ error: "Run profile wall migration", detail: error.message });
  if (profile.id !== req.userId) {
    await pushNotification(req, profile.id, { type: "comment", title: "Новая запись в профиле", body: `@${req.username || "user"} написал на вашей стене`, read: false });
  }
  res.status(201).json(data);
});



// POST /api/users/wall/:postId/pin — pin/unpin wall post on profile
router.post("/wall/:postId/pin", async (req, res) => {
  const { postId } = req.params;
  const { data: post } = await safe(supabase.from("profile_wall_posts").select("id,profile_user_id,author_id,pinned").eq("id", postId).maybeSingle(), { data: null });
  if (!post) return res.status(404).json({ error: "Wall post not found" });
  const { data: me } = await safe(supabase.from("users").select("role").eq("id", req.userId).maybeSingle(), { data: null });
  const isAdmin = ["admin", "owner", "co_owner", "moderator"].includes(me?.role || "");
  const canPin = post.profile_user_id === req.userId || post.author_id === req.userId || isAdmin;
  if (!canPin) return res.status(403).json({ error: "Нет прав на закрепление" });
  const pinned = !Boolean(post.pinned);
  const result = await safe(
    supabase.from("profile_wall_posts").update({ pinned, pinned_at: pinned ? new Date().toISOString() : null }).eq("id", postId).select("pinned,pinned_at").single(),
    { data: null, error: null },
  );
  if (result.error && /pinned|schema cache/i.test(result.error.message || "")) {
    return res.status(503).json({ error: "Run wall pin migration", detail: result.error.message });
  }
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json({ ok: true, pinned: result.data.pinned, pinnedAt: result.data.pinned_at });
});

// DELETE /api/users/wall/:postId — delete wall post
router.delete("/wall/:postId", async (req, res) => {
  const { postId } = req.params;
  const { data: post } = await safe(supabase.from("profile_wall_posts").select("id,profile_user_id,author_id").eq("id", postId).maybeSingle(), { data: null });
  if (!post) return res.status(404).json({ error: "Wall post not found" });
  const { data: me } = await safe(supabase.from("users").select("role").eq("id", req.userId).maybeSingle(), { data: null });
  const isAdmin = ["admin", "owner", "co_owner", "moderator"].includes(me?.role || "");
  if (post.profile_user_id !== req.userId && post.author_id !== req.userId && !isAdmin) return res.status(403).json({ error: "Нет прав на удаление" });
  await safe(supabase.from("profile_wall_posts").delete().eq("id", postId));
  res.json({ ok: true });
});

// POST /api/users/wall/:postId/like — like/unlike profile wall post
router.post("/wall/:postId/like", async (req, res) => {
  const { postId } = req.params;
  const { data: post } = await safe(supabase.from("profile_wall_posts").select("id,profile_user_id,author_id,likes_count").eq("id", postId).maybeSingle(), { data: null, error: null });
  if (!post) return res.status(404).json({ error: "Wall post not found" });
  const { data: existing } = await safe(supabase.from("profile_wall_likes").select("wall_post_id").eq("wall_post_id", postId).eq("user_id", req.userId).maybeSingle(), { data: null, error: null });
  if (existing) {
    await safe(supabase.from("profile_wall_likes").delete().eq("wall_post_id", postId).eq("user_id", req.userId));
  } else {
    const inserted = await safe(supabase.from("profile_wall_likes").insert({ wall_post_id: postId, user_id: req.userId }), { error: null });
    if (inserted.error) return res.status(503).json({ error: "Run profile wall comments migration", detail: inserted.error.message });
    if (post.author_id && post.author_id !== req.userId) await pushNotification(req, post.author_id, { type: "like", title: "Лайк на стене", body: `@${req.username || "user"} лайкнул запись на стене`, read: false });
  }
  const delta = existing ? -1 : 1;
  const likesCount = Math.max(0, (post.likes_count || 0) + delta);
  await safe(supabase.from("profile_wall_posts").update({ likes_count: likesCount }).eq("id", postId));
  res.json({ liked: !existing, likesCount });
});

// GET /api/users/wall/:postId/comments — comments under profile wall post
router.get("/wall/:postId/comments", async (req, res) => {
  const { postId } = req.params;
  const { data, error } = await safe(
    supabase
      .from("profile_wall_comments")
      .select("*, author:users!profile_wall_comments_author_id_fkey(id,username,display_name,avatar_url,name_color,role,is_premium)")
      .eq("wall_post_id", postId)
      .order("created_at", { ascending: true })
      .limit(80),
    { data: [], error: null },
  );
  if (error) return res.json([]);
  const ids = (data || []).map((row) => row.id).filter(Boolean);
  const likes = ids.length ? await safe(supabase.from("profile_wall_comment_likes").select("comment_id").eq("user_id", req.userId).in("comment_id", ids), { data: [] }) : { data: [] };
  const likedSet = new Set((likes.data || []).map((row) => row.comment_id));
  const sorted = (data || []).slice().sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
    || new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  res.json(sorted.map((row) => serializeWallComment(row, likedSet.has(row.id))));
});

// POST /api/users/wall/:postId/comments — add comment/reply to wall post
router.post("/wall/:postId/comments", async (req, res) => {
  const { postId } = req.params;
  const { text, parentId = null } = req.body;
  if (!String(text || "").trim()) return res.status(400).json({ error: "Комментарий пустой" });
  const { data: post } = await safe(supabase.from("profile_wall_posts").select("id,profile_user_id,author_id").eq("id", postId).maybeSingle(), { data: null });
  if (!post) return res.status(404).json({ error: "Wall post not found" });
  const result = await safe(
    supabase.from("profile_wall_comments").insert({ wall_post_id: postId, parent_id: parentId || null, author_id: req.userId, text: String(text).trim().slice(0, 500) })
      .select("*, author:users!profile_wall_comments_author_id_fkey(id,username,display_name,avatar_url,name_color,role,is_premium)").single(),
    { data: null, error: null },
  );
  if (result.error) return res.status(503).json({ error: "Run profile wall comments migration", detail: result.error.message });
  const { data: freshPost } = await safe(supabase.from("profile_wall_posts").select("comments_count").eq("id", postId).maybeSingle(), { data: null });
  await safe(supabase.from("profile_wall_posts").update({ comments_count: (freshPost?.comments_count || 0) + 1 }).eq("id", postId));
  if (post.author_id && post.author_id !== req.userId) await pushNotification(req, post.author_id, { type: "comment", title: "Комментарий на стене", body: `@${req.username || "user"} ответил на запись на стене`, read: false });
  res.status(201).json(serializeWallComment(result.data, false));
});

// POST /api/users/wall/comments/:commentId/like — like/unlike wall comment
router.post("/wall/comments/:commentId/like", async (req, res) => {
  const { commentId } = req.params;
  const { data: comment } = await safe(supabase.from("profile_wall_comments").select("id,author_id,likes_count").eq("id", commentId).maybeSingle(), { data: null });
  if (!comment) return res.status(404).json({ error: "Комментарий не найден" });
  const { data: existing } = await safe(supabase.from("profile_wall_comment_likes").select("comment_id").eq("comment_id", commentId).eq("user_id", req.userId).maybeSingle(), { data: null });
  if (existing) await safe(supabase.from("profile_wall_comment_likes").delete().eq("comment_id", commentId).eq("user_id", req.userId));
  else await safe(supabase.from("profile_wall_comment_likes").insert({ comment_id: commentId, user_id: req.userId }));
  const likesCount = Math.max(0, (comment.likes_count || 0) + (existing ? -1 : 1));
  await safe(supabase.from("profile_wall_comments").update({ likes_count: likesCount }).eq("id", commentId));
  res.json({ liked: !existing, likesCount });
});


// POST /api/users/wall/comments/:commentId/pin — pin/unpin wall comment
router.post("/wall/comments/:commentId/pin", async (req, res) => {
  const { commentId } = req.params;
  const { data: comment } = await safe(
    supabase.from("profile_wall_comments").select("id,author_id,wall_post_id,pinned").eq("id", commentId).maybeSingle(),
    { data: null },
  );
  if (!comment) return res.status(404).json({ error: "Комментарий не найден" });
  const [{ data: me }, { data: wallPost }] = await Promise.all([
    safe(supabase.from("users").select("role").eq("id", req.userId).maybeSingle(), { data: null }),
    safe(supabase.from("profile_wall_posts").select("profile_user_id").eq("id", comment.wall_post_id).maybeSingle(), { data: null }),
  ]);
  const isAdmin = ["admin", "owner", "co_owner", "moderator"].includes(me?.role || "");
  const wallOwnerId = wallPost?.profile_user_id;
  const canPin = comment.author_id === req.userId || wallOwnerId === req.userId || isAdmin;
  if (!canPin) return res.status(403).json({ error: "Нет прав на закрепление" });
  const pinned = !Boolean(comment.pinned);
  const result = await safe(
    supabase.from("profile_wall_comments").update({ pinned, pinned_at: pinned ? new Date().toISOString() : null }).eq("id", commentId).select("pinned,pinned_at").single(),
    { data: null, error: null },
  );
  if (result.error && /pinned|schema cache/i.test(result.error.message || "")) return res.status(503).json({ error: "Run wall pin migration", detail: result.error.message });
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json({ ok: true, pinned: result.data.pinned, pinnedAt: result.data.pinned_at });
});

// DELETE /api/users/wall/comments/:commentId — delete wall comment/replies
router.delete("/wall/comments/:commentId", async (req, res) => {
  const { commentId } = req.params;
  const { data: comment } = await safe(supabase.from("profile_wall_comments").select("id,author_id,wall_post_id").eq("id", commentId).maybeSingle(), { data: null });
  if (!comment) return res.status(404).json({ error: "Комментарий не найден" });
  const { data: me } = await safe(supabase.from("users").select("role").eq("id", req.userId).maybeSingle(), { data: null });
  const isAdmin = ["admin", "owner", "co_owner", "moderator"].includes(me?.role || "");
  if (comment.author_id !== req.userId && !isAdmin) return res.status(403).json({ error: "Нет прав на удаление" });
  await safe(supabase.from("profile_wall_comments").delete().or(`id.eq.${commentId},parent_id.eq.${commentId}`));
  const { data: freshPost } = await safe(supabase.from("profile_wall_posts").select("comments_count").eq("id", comment.wall_post_id).maybeSingle(), { data: null });
  await safe(supabase.from("profile_wall_posts").update({ comments_count: Math.max(0, (freshPost?.comments_count || 0) - 1) }).eq("id", comment.wall_post_id));
  res.json({ ok: true });
});

async function resolveProfileTarget(value) {
  let result = await safe(supabase.from("users").select("*").eq("username", value).maybeSingle(), { data: null, error: null });
  if (!result.data) result = await safe(supabase.from("users").select("*").eq("custom_id", value).maybeSingle(), { data: null, error: null });
  if (!result.data && /^[0-9a-f-]{32,36}$/i.test(value)) result = await safe(supabase.from("users").select("*").eq("id", value).maybeSingle(), { data: null, error: null });
  return result.data || null;
}

async function assertProfileContentAccess(req, res, username) {
  const target = await resolveProfileTarget(username);
  if (!target) { res.status(404).json({ error: "User not found" }); return null; }
  const state = await blockState(req.userId, target.id);
  if (state.blockedByB) { res.status(403).json({ error: "blocked_by_user", message: "Этот пользователь ограничил доступ" }); return null; }
  if (!(await canViewProfile(target.id, req.userId))) { res.status(403).json({ error: "profile_private", message: "Профиль доступен ограниченному кругу" }); return null; }
  return target;
}

// GET /api/users/:username
router.get("/:username", async (req, res) => {
  const data = await resolveProfileTarget(req.params.username);
  if (!data) return res.status(404).json({ error: "User not found" });
  const state = await blockState(req.userId, data.id);
  const profileAllowed = state.blockedByA ? true : (!state.blockedByB && await canViewProfile(data.id, req.userId));
  const lastSeenAllowed = !state.blocked && await canViewLastSeen(data.id, req.userId);
  const { data: presence } = lastSeenAllowed
    ? await supabase.from("presence").select("is_online,last_seen").eq("user_id", data.id).maybeSingle()
    : { data: null };
  const { password_hash, ...safeUser } = data;

  if (!profileAllowed) {
    return res.json({
      id: safeUser.id,
      username: safeUser.username,
      display_name: safeUser.display_name,
      avatar_url: safeUser.avatar_url,
      name_color: safeUser.name_color,
      role: safeUser.role,
      is_premium: safeUser.is_premium,
      verified: safeUser.verified,
      profile_restricted: true,
      is_online: false,
      last_seen: null,
    });
  }

  res.json({
    ...safeUser,
    profile_restricted: false,
    is_online: Boolean(presence?.is_online && (!presence?.last_seen || Date.now() - new Date(presence.last_seen).getTime() < 90_000)),
    last_seen: presence?.last_seen || null,
  });
});

// GET /api/users/:username/posts
router.get("/:username/posts", async (req, res) => {
  if (!await assertProfileContentAccess(req, res, req.params.username)) return;
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("username", req.params.username)
    .single();
  if (!user) return res.status(404).json({ error: "User not found" });

  const { data: posts, error } = await supabase
    .from("posts")
    .select(`*, author:users!posts_author_user_id_fkey(${PUBLIC_USER_SELECT})`)
    .eq("author_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return res.status(500).json({ error: error.message });

  const visible = [];
  for (const post of posts || []) {
    if (post.author_user_id === req.userId || !post.visibility || post.visibility === "public") {
      visible.push(post);
    } else if (post.visibility === "followers") {
      const { data: follow } = await supabase.from("follows").select("follower_id").eq("follower_id", req.userId).eq("following_id", post.author_user_id).maybeSingle();
      if (follow) visible.push(post);
    } else if (post.visibility === "circle" && post.circle_id) {
      const { data: member } = await supabase.from("user_circle_members").select("circle_id").eq("circle_id", post.circle_id).eq("user_id", req.userId).maybeSingle();
      if (member) visible.push(post);
    }
    if (visible.length >= 20) break;
  }

  const ids = visible.map((post) => post.id).filter(Boolean);
  const [mediaResult, likesResult, savesResult] = await Promise.all([
    ids.length ? safe(supabase.from("post_media").select("*").in("post_id", ids).order("position", { ascending: true }), { data: [], error: null }) : Promise.resolve({ data: [] }),
    ids.length ? safe(supabase.from("post_likes").select("post_id").eq("user_id", req.userId).in("post_id", ids), { data: [], error: null }) : Promise.resolve({ data: [] }),
    ids.length ? safe(supabase.from("post_saves").select("post_id").eq("user_id", req.userId).in("post_id", ids), { data: [], error: null }) : Promise.resolve({ data: [] }),
  ]);
  const mediaByPost = (mediaResult.data || []).reduce((acc, item) => {
    (acc[item.post_id] ||= []).push({
      id: item.id,
      type: item.type,
      url: item.url,
      thumbnailUrl: item.thumbnail_url || undefined,
      width: item.width,
      height: item.height,
      durationSec: item.duration_sec,
    });
    return acc;
  }, {});
  const likedSet = new Set((likesResult.data || []).map((row) => row.post_id));
  const savedSet = new Set((savesResult.data || []).map((row) => row.post_id));

  const sortedVisible = visible.slice().sort((a, b) => Number(Boolean(b.pinned_on_profile)) - Number(Boolean(a.pinned_on_profile))
    || new Date(b.pinned_at || 0).getTime() - new Date(a.pinned_at || 0).getTime()
    || new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  res.json(sortedVisible.map((post) => ({
    ...post,
    pinnedOnProfile: Boolean(post.pinned_on_profile),
    pinnedAt: post.pinned_at || null,
    media: mediaByPost[post.id] || [],
    liked: likedSet.has(post.id),
    saved: savedSet.has(post.id),
  })));
});

// GET /api/users/:username/followers
router.get("/:username/followers", async (req, res) => {
  if (!await assertProfileContentAccess(req, res, req.params.username)) return;
  const { data: user } = await supabase.from("users").select("id,hide_social").eq("username", req.params.username).single();
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.hide_social && user.id !== req.userId) return res.json({ hidden: true, users: [] });
  const { data, error } = await supabase
    .from("follows")
    .select("follower:users!follows_follower_id_fkey(id,username,display_name,avatar_url,name_color,role,is_premium)")
    .eq("following_id", user.id)
    .limit(100);
  if (error) return res.json({ hidden: false, users: [] });
  res.json({ hidden: false, users: (data || []).map((r) => r.follower).filter(Boolean) });
});

// GET /api/users/:username/following
router.get("/:username/following", async (req, res) => {
  if (!await assertProfileContentAccess(req, res, req.params.username)) return;
  const { data: user } = await supabase.from("users").select("id,hide_social").eq("username", req.params.username).single();
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.hide_social && user.id !== req.userId) return res.json({ hidden: true, users: [] });
  const { data, error } = await supabase
    .from("follows")
    .select("following:users!follows_following_id_fkey(id,username,display_name,avatar_url,name_color,role,is_premium)")
    .eq("follower_id", user.id)
    .limit(100);
  if (error) return res.json({ hidden: false, users: [] });
  res.json({ hidden: false, users: (data || []).map((r) => r.following).filter(Boolean) });
});


// GET /api/users/:username/gifts — public gift wall
router.get("/:username/gifts", async (req, res) => {
  if (!await assertProfileContentAccess(req, res, req.params.username)) return;
  const { data: profile } = await supabase.from("users").select("id,hide_purchases").eq("username", req.params.username).maybeSingle();
  if (!profile) return res.status(404).json({ error: "User not found" });
  if (profile.hide_purchases && profile.id !== req.userId) return res.json([]);

  const result = await supabase
    .from("user_gifts")
    .select("*, sender:users!user_gifts_sender_id_fkey(id,username,display_name,avatar_url,name_color,is_premium), item:store_items(*)")
    .eq("recipient_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (result.error && /user_gifts|schema cache|relationship/i.test(result.error.message || "")) return res.json([]);
  if (result.error) return res.json([]);
  res.json(result.data || []);
});

// GET /api/users/:username/comments
router.get("/:username/comments", async (req, res) => {
  if (!await assertProfileContentAccess(req, res, req.params.username)) return;
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("username", req.params.username)
    .single();
  if (!user) return res.status(404).json({ error: "User not found" });

  const { data, error } = await supabase
    .from("comments")
    .select(`*, author:users!comments_author_id_fkey(${PUBLIC_USER_SELECT})`)
    .eq("author_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return res.json([]);
  res.json(data || []);
});

// PATCH /api/users/me — accepts BOTH camelCase and snake_case
router.patch("/me", async (req, res) => {
  const allowed = [
    "display_name", "displayName",
    "bio",
    "name_color", "nameColor", "nameColorId",
    "avatar_url", "avatarUrl",
    "banner_url", "bannerUrl",
    "glow_effect", "glowEffect",
    "avatar_frame", "avatarFrame",
    "custom_id", "customId",
    "notification_settings", "notificationSettings",
    "hide_social", "hideSocial",
    "hide_purchases", "hidePurchases",
    "privacy_profile", "privacyProfile",
    "privacy_messages", "privacyMessages",
    "privacy_groups", "privacyGroups",
    "privacy_last_seen", "privacyLastSeen",
    "hide_read_receipts", "hideReadReceipts",
    "filter_unknown_messages", "filterUnknownMessages",
    "night_status_text", "nightStatusText",
    "night_status_emoji", "nightStatusEmoji",
    "night_status_expires_at", "nightStatusExpiresAt",
    "music_artist", "musicArtist",
    "music_track", "musicTrack",
    "room_scene", "roomScene",
  ];

  const patch = {};
  for (const key of Object.keys(req.body)) {
    if (allowed.includes(key)) {
      const snakeKey = toSnake(key);
      patch[snakeKey] = req.body[key];
    }
  }

  // Supabase accepts plain JavaScript objects for JSONB notification_settings.

  let result = await supabase
    .from("users")
    .update(patch)
    .eq("id", req.userId)
    .select("*")
    .single();
  if (result.error && /night_status|music_|room_scene|hide_purchases|privacy_|hide_read_receipts|filter_unknown_messages|schema cache/i.test(result.error.message || "")) {
    delete patch.hide_purchases;
    delete patch.privacy_profile;
    delete patch.privacy_messages;
    delete patch.privacy_groups;
    delete patch.privacy_last_seen;
    delete patch.hide_read_receipts;
    delete patch.filter_unknown_messages;
    delete patch.night_status_text;
    delete patch.night_status_emoji;
    delete patch.night_status_expires_at;
    delete patch.music_artist;
    delete patch.music_track;
    delete patch.room_scene;
    result = await supabase
      .from("users")
      .update(patch)
      .eq("id", req.userId)
      .select("*")
      .single();
  }
  if (result.error) return res.status(500).json({ error: result.error.message });
  const { password_hash, ...safe } = result.data;
  res.json(safe);
});

module.exports = { usersRouter: router };
