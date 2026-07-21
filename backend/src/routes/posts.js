// Posts routes — create, like, save, comment, view
const router = require("express").Router();
const { supabase } = require("../lib/supabase");
const { consumeRateLimitDistributed, checkDuplicate, assessLinksWithRules, getTrustProfile, trustLimit, shouldRestrictLinks, hasRestriction, rateLimitResponse, logSpamEvent, createModerationFlag } = require("../lib/safety");
const { hasActivePunishment, punishmentMessage } = require("../lib/punishments");

async function safe(promise, fallback = { data: null, error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

const PUBLIC_USER_SELECT = "id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame";
const SITE_ADMIN_ROLES = ["admin", "owner", "co_owner", "moderator"];

async function getChannelPostContext(postId) {
  const { data: post } = await safe(
    supabase.from("posts").select("id,author_channel_id,author_user_id,comments_count").eq("id", postId).maybeSingle(),
    { data: null, error: null },
  );
  if (!post?.author_channel_id) return { post, channel: null };
  const { data: channel } = await safe(
    supabase.from("channels").select("id,owner_id,comments_enabled,comment_slow_mode_seconds").eq("id", post.author_channel_id).maybeSingle(),
    { data: null, error: null },
  );
  return { post, channel };
}

async function getChannelRole(channelId, userId) {
  const { data } = await safe(
    supabase.from("channel_roles").select("role").eq("channel_id", channelId).eq("user_id", userId).maybeSingle(),
    { data: null, error: null },
  );
  return data?.role || null;
}

async function canModerateChannelPost(req, channel) {
  if (!channel) return false;
  if (SITE_ADMIN_ROLES.includes(req.userRole || "") || channel.owner_id === req.userId) return true;
  const role = await getChannelRole(channel.id, req.userId);
  return ["owner", "co_owner", "admin", "moderator"].includes(role || "");
}

async function getActiveChannelBan(channelId, userId) {
  const { data } = await safe(
    supabase.from("channel_bans").select("expires_at").eq("channel_id", channelId).eq("user_id", userId).maybeSingle(),
    { data: null, error: null },
  );
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    await safe(supabase.from("channel_bans").delete().eq("channel_id", channelId).eq("user_id", userId));
    return null;
  }
  return data;
}

async function logChannelAction({ channelId, actorId, action, targetCommentId = null, reason = null }) {
  await safe(supabase.from("channel_moderation_log").insert({ channel_id: channelId, actor_id: actorId, action, target_comment_id: targetCommentId, reason }));
}

async function canViewPost(post, viewerId) {
  if (!post) return false;
  if (post.author_channel_id) return true;
  if (post.author_user_id === viewerId) return true;
  const visibility = post.visibility || "public";
  if (visibility === "public") return true;
  if (visibility === "followers") {
    const { data } = await safe(
      supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", post.author_user_id).maybeSingle(),
      { data: null, error: null },
    );
    return Boolean(data);
  }
  if (visibility === "circle" && post.circle_id) {
    const { data } = await safe(
      supabase.from("user_circle_members").select("circle_id").eq("circle_id", post.circle_id).eq("user_id", viewerId).maybeSingle(),
      { data: null, error: null },
    );
    return Boolean(data);
  }
  return false;
}

async function pushNotification(req, userId, notification) {
  try {
    const { data } = await supabase.from("notifications").insert({ user_id: userId, ...notification }).select("*").single();
    req.app.get("io")?.to(`user:${userId}`).emit("notification:new", {
      id: data.id, type: data.type, title: data.title, body: data.body || "", avatarUrl: data.avatar_url || null, read: data.read || false, createdAt: data.created_at,
    });
  } catch { /* ignore notification errors */ }
}

// POST /api/posts — create a new post
router.post("/", async (req, res) => {
  const { text, media = [], tags = [], authorChannelId, visibility = "public", circleId = null, status = "published", scheduledAt = null } = req.body;
  const mute = await hasActivePunishment(req.userId, "mute_posts");
  if (mute) return res.status(403).json({ error: punishmentMessage(mute), code: "PUNISHED", type: "mute_posts" });
  const trust = await getTrustProfile(req.userId);
  const postLimit = await consumeRateLimitDistributed(`posts:create:${req.userId}`, { limit: trustLimit(12, trust, { new: 0.45, low: 0.65, trusted: 1.7, staff: 5 }), windowMs: 60 * 60 * 1000 });
  if (!postLimit.allowed) {
    await logSpamEvent({ userId: req.userId, eventType: "post_rate_limited", targetType: "post", meta: { retryAfter: postLimit.retryAfter, trust } });
    return rateLimitResponse(res, postLimit, "Слишком много постов за час. Подожди немного.");
  }
  if (hasRestriction(trust, "noPosts")) {
    return res.status(403).json({ error: "Публикация постов временно ограничена системой безопасности" });
  }
  const linkRisk = await assessLinksWithRules(text);
  if (linkRisk.blocked.length > 0) {
    await logSpamEvent({ userId: req.userId, eventType: "blocked_post_link", targetType: "post", meta: { domains: linkRisk.blocked, trust } });
    await createModerationFlag({ userId: req.userId, type: "blocked_link_post", severity: 4, reason: "Заблокированная ссылка в посте", meta: { domains: linkRisk.blocked } });
    return res.status(400).json({ error: "Эта ссылка заблокирована системой безопасности" });
  }
  if (linkRisk.links.length > 0 && hasRestriction(trust, "noLinks")) return res.status(403).json({ error: "Ссылки временно ограничены системой безопасности" });
  if (linkRisk.links.length > 0 && shouldRestrictLinks(trust)) {
    const linkLimit = await consumeRateLimitDistributed(`posts:links:${req.userId}`, { limit: trust.level === "new" ? 2 : 4, windowMs: 60 * 60 * 1000, cost: linkRisk.links.length });
    if (!linkLimit.allowed) {
      await logSpamEvent({ userId: req.userId, eventType: "post_link_rate_limited", targetType: "post", meta: { retryAfter: linkLimit.retryAfter, domains: linkRisk.domains, trust } });
      return rateLimitResponse(res, linkLimit, "Для новых/низкодоверенных аккаунтов ссылки ограничены. Подожди немного.");
    }
  }
  if (linkRisk.score >= 25) {
    await logSpamEvent({ userId: req.userId, eventType: "suspicious_post_link", targetType: "post", meta: { score: linkRisk.score, domains: linkRisk.domains, suspicious: linkRisk.suspicious, trust } });
    await createModerationFlag({ userId: req.userId, type: "suspicious_post_link", severity: linkRisk.score >= 50 ? 3 : 2, reason: "Подозрительная ссылка в посте", meta: { score: linkRisk.score, domains: linkRisk.domains } });
  }
  const duplicate = checkDuplicate(`posts:text:${req.userId}`, text, { limit: trust.level === "new" ? 2 : 3, windowMs: 10 * 60 * 1000 });
  if (!duplicate.allowed) {
    await logSpamEvent({ userId: req.userId, eventType: "duplicate_post", targetType: "post", fingerprint: duplicate.fingerprint, meta: { count: duplicate.count } });
    await createModerationFlag({ userId: req.userId, type: "duplicate_post", severity: 2, reason: "Повторяющиеся посты", meta: { count: duplicate.count } });
    return rateLimitResponse(res, duplicate, "Похожий пост уже отправлялся несколько раз. Подожди немного.");
  }
  if (!text && (!media || media.length === 0)) {
    return res.status(400).json({ error: "Post must have text or media" });
  }

  let author_channel_id = null;
  let author_user_id = req.userId;

  if (authorChannelId) {
    const adminRoles = ["admin", "owner", "co_owner", "moderator"];
    const { data: channel } = await supabase
      .from("channels")
      .select("id,owner_id")
      .eq("id", authorChannelId)
      .single();
    if (!channel) return res.status(404).json({ error: "Channel not found" });
    const { data: channelRole } = await supabase
      .from("channel_roles")
      .select("role")
      .eq("channel_id", authorChannelId)
      .eq("user_id", req.userId)
      .maybeSingle();
    const canPost = channel.owner_id === req.userId
      || adminRoles.includes(req.userRole || "")
      || ["owner", "co_owner", "admin", "editor"].includes(channelRole?.role || "");
    if (!canPost) return res.status(403).json({ error: "No access to post as channel" });
    author_channel_id = channel.id;
    author_user_id = null;
  }

  const cleanVisibility = ["public", "followers", "circle"].includes(String(visibility)) && !author_channel_id ? String(visibility) : "public";
  let cleanCircleId = cleanVisibility === "circle" ? circleId : null;
  if (cleanVisibility === "circle") {
    const { data: circle } = await safe(
      supabase.from("user_circles").select("id").eq("id", cleanCircleId).eq("owner_id", req.userId).maybeSingle(),
      { data: null, error: null },
    );
    if (!circle) return res.status(400).json({ error: "Выбери существующий приватный круг" });
  }

  const cleanStatus = author_channel_id && ["published", "draft", "scheduled"].includes(String(status)) ? String(status) : "published";
  const cleanScheduledAt = cleanStatus === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null;

  const payload = {
    author_user_id,
    author_channel_id,
    text: text || null,
    tags,
    visibility: cleanVisibility,
    circle_id: cleanCircleId,
    status: cleanStatus,
    scheduled_at: cleanScheduledAt,
  };

  let result = await supabase
    .from("posts")
    .insert(payload)
    .select("*")
    .single();
  if (result.error && /visibility|circle_id|status|scheduled_at|schema cache/i.test(result.error.message || "")) {
    const { visibility: _visibility, circle_id: _circleId, status: _status, scheduled_at: _scheduledAt, ...legacyPayload } = payload;
    result = await supabase
      .from("posts")
      .insert(legacyPayload)
      .select("*")
      .single();
  }
  const { data: post, error: postError } = result;
  if (postError) return res.status(500).json({ error: postError.message });

  let insertedMedia = [];
  if (media.length > 0) {
    const mediaRows = media.map((m, i) => ({
      post_id: post.id,
      type: m.type || "image",
      url: m.url,
      thumbnail_url: m.thumbnailUrl || null,
      position: i,
    }));
    const mediaResult = await safe(
      supabase.from("post_media").insert(mediaRows).select("*"),
      { data: [], error: null },
    );
    insertedMedia = mediaResult.data || [];
  }

  const { data: fullPost } = await supabase
    .from("posts")
    .select(`*, author:users!posts_author_user_id_fkey(${PUBLIC_USER_SELECT})`)
    .eq("id", post.id)
    .single();

  res.status(201).json({ ...(fullPost || post), media: insertedMedia });
});

// DELETE /api/posts/:id — delete a post (owner or admin)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const adminRoles = ["admin", "owner", "co_owner", "moderator"];

  const { data: post } = await supabase
    .from("posts")
    .select("author_user_id,author_channel_id")
    .eq("id", id)
    .single();
  if (!post) return res.status(404).json({ error: "Пост не найден" });

  let isOwner = post.author_user_id === req.userId;
  const isAdmin = adminRoles.includes(req.userRole || "");
  if (post.author_channel_id && !isOwner) {
    const { data: channel } = await supabase.from("channels").select("owner_id").eq("id", post.author_channel_id).single();
    const { data: channelRole } = await supabase
      .from("channel_roles")
      .select("role")
      .eq("channel_id", post.author_channel_id)
      .eq("user_id", req.userId)
      .maybeSingle();
    isOwner = channel?.owner_id === req.userId || ["owner", "co_owner", "admin", "editor", "moderator"].includes(channelRole?.role || "");
  }
  if (!isOwner && !isAdmin) return res.status(403).json({ error: "Нет прав на удаление" });

  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});


// POST /api/posts/:id/profile-pin — pin/unpin a user post on profile
router.post("/:id/profile-pin", async (req, res) => {
  const { id } = req.params;
  const { data: post } = await safe(supabase.from("posts").select("id,author_user_id,pinned_on_profile").eq("id", id).maybeSingle(), { data: null });
  if (!post) return res.status(404).json({ error: "Пост не найден" });
  const { data: me } = await safe(supabase.from("users").select("role").eq("id", req.userId).maybeSingle(), { data: null });
  const isAdmin = ["admin", "owner", "co_owner", "moderator"].includes(me?.role || "");
  if (post.author_user_id !== req.userId && !isAdmin) return res.status(403).json({ error: "Нет прав на закрепление" });
  const pinned = !Boolean(post.pinned_on_profile);
  const result = await safe(
    supabase.from("posts").update({ pinned_on_profile: pinned, pinned_at: pinned ? new Date().toISOString() : null }).eq("id", id).select("pinned_on_profile,pinned_at").single(),
    { data: null, error: null },
  );
  if (result.error && /pinned_|schema cache/i.test(result.error.message || "")) return res.status(503).json({ error: "Run profile pin migration", detail: result.error.message });
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json({ ok: true, pinned: result.data.pinned_on_profile, pinnedAt: result.data.pinned_at });
});

// POST /api/posts/:id/like
router.post("/:id/like", async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("post_id", id)
    .eq("user_id", req.userId)
    .maybeSingle();

  if (existing) {
    await supabase.from("post_likes").delete().eq("post_id", id).eq("user_id", req.userId);
  } else {
    await supabase.from("post_likes").insert({ post_id: id, user_id: req.userId });
    const { data: postOwner } = await supabase.from("posts").select("author_user_id").eq("id", id).single();
    if (postOwner?.author_user_id && postOwner.author_user_id !== req.userId) {
      await pushNotification(req, postOwner.author_user_id, {
        type: "like",
        title: "Новый лайк",
        body: `@${req.username || "user"} оценил ваш пост`,
        read: false,
      });
    }
  }

  const { data: post } = await supabase.from("posts").select("likes_count").eq("id", id).single();
  res.json({ liked: !existing, likesCount: post?.likes_count ?? 0 });
});

// POST /api/posts/:id/save
router.post("/:id/save", async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase
    .from("post_saves")
    .select("post_id")
    .eq("post_id", id)
    .eq("user_id", req.userId)
    .maybeSingle();
  if (existing) {
    await supabase.from("post_saves").delete().eq("post_id", id).eq("user_id", req.userId);
    res.json({ saved: false });
  } else {
    await supabase.from("post_saves").insert({ post_id: id, user_id: req.userId });
    res.json({ saved: true });
  }
});

// POST /api/posts/:id/view
router.post("/:id/view", async (req, res) => {
  const { data: existing } = await supabase
    .from("post_views")
    .select("post_id")
    .eq("post_id", req.params.id)
    .eq("user_id", req.userId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase
      .from("post_views")
      .insert({ post_id: req.params.id, user_id: req.userId });
    if (!error) {
      const { data: post } = await supabase.from("posts").select("views_count").eq("id", req.params.id).single();
      await supabase
        .from("posts")
        .update({ views_count: (post?.views_count ?? 0) + 1 })
        .eq("id", req.params.id);
    }
  }
  res.json({ ok: true });
});

// GET /api/posts/:id/comments
router.get("/:id/comments", async (req, res) => {
  const { data, error } = await supabase
    .from("comments")
    .select(`*, author:users!comments_author_id_fkey(${PUBLIC_USER_SELECT})`)
    .eq("post_id", req.params.id)
    .order("created_at", { ascending: true })
    .limit(80);
  if (error) return res.status(500).json({ error: error.message });
  const ids = (data || []).map((row) => row.id).filter(Boolean);
  const { data: likes } = ids.length ? await safe(
    supabase.from("comment_likes").select("comment_id").eq("user_id", req.userId).in("comment_id", ids),
    { data: [] },
  ) : { data: [] };
  const likedSet = new Set((likes || []).map((row) => row.comment_id));
  const sorted = (data || []).slice().sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  res.json(sorted.map((row) => ({ ...row, liked: likedSet.has(row.id), pinned: Boolean(row.pinned), pinnedAt: row.pinned_at || null })));
});

// POST /api/posts/:id/comments
router.post("/:id/comments", async (req, res) => {
  const { text, parentId } = req.body;
  const mute = await hasActivePunishment(req.userId, "mute_posts");
  if (mute) return res.status(403).json({ error: punishmentMessage(mute), code: "PUNISHED", type: "mute_posts" });
  const trust = await getTrustProfile(req.userId);
  const commentLimit = await consumeRateLimitDistributed(`comments:create:${req.userId}`, { limit: trustLimit(35, trust, { new: 0.35, low: 0.6, trusted: 1.5, staff: 4 }), windowMs: 10 * 60 * 1000 });
  if (!commentLimit.allowed) {
    await logSpamEvent({ userId: req.userId, eventType: "comment_rate_limited", targetType: "post", targetId: req.params.id, meta: { retryAfter: commentLimit.retryAfter, trust } });
    return rateLimitResponse(res, commentLimit, "Слишком много комментариев. Подожди немного.");
  }
  const linkRisk = await assessLinksWithRules(text);
  if (linkRisk.blocked.length > 0) {
    await logSpamEvent({ userId: req.userId, eventType: "blocked_comment_link", targetType: "post", targetId: req.params.id, meta: { domains: linkRisk.blocked, trust } });
    await createModerationFlag({ userId: req.userId, type: "blocked_link_comment", severity: 4, reason: "Заблокированная ссылка в комментарии", meta: { postId: req.params.id, domains: linkRisk.blocked } });
    return res.status(400).json({ error: "Эта ссылка заблокирована системой безопасности" });
  }
  if (linkRisk.links.length > 0 && hasRestriction(trust, "noLinks")) return res.status(403).json({ error: "Ссылки временно ограничены системой безопасности" });
  if (linkRisk.links.length > 0 && shouldRestrictLinks(trust)) {
    const linkLimit = await consumeRateLimitDistributed(`comments:links:${req.userId}`, { limit: trust.level === "new" ? 2 : 5, windowMs: 60 * 60 * 1000, cost: linkRisk.links.length });
    if (!linkLimit.allowed) {
      await logSpamEvent({ userId: req.userId, eventType: "comment_link_rate_limited", targetType: "post", targetId: req.params.id, meta: { retryAfter: linkLimit.retryAfter, domains: linkRisk.domains, trust } });
      return rateLimitResponse(res, linkLimit, "Для новых/низкодоверенных аккаунтов ссылки в комментариях ограничены.");
    }
  }
  const duplicate = checkDuplicate(`comments:text:${req.userId}`, text, { limit: trust.level === "new" ? 2 : 4, windowMs: 10 * 60 * 1000 });
  if (!duplicate.allowed) {
    await logSpamEvent({ userId: req.userId, eventType: "duplicate_comment", targetType: "post", targetId: req.params.id, fingerprint: duplicate.fingerprint, meta: { count: duplicate.count } });
    await createModerationFlag({ userId: req.userId, type: "duplicate_comment", severity: 2, reason: "Повторяющиеся комментарии", meta: { postId: req.params.id, count: duplicate.count } });
    return rateLimitResponse(res, duplicate, "Похожий комментарий уже отправлялся несколько раз. Подожди немного.");
  }
  if (!text || !String(text).trim()) return res.status(400).json({ error: "Комментарий пустой" });

  const channelContext = await getChannelPostContext(req.params.id);
  if (!channelContext.post) return res.status(404).json({ error: "Пост не найден" });
  if (channelContext.channel) {
    const staff = await canModerateChannelPost(req, channelContext.channel);
    if (!staff && await getActiveChannelBan(channelContext.channel.id, req.userId)) {
      return res.status(403).json({ error: "Вы заблокированы в этом канале" });
    }
    if (!staff && channelContext.channel.comments_enabled === false) {
      return res.status(403).json({ error: "Комментарии в канале отключены" });
    }
    const slowModeSeconds = Math.max(0, Number(channelContext.channel.comment_slow_mode_seconds || 0));
    if (!staff && slowModeSeconds > 0) {
      const slow = await consumeRateLimitDistributed(`channel:comment:${channelContext.channel.id}:${req.userId}`, { limit: 1, windowMs: slowModeSeconds * 1000 });
      if (!slow.allowed) return rateLimitResponse(res, slow, `В канале включён медленный режим: одно сообщение раз в ${slowModeSeconds} сек.`);
    }
  }

  const payload = {
    post_id: req.params.id,
    author_id: req.userId,
    text: String(text).trim(),
    ...(parentId ? { parent_id: parentId } : {}),
  };

  let result = await supabase
    .from("comments")
    .insert(payload)
    .select(`*, author:users!comments_author_id_fkey(${PUBLIC_USER_SELECT})`)
    .single();

  // Backward compatibility for databases that have not yet run the reply migration.
  if (result.error && parentId && /parent_id|schema cache/i.test(result.error.message || "")) {
    result = await supabase
      .from("comments")
      .insert({ post_id: req.params.id, author_id: req.userId, text: `↳ ${String(text).trim()}` })
      .select(`*, author:users!comments_author_id_fkey(${PUBLIC_USER_SELECT})`)
      .single();
  }

  if (result.error) return res.status(500).json({ error: result.error.message });
  const post = channelContext.post;
  await supabase.from("posts").update({ comments_count: (post?.comments_count ?? 0) + 1 }).eq("id", req.params.id);
  if (post?.author_user_id && post.author_user_id !== req.userId) {
    await pushNotification(req, post.author_user_id, {
      type: "comment",
      title: "Новый комментарий",
      body: `@${req.username || "user"} прокомментировал ваш пост`,
      read: false,
    });
  }
  res.json(result.data);
});




// POST /api/posts/comments/:id/pin — pin/unpin a comment
router.post("/comments/:id/pin", async (req, res) => {
  const { id } = req.params;
  const { data: comment } = await safe(supabase.from("comments").select("id,post_id,author_id,pinned").eq("id", id).maybeSingle(), { data: null });
  if (!comment) return res.status(404).json({ error: "Комментарий не найден" });
  const { data: me } = await safe(supabase.from("users").select("role").eq("id", req.userId).maybeSingle(), { data: null });
  const isAdmin = SITE_ADMIN_ROLES.includes(me?.role || "");
  const context = await getChannelPostContext(comment.post_id);
  const channelModerator = await canModerateChannelPost(req, context.channel);
  if (comment.author_id !== req.userId && !isAdmin && !channelModerator) return res.status(403).json({ error: "Нет прав на закрепление" });
  const pinned = !Boolean(comment.pinned);
  const result = await safe(
    supabase.from("comments").update({ pinned, pinned_at: pinned ? new Date().toISOString() : null }).eq("id", id).select("pinned,pinned_at").single(),
    { data: null, error: null },
  );
  if (result.error && /pinned|schema cache/i.test(result.error.message || "")) return res.status(503).json({ error: "Run comment pin migration", detail: result.error.message });
  if (result.error) return res.status(500).json({ error: result.error.message });
  if (context.channel && channelModerator && comment.author_id !== req.userId) {
    await logChannelAction({ channelId: context.channel.id, actorId: req.userId, action: pinned ? "pin_comment" : "unpin_comment", targetCommentId: id });
  }
  res.json({ ok: true, pinned: result.data.pinned, pinnedAt: result.data.pinned_at });
});

// POST /api/posts/comments/:id/like — like/unlike a comment
router.post("/comments/:id/like", async (req, res) => {
  const { id } = req.params;
  const { data: comment } = await safe(supabase.from("comments").select("id,author_id,likes_count").eq("id", id).maybeSingle(), { data: null });
  if (!comment) return res.status(404).json({ error: "Комментарий не найден" });
  const { data: existing } = await safe(
    supabase.from("comment_likes").select("comment_id").eq("comment_id", id).eq("user_id", req.userId).maybeSingle(),
    { data: null },
  );
  if (existing) {
    await safe(supabase.from("comment_likes").delete().eq("comment_id", id).eq("user_id", req.userId));
  } else {
    const inserted = await safe(supabase.from("comment_likes").insert({ comment_id: id, user_id: req.userId }), { error: null });
    if (inserted.error) return res.status(503).json({ error: "Run comment likes migration", detail: inserted.error.message });
    if (comment.author_id && comment.author_id !== req.userId) await pushNotification(req, comment.author_id, { type: "like", title: "Лайк комментария", body: `@${req.username || "user"} лайкнул ваш комментарий`, read: false });
  }
  const likesCount = Math.max(0, (comment.likes_count || 0) + (existing ? -1 : 1));
  await safe(supabase.from("comments").update({ likes_count: likesCount }).eq("id", id));
  res.json({ liked: !existing, likesCount });
});

// DELETE /api/posts/comments/:id — delete a comment (owner or admin)
router.delete("/comments/:id", async (req, res) => {
  const { id } = req.params;
  const adminRoles = ["admin", "owner", "co_owner", "moderator"];

  // Check if user is the comment author or admin
  const { data: comment } = await supabase
    .from("comments")
    .select("author_id,post_id")
    .eq("id", id)
    .single();

  if (!comment) return res.status(404).json({ error: "Комментарий не найден" });

  // Get user role
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", req.userId)
    .single();

  const isOwner = comment.author_id === req.userId;
  const isAdmin = user && adminRoles.includes(user.role);
  const context = await getChannelPostContext(comment.post_id);
  const channelModerator = await canModerateChannelPost(req, context.channel);

  if (!isOwner && !isAdmin && !channelModerator) {
    return res.status(403).json({ error: "Нет прав на удаление" });
  }

  const fullComment = comment;
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  if (fullComment?.post_id) {
    const { data: post } = await supabase.from("posts").select("comments_count").eq("id", fullComment.post_id).single();
    await supabase.from("posts").update({ comments_count: Math.max(0, (post?.comments_count ?? 0) - 1) }).eq("id", fullComment.post_id);
  }
  if (context.channel && channelModerator && !isOwner) {
    await logChannelAction({ channelId: context.channel.id, actorId: req.userId, action: "delete_comment", targetCommentId: id });
  }

  res.json({ ok: true });
});

module.exports = router;
