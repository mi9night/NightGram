// Notifications routes — any authenticated user can read their notifications
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

// GET /api/notifications — get current user's notifications
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      // Table might not exist yet
      return res.json([]);
    }
    res.json(data || []);
  } catch (e) {
    res.json([]);
  }
});

// POST /api/notifications/read-all — mark all as read
router.post("/read-all", async (req, res) => {
  try {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", req.userId)
      .eq("read", false);
  } catch (e) { /* ignore */ }
  res.json({ ok: true });
});

module.exports = router;
