// User routes — profile + update + posts
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

// GET /api/users/:username
router.get("/:username", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", req.params.username)
    .single();
  if (error || !data) return res.status(404).json({ error: "User not found" });
  const { password_hash, ...safe } = data;
  res.json(safe);
});

// GET /api/users/:username/posts
router.get("/:username/posts", async (req, res) => {
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("username", req.params.username)
    .single();
  if (!user) return res.status(404).json({ error: "User not found" });

  const { data: posts, error } = await supabase
    .from("posts")
    .select("*")
    .eq("author_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json(posts || []);
});

// PATCH /api/users/me
router.patch("/me", async (req, res) => {
  const allowed = ["display_name", "bio", "name_color", "avatar_url", "glow_effect", "avatar_frame"];
  const patch = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      patch[k] = req.body[k];
    }
  }
  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", req.userId)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  const { password_hash, ...safe } = data;
  res.json(safe);
});

// NOTE: /me must be matched before /:username — register order in server.js accordingly,
// or mount this router under a distinct prefix. (Here we rely on route specificity.)
module.exports = { usersRouter: router };
