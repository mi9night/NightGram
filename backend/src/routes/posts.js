// Posts routes — like, save, comment, view
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

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
  // Emit real-time (handled via socket in a fuller impl)
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

module.exports = router;
