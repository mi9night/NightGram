// Stories routes — active 24h stories
const router = require("express").Router();
const { supabase } = require("../lib/supabase");
const { consumeRateLimitDistributed, rateLimitResponse, logSpamEvent } = require("../lib/safety");

async function safe(promise, fallback = { data: [], error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

function serializeStory(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    text: row.text || "",
    visibility: row.visibility || "public",
    circleId: row.circle_id || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function canViewStory(story, viewerId) {
  if (!story) return false;
  if (story.author_id === viewerId) return true;
  const visibility = story.visibility || "public";
  if (visibility === "public") return true;
  if (visibility === "followers") {
    const { data } = await safe(
      supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", story.author_id).maybeSingle(),
      { data: null, error: null },
    );
    return Boolean(data);
  }
  if (visibility === "circle" && story.circle_id) {
    const { data } = await safe(
      supabase.from("user_circle_members").select("circle_id").eq("circle_id", story.circle_id).eq("user_id", viewerId).maybeSingle(),
      { data: null, error: null },
    );
    return Boolean(data);
  }
  return false;
}

router.get("/", async (req, res) => {
  const now = new Date().toISOString();
  const { data: stories, error } = await safe(
    supabase
      .from("stories")
      .select("*, author:users(id,username,display_name,avatar_url,name_color,is_premium,role)")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(120),
  );
  if (error) return res.json([]);

  const groups = new Map();
  for (const story of stories || []) {
    if (!(await canViewStory(story, req.userId))) continue;
    const authorId = story.author_id;
    if (!groups.has(authorId)) {
      groups.set(authorId, {
        author: story.author,
        stories: [],
        viewed: false,
      });
    }
    groups.get(authorId).stories.push(serializeStory(story));
  }

  res.json(Array.from(groups.values()));
});

router.post("/", async (req, res) => {
  const storyLimit = await consumeRateLimitDistributed(`stories:create:${req.userId}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!storyLimit.allowed) {
    await logSpamEvent({ userId: req.userId, eventType: "story_rate_limited", targetType: "story", meta: { retryAfter: storyLimit.retryAfter } });
    return rateLimitResponse(res, storyLimit, "Слишком много историй за час. Подожди немного.");
  }
  const { mediaUrl, mediaType = "image", text = "", visibility = "public", circleId = null } = req.body;
  if (!mediaUrl) return res.status(400).json({ error: "mediaUrl required" });
  const cleanVisibility = ["public", "followers", "circle"].includes(String(visibility)) ? String(visibility) : "public";
  let cleanCircleId = cleanVisibility === "circle" ? circleId : null;
  if (cleanVisibility === "circle") {
    const { data: circle } = await safe(
      supabase.from("user_circles").select("id").eq("id", cleanCircleId).eq("owner_id", req.userId).maybeSingle(),
      { data: null, error: null },
    );
    if (!circle) return res.status(400).json({ error: "Выбери существующий приватный круг" });
  }
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const payload = {
    author_id: req.userId,
    media_url: mediaUrl,
    media_type: mediaType === "video" ? "video" : "image",
    text: String(text || "").slice(0, 160),
    visibility: cleanVisibility,
    circle_id: cleanCircleId,
    expires_at: expiresAt,
  };
  let result = await safe(
    supabase
      .from("stories")
      .insert(payload)
      .select("*")
      .single(),
    { data: null, error: null },
  );
  if (result.error && /visibility|circle_id|schema cache/i.test(result.error.message || "")) {
    const { visibility: _visibility, circle_id: _circleId, ...legacyPayload } = payload;
    result = await safe(supabase.from("stories").insert(legacyPayload).select("*").single(), { data: null, error: null });
  }
  if (result.error) return res.status(503).json({ error: "Run stories migration", detail: result.error.message });
  res.status(201).json(serializeStory(result.data));
});

router.post("/:id/view", async (req, res) => {
  const { data: story } = await safe(supabase.from("stories").select("*").eq("id", req.params.id).maybeSingle(), { data: null, error: null });
  if (!story || !(await canViewStory(story, req.userId))) return res.status(403).json({ error: "Story unavailable" });
  await safe(
    supabase.from("story_views").upsert({ story_id: req.params.id, user_id: req.userId }, { onConflict: "story_id,user_id" }),
  );
  res.json({ ok: true });
});

router.post("/:id/like", async (req, res) => {
  const storyId = req.params.id;
  const { data: story } = await safe(supabase.from("stories").select("*").eq("id", storyId).maybeSingle(), { data: null, error: null });
  if (!story || !(await canViewStory(story, req.userId))) return res.status(403).json({ error: "Story unavailable" });
  const { data: existing } = await safe(
    supabase.from("story_likes").select("story_id").eq("story_id", storyId).eq("user_id", req.userId).maybeSingle(),
    { data: null, error: null },
  );

  if (existing) {
    await safe(supabase.from("story_likes").delete().eq("story_id", storyId).eq("user_id", req.userId));
    return res.json({ ok: true, liked: false });
  }

  const { error } = await safe(
    supabase.from("story_likes").insert({ story_id: storyId, user_id: req.userId }),
    { data: null, error: null },
  );
  if (error) return res.status(503).json({ error: "Run story_likes migration", detail: error.message });
  res.json({ ok: true, liked: true });
});

router.get("/:id/likes", async (req, res) => {
  const { data: story } = await safe(supabase.from("stories").select("*").eq("id", req.params.id).maybeSingle(), { data: null, error: null });
  if (!story || !(await canViewStory(story, req.userId))) return res.status(403).json({ error: "Story unavailable" });
  const { data, error } = await safe(
    supabase
      .from("story_likes")
      .select("created_at, user:users(id,username,display_name,avatar_url,name_color,role,is_premium)")
      .eq("story_id", req.params.id)
      .order("created_at", { ascending: false }),
  );
  if (error) return res.json([]);
  res.json((data || []).map((row) => ({ ...row.user, likedAt: row.created_at })).filter(Boolean));
});

module.exports = router;
