// Posts routes — create, like, save, comment, view
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

// POST /api/posts — create a new post
router.post("/", async (req, res) => {
  const { text, media = [], tags = [] } = req.body;
  if (!text && (!media || media.length === 0)) {
    return res.status(400).json({ error: "Post must have text or media" });
  }

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      author_user_id: req.userId,
      text: text || null,
      tags,
    })
    .select("*")
    .single();
  if (postError) return res.status(500).json({ error: postError.message });

  if (media.length > 0) {
    const mediaRows = media.map((m, i) => ({
      post_id: post.id,
      type: m.type || "image",
      url: m.url,
      thumbnail_url: m.thumbnailUrl || null,
      position: i,
    }));
    await supabase.from("post_media").insert(mediaRows);
  }

  const { data: fullPost } = await supabase
    .from("posts")
    .select("*, author:users!posts_author_user_id_fkey(*)")
    .eq("id", post.id)
    .single();

  res.status(201).json(fullPost || post);
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
  await supabase
    .from("post_views")
    .upsert({ post_id: req.params.id, user_id: req.userId }, { onConflict: "post_id,user_id" });
  res.json({ ok: true });
});

// GET /api/posts/:id/comments
router.get("/:id/comments", async (req, res) => {
  const { data, error } = await supabase
    .from("comments")
    .select("*, author:users!comments_author_id_fkey(*)")
    .eq("post_id", req.params.id)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/posts/:id/comments
router.post("/:id/comments", async (req, res) => {
  const { text } = req.body;
  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: req.params.id, author_id: req.userId, text })
    .select("*, author:users!comments_author_id_fkey(*)")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});


// DELETE /api/posts/comments/:id — delete a comment (owner or admin)
router.delete("/comments/:id", async (req, res) => {
  const { id } = req.params;
  const adminRoles = ["admin", "owner", "co_owner", "moderator"];

  // Check if user is the comment author or admin
  const { data: comment } = await supabase
    .from("comments")
    .select("author_id")
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

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: "Нет прав на удаление" });
  }

  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

module.exports = router;
