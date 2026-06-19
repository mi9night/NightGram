// =============================================================================
//  Admin routes — full moderation: tickets, users, punishments, reports,
//  purchases, broadcasts, logs, roles
// =============================================================================

const router = require("express").Router();
const { supabase } = require("../lib/supabase");

const ADMIN_ROLES = ["admin", "owner", "co_owner", "moderator", "support"];
const OWNER_ROLES = ["owner", "co_owner"];

function requireAdmin(req, res, next) {
  if (!ADMIN_ROLES.includes(req.userRole)) return res.status(403).json({ error: "Требуются права модератора" });
  next();
}
function requireOwner(req, res, next) {
  if (!OWNER_ROLES.includes(req.userRole)) return res.status(403).json({ error: "Только владелец может это делать" });
  next();
}

// Helper: safe query (returns [] if table missing)
function safeQuery(promise) {
  return promise.catch((e) => ({ data: [], error: null }));
}
async function logAction(action, adminId, targetId, targetName, details) {
  try {
    const { data: admin } = await supabase.from("users").select("username").eq("id", adminId).single();
    await supabase.from("moderation_logs").insert({
      action, admin_id: adminId, admin_name: admin?.username || "admin",
      target_user_id: targetId, target_user_name: targetName, details,
    });
  } catch (e) { /* ignore */ }
}

// ============================================================================
//  TICKETS
// ============================================================================

router.get("/tickets", requireAdmin, async (req, res) => {
  const { status } = req.query;
  let q = supabase.from("tickets").select("*").order("created_at", { ascending: false }).limit(100);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await safeQuery(q);
  if (error) return res.json([]);
  res.json(data || []);
});

router.post("/tickets", async (req, res) => {
  const { subject, body, category } = req.body;
  if (!subject) return res.status(400).json({ error: "Укажите тему" });
  const { data: user } = await supabase.from("users").select("username").eq("id", req.userId).single();
  const { data, error } = await safeQuery(supabase.from("tickets").insert({
    subject, body: body || "", category: category || "Вопрос",
    status: "open", author_id: req.userId, author_name: user?.username || "Аноним",
    priority: "low",
  }).select("*").single());
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.patch("/tickets/:id", requireAdmin, async (req, res) => {
  const { status, assignedTo, priority } = req.body;
  const update = {};
  if (status) update.status = status;
  if (assignedTo !== undefined) update.assigned_to = assignedTo;
  if (priority) update.priority = priority;
  const { data, error } = await safeQuery(supabase.from("tickets").update(update).eq("id", req.params.id).select("*").single());
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ============================================================================
//  USERS
// ============================================================================

router.get("/users", requireAdmin, async (req, res) => {
  const { search, limit = 50 } = req.query;
  let q = supabase.from("users").select("id, username, display_name, role, ng_id, custom_id, is_premium, avatar_url, created_at, email").order("created_at", { ascending: false }).limit(parseInt(limit));
  const { data, error } = await q;
  if (error) return res.json([]);
  // Filter by search client-side (username or ng_id)
  let users = data || [];
  if (search) {
    const s = String(search).toLowerCase();
    users = users.filter(u =>
      (u.username || "").toLowerCase().includes(s) ||
      String(u.ng_id || "").includes(s) ||
      (u.email || "").toLowerCase().includes(s)
    );
  }
  // Check bans
  const userIds = users.map(u => u.id);
  const { data: bans } = await safeQuery(supabase.from("punishments").select("user_id").eq("type", "ban").eq("active", true).in("user_id", userIds));
  const bannedIds = new Set((bans || []).map(b => b.user_id));
  users = users.map(u => ({ ...u, banned: bannedIds.has(u.id) }));
  res.json(users);
});

// ============================================================================
//  PUNISHMENTS (ban / mute / warning)
// ============================================================================

router.get("/punishments", requireAdmin, async (req, res) => {
  const { data, error } = await safeQuery(supabase.from("punishments").select("*").eq("active", true).order("created_at", { ascending: false }).limit(100));
  if (error) return res.json([]);
  res.json(data || []);
});

router.post("/punishments", requireAdmin, async (req, res) => {
  const { userId, type, reason, duration } = req.body;
  if (!userId || !type) return res.status(400).json({ error: "Укажите пользователя и тип" });

  const validTypes = ["ban", "mute_dm", "mute_posts", "warning"];
  if (!validTypes.includes(type)) return res.status(400).json({ error: "Недопустимый тип наказания" });

  const { data: target } = await supabase.from("users").select("username").eq("id", userId).single();
  if (!target) return res.status(404).json({ error: "Пользователь не найден" });

  let expiresAt = null;
  if (duration && duration !== "permanent") {
    const days = parseInt(duration.replace(/\D/g, "")) || 7;
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const { data: admin } = await supabase.from("users").select("username").eq("id", req.userId).single();

  const { data, error } = await safeQuery(supabase.from("punishments").insert({
    user_id: userId, type, reason: reason || "Не указана",
    duration: duration || "7d", issued_by: req.userId,
    issued_by_name: admin?.username || "admin",
    active: true, expires_at: expiresAt,
  }).select("*").single());

  if (error) return res.status(500).json({ error: error.message });

  // For bans, we could also set a flag on the user
  if (type === "ban") {
    await supabase.from("users").update({ banned_until: expiresAt }).eq("id", userId);
  }

  await logAction(`Выдано: ${type}`, req.userId, userId, target.username, `${duration || "7d"} · ${reason || ""}`);
  res.status(201).json(data);
});

router.post("/punishments/:id/revoke", requireAdmin, async (req, res) => {
  const { data: pun } = await safeQuery(supabase.from("punishments").select("*").eq("id", req.params.id).single());
  if (!pun) return res.status(404).json({ error: "Наказание не найдено" });

  await safeQuery(supabase.from("punishments").update({ active: false }).eq("id", req.params.id));

  if (pun.type === "ban") {
    await supabase.from("users").update({ banned_until: null }).eq("id", pun.user_id);
  }

  await logAction("Снято наказание", req.userId, pun.user_id, pun.issued_by_name || "", pun.type);
  res.json({ ok: true });
});

// ============================================================================
//  REPORTS
// ============================================================================

// Create a report (any authenticated user)
router.post("/reports", async (req, res) => {
  const { targetType, targetId, category, reason } = req.body;
  if (!targetType || !targetId || !category) return res.status(400).json({ error: "Недостаточно данных" });
  const { data: user } = await supabase.from("users").select("username").eq("id", req.userId).single();
  const { data, error } = await safeQuery(supabase.from("reports").insert({
    target_type: targetType, target_id: targetId, category, reason: reason || "",
    reporter_id: req.userId, reporter_name: user?.username || "Аноним", status: "pending",
  }).select("*").single());
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.get("/reports", requireAdmin, async (req, res) => {
  const { status } = req.query;
  let q = supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(100);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await safeQuery(q);
  if (error) return res.json([]);
  res.json(data || []);
});

router.post("/reports/:id/action", requireAdmin, async (req, res) => {
  const { action } = req.body; // "reviewed" or "actioned"
  const { data: report } = await safeQuery(supabase.from("reports").select("*").eq("id", req.params.id).single());
  if (!report) return res.status(404).json({ error: "Жалоба не найдена" });
  await safeQuery(supabase.from("reports").update({ status: action }).eq("id", req.params.id));
  await logAction(`Жалоба: ${action}`, req.userId, null, report.reporter_name, report.category);
  res.json({ ok: true });
});

// ============================================================================
//  PURCHASE REQUESTS (moved from before)
// ============================================================================

router.post("/purchases", async (req, res) => {
  const { itemType, itemName, price } = req.body;
  if (!itemType || !itemName || !price) return res.status(400).json({ error: "Недостаточно данных" });
  const { data: user } = await supabase.from("users").select("id, username, ng_id").eq("id", req.userId).single();
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });
  const { data, error } = await safeQuery(supabase.from("purchase_requests").insert({
    user_id: req.userId, username: user.username, ng_id: user.ng_id,
    item_type: itemType, item_name: itemName, price, status: "pending",
  }).select("*").single());
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.get("/purchases", requireAdmin, async (req, res) => {
  const { status } = req.query;
  let q = supabase.from("purchase_requests").select("*").order("created_at", { ascending: false }).limit(100);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await safeQuery(q);
  if (error) return res.json([]);
  res.json(data || []);
});

router.post("/purchases/:id/approve", requireAdmin, async (req, res) => {
  const { data: purchase } = await safeQuery(supabase.from("purchase_requests").select("*").eq("id", req.params.id).single());
  if (!purchase) return res.status(404).json({ error: "Заявка не найдена" });
  await safeQuery(supabase.from("purchase_requests").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", req.params.id));

  if (purchase.item_type === "premium") {
    const months = purchase.item_name.includes("2 год") ? 24 : purchase.item_name.includes("год") ? 12 : 1;
    const until = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("users").update({ is_premium: true, premium_until: until }).eq("id", purchase.user_id);
  } else if (purchase.item_type === "coins") {
    const match = purchase.item_name.match(/(\d+)/);
    const coins = match ? parseInt(match[1]) : 0;
    const { data: user } = await supabase.from("users").select("night_coins").eq("id", purchase.user_id).single();
    await supabase.from("users").update({ night_coins: (user?.night_coins ?? 0) + coins }).eq("id", purchase.user_id);
  }
  await logAction("Одобрена покупка", req.userId, purchase.user_id, purchase.username, `${purchase.item_name} · ${purchase.price}₽`);
  res.json({ ok: true });
});

router.post("/purchases/:id/reject", requireAdmin, async (req, res) => {
  const { data: purchase } = await safeQuery(supabase.from("purchase_requests").select("*").eq("id", req.params.id).single());
  if (!purchase) return res.status(404).json({ error: "Заявка не найдена" });
  await safeQuery(supabase.from("purchase_requests").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", req.params.id));
  await logAction("Отклонена покупка", req.userId, purchase.user_id, purchase.username, `${purchase.item_name}`);
  res.json({ ok: true });
});

// ============================================================================
//  ROLES (owner / co_owner only)
// ============================================================================

router.patch("/users/:id/role", requireOwner, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const validRoles = ["user", "creator", "moderator", "admin", "support", "co_owner", "owner"];
  if (!validRoles.includes(role)) return res.status(400).json({ error: "Недопустимая роль" });

  const { data: target } = await supabase.from("users").select("role, username").eq("id", id).single();
  if (!target) return res.status(404).json({ error: "Пользователь не найден" });
  if (target.role === "owner" && role !== "owner") return res.status(403).json({ error: "Нельзя изменить роль владельца" });

  const { error } = await supabase.from("users").update({ role }).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  await logAction("Смена роли", req.userId, id, target.username, `→ ${role}`);
  res.json({ ok: true, role });
});

// ============================================================================
//  VERIFY
// ============================================================================

router.patch("/users/:id/verify", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { verified } = req.body;
  const { data: target } = await supabase.from("users").select("username").eq("id", id).single();
  if (!target) return res.status(404).json({ error: "Пользователь не найден" });
  await supabase.from("users").update({ avatar_frame: verified ? "verified" : null }).eq("id", id);
  await logAction(verified ? "Верификация" : "Снятие верификации", req.userId, id, target.username, "");
  res.json({ ok: true });
});

// ============================================================================
//  EDIT USER STATS
// ============================================================================

router.patch("/users/:id/stats", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nightCoins, isPremium, premiumUntil } = req.body;
  const update = {};
  if (nightCoins !== undefined) update.night_coins = parseInt(nightCoins);
  if (isPremium !== undefined) update.is_premium = isPremium;
  if (premiumUntil !== undefined) update.premium_until = premiumUntil;
  const { data: target } = await supabase.from("users").select("username").eq("id", id).single();
  if (!target) return res.status(404).json({ error: "Пользователь не найден" });
  const { error } = await supabase.from("users").update(update).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  await logAction("Изменение статистики", req.userId, id, target.username, JSON.stringify(update));
  res.json({ ok: true });
});

// ============================================================================
//  BROADCAST (send notification to all)
// ============================================================================

router.post("/broadcast", requireAdmin, async (req, res) => {
  const { title, subtitle, body, icon } = req.body;
  if (!title) return res.status(400).json({ error: "Укажите заголовок" });

  // Get all user IDs
  const { data: users } = await supabase.from("users").select("id");
  if (!users || users.length === 0) return res.json({ ok: true, sent: 0 });

  // Insert a notification for each user
  const notifications = users.map(u => ({
    user_id: u.id,
    type: "system",
    title,
    body: `${subtitle ? subtitle + " — " : ""}${body || ""}`,
    read: false,
  }));

  // Batch insert (Supabase handles arrays)
  const { error } = await safeQuery(supabase.from("notifications").insert(notifications));
  if (error) return res.status(500).json({ error: error.message });

  await logAction("Рассылка", req.userId, null, "Всем пользователям", title);
  res.json({ ok: true, sent: users.length });
});

// ============================================================================
//  LOGS
// ============================================================================

router.get("/logs", requireAdmin, async (req, res) => {
  const { data, error } = await safeQuery(supabase.from("moderation_logs").select("*").order("created_at", { ascending: false }).limit(100));
  if (error) return res.json([]);
  res.json(data || []);
});

module.exports = router;
