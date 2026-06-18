// Feed routes — cursor-paginated infinite feed
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

// GET /api/feed?cursor=&limit=
router.get("/", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 30);
  const cursor = req.query.cursor || null;

  let query = supabase
    .from("posts")
    .select(
      "id,text,tags,likes_count,comments_count,views_count,shares_count,created_at,author_user_id,author_channel_id",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const hasMore = data.length > limit;
  const posts = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? posts[posts.length - 1].created_at : null;

  // Hydrate authors + media + engagement flags
  const userIds = [...new Set(posts.map((p) => p.author_user_id).filter(Boolean))];
  const [users, media, likes, saves] = await Promise.all([
    userIds.length
      ? supabase.from("users").select("*").in("id", userIds)
      : Promise.resolve({ data: [] }),
    posts.length
      ? supabase.from("post_media").select("*").in("post_id", posts.map((p) => p.id))
      : Promise.resolve({ data: [] }),
    posts.length
      ? supabase.from("post_likes").select("post_id").eq("user_id", req.userId)
      : Promise.resolve({ data: [] }),
    posts.length
      ? supabase.from("post_saves").select("post_id").eq("user_id", req.userId)
      : Promise.resolve({ data: [] }),
  ]);

  const userMap = Object.fromEntries((users.data || []).map((u) => [u.id, u]));
  const likedSet = new Set((likes.data || []).map((l) => l.post_id));
  const savedSet = new Set((saves.data || []).map((s) => s.post_id));
  const mediaByPost = (media.data || []).reduce((acc, m) => {
    (acc[m.post_id] = acc[m.post_id] || []).push(m);
    return acc;
  }, {});

  const out = posts.map((p) => ({
    id: p.id,
    author: p.author_user_id
      ? { kind: "user", user: userMap[p.author_user_id] }
      : { kind: "channel", channel: { id: p.author_channel_id } },
    text: p.text,
    media: mediaByPost[p.id] || [],
    tags: p.tags || [],
    likesCount: p.likes_count,
    commentsCount: p.comments_count,
    viewsCount: p.views_count,
    sharesCount: p.shares_count,
    liked: likedSet.has(p.id),
    saved: savedSet.has(p.id),
    createdAt: p.created_at,
  }));

  res.json({ posts: out, nextCursor });
});

module.exports = { feedRouter: router };
