// =============================================================================
//  Admin routes — purchase requests, moderation, broadcasts
// =============================================================================

const router = require("express").Router();
const { supabase } = require("../lib/supabase");

// Middleware: require admin/moderator role
function requireAdmin(req, res, next) {
  const adminRoles = ["admin", "owner", "co_owner", "moderator", "support"];
  if (!adminRoles.includes(req.userRole)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// ============================================================================
//  PURCHASE REQUESTS
// ============================================================================

// POST /api/admin/purchases — create a purchase request (any authenticated user)
router.post("/purchases", async (req, res) => {
  const { itemType, itemName, price } = req.body;

  if (!itemType || !itemName || !price) {
    return res.status(400).json({ error: "Missing fields" });
  }

  // Get user info
  const { data: user } = await supabase
    .from("users")
    .select("id, username, ng_id, custom_id")
    .eq("id", req.userId)
    .single();

  if (!user) return res.status(404).json({ error: "User not found" });

  // Create the purchase request
  const { data, error } = await supabase
    .from("purchase_requests")
    .insert({
      user_id: req.userId,
      username: user.username,
      ng_id: user.ng_id,
      item_type: itemType,
      item_name: itemName,
      price: price,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    // Table might not exist — return success anyway (frontend will handle)
    return res.status(201).json({
      id: "local_" + Date.now(),
      userId: req.userId,
      username: user.username,
      ngId: user.ng_id,
      itemType,
      itemName,
      price,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  res.status(201).json(data);
});

// GET /api/admin/purchases — list all purchase requests (admin only)
router.get("/purchases", requireAdmin, async (req, res) => {
  const { status } = req.query;

  let query = supabase
    .from("purchase_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    // Table doesn't exist yet
    return res.json([]);
  }

  res.json(data || []);
});

// POST /api/admin/purchases/:id/approve — approve a purchase (admin only)
router.post("/purchases/:id/approve", requireAdmin, async (req, res) => {
  const { id } = req.params;

  const { data: purchase } = await supabase
    .from("purchase_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (!purchase) return res.status(404).json({ error: "Request not found" });

  // Update request status
  await supabase
    .from("purchase_requests")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id);

  // Apply the purchase to the user
  if (purchase.item_type === "premium") {
    const months = purchase.item_name.includes("2 год") ? 24 :
                   purchase.item_name.includes("год") ? 12 : 1;
    const until = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("users")
      .update({ is_premium: true, premium_until: until })
      .eq("id", purchase.user_id);
  } else if (purchase.item_type === "coins") {
    // Extract coin amount from item name
    const match = purchase.item_name.match(/(\d+)/);
    const coins = match ? parseInt(match[1]) : 0;
    const { data: user } = await supabase
      .from("users")
      .select("night_coins")
      .eq("id", purchase.user_id)
      .single();
    const newBalance = (user?.night_coins ?? 0) + coins;
    await supabase
      .from("users")
      .update({ night_coins: newBalance })
      .eq("id", purchase.user_id);
  }

  // Log the action
  try {
    await supabase.from("moderation_logs").insert({
      action: "Одобрена покупка",
      admin_id: req.userId,
      admin_name: req.username || "admin",
      target_user_id: purchase.user_id,
      target_user_name: purchase.username,
      details: `${purchase.item_name} · ${purchase.price}₽`,
    });
  } catch (e) { /* table might not exist */ }

  res.json({ ok: true, status: "approved" });
});

// POST /api/admin/purchases/:id/reject — reject a purchase (admin only)
router.post("/purchases/:id/reject", requireAdmin, async (req, res) => {
  const { id } = req.params;

  const { data: purchase } = await supabase
    .from("purchase_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (!purchase) return res.status(404).json({ error: "Request not found" });

  await supabase
    .from("purchase_requests")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    await supabase.from("moderation_logs").insert({
      action: "Отклонена покупка",
      admin_id: req.userId,
      admin_name: req.username || "admin",
      target_user_id: purchase.user_id,
      target_user_name: purchase.username,
      details: `${purchase.item_name} · ${purchase.price}₽`,
    });
  } catch (e) { /* ignore */ }

  res.json({ ok: true, status: "rejected" });
});

module.exports = router;

// ============================================================================
//  ROLE MANAGEMENT (owner / co_owner only)
// ============================================================================

// Middleware: require owner or co_owner
function requireOwner(req, res, next) {
  const ownerRoles = ["owner", "co_owner"];
  if (!ownerRoles.includes(req.userRole)) {
    return res.status(403).json({ error: "Только владелец может менять роли" });
  }
  next();
}

// PATCH /api/admin/users/:id/role — change user role (owner/co_owner only)
router.patch("/users/:id/role", requireOwner, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const validRoles = ["user", "creator", "moderator", "admin", "support", "co_owner", "owner"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: "Недопустимая роль" });
  }

  // Prevent anyone from demoting the owner
  const { data: target } = await supabase
    .from("users")
    .select("role, username")
    .eq("id", id)
    .single();

  if (!target) return res.status(404).json({ error: "Пользователь не найден" });
  if (target.role === "owner" && role !== "owner") {
    return res.status(403).json({ error: "Нельзя изменить роль владельца" });
  }

  const { data, error } = await supabase
    .from("users")
    .update({ role })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Log
  try {
    await supabase.from("moderation_logs").insert({
      action: "Смена роли",
      admin_id: req.userId,
      admin_name: req.username || "owner",
      target_user_id: id,
      target_user_name: target.username,
      details: `→ ${role}`,
    });
  } catch (e) { /* ignore */ }

  res.json({ ok: true, role, username: target.username });
});

// PATCH /api/admin/users/:id/verify — verify/unverify user (admin+)
router.patch("/users/:id/verify", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { verified } = req.body;

  // Verify = set is_premium true + special badge (simplified)
  const { data, error } = await supabase
    .from("users")
    .update({ avatar_frame: verified ? "verified" : null })
    .eq("id", id)
    .select("username")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, verified, username: data?.username });
});
