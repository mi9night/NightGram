// User routes — profile + update + posts
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

// CamelCase → snake_case converter
function toSnake(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

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

// GET /api/users/:username
router.get("/:username", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", req.params.username)
    .single();
  if (error || !data) {
    // Try by custom_id
    const { data: byId } = await supabase
      .from("users")
      .select("*")
      .eq("custom_id", req.params.username)
      .single();
    if (!byId) return res.status(404).json({ error: "User not found" });
    const { password_hash, ...safe } = byId;
    return res.json(safe);
  }
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
    .select("*, author:users!posts_author_user_id_fkey(*)")
    .eq("author_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json(posts || []);
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
  ];

  const patch = {};
  for (const key of Object.keys(req.body)) {
    if (allowed.includes(key)) {
      const snakeKey = toSnake(key);
      patch[snakeKey] = req.body[key];
    }
  }

  // notification_settings is an object — stringify it for JSONB
  if (patch.notification_settings && typeof patch.notification_settings === "object") {
    patch.notification_settings = JSON.stringify(patch.notification_settings);
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

module.exports = { usersRouter: router };
