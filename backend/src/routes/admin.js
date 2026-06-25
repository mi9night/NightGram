// =============================================================================
//  Admin routes — full moderation: tickets, users, punishments, reports,
//  purchases, broadcasts, logs, roles
// =============================================================================

const router = require("express").Router();
const { supabase } = require("../lib/supabase");
const { consumeRateLimitDistributed, rateLimitResponse, logSpamEvent, getTrustProfile, trustLimit, createModerationFlag, clearTrustCache, normalizeDomain, clearDomainRulesCache } = require("../lib/safety");

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

// Helper: safe query for Supabase query builders.
// Some @supabase/supabase-js versions return a thenable query builder without .catch().
async function safeQuery(promise, fallbackData = []) {
  try {
    return await promise;
  } catch (error) {
    return { data: fallbackData, error };
  }
}

async function pushNotification(req, userId, notification) {
  try {
    const { data } = await supabase.from("notifications").insert({ user_id: userId, ...notification }).select("*").single();
    req.app.get("io")?.to(`user:${userId}`).emit("notification:new", {
      id: data.id, type: data.type, title: data.title, body: data.body || "", avatarUrl: data.avatar_url || null, read: data.read || false, createdAt: data.created_at,
    });
  } catch { /* ignore */ }
}

function punishmentNotice(type, reason, duration, expiresAt) {
  const cleanReason = String(reason || "Не указана").trim();
  const cleanDuration = String(duration || "7d").trim();
  const until = expiresAt ? ` до ${new Date(expiresAt).toLocaleString("ru-RU")}` : cleanDuration === "permanent" ? " навсегда" : "";
  if (type === "mute_dm") {
    return {
      title: "Ограничение сообщений",
      body: `Вам временно отключили отправку сообщений${until}. Причина: ${cleanReason}`,
    };
  }
  if (type === "mute_posts") {
    return {
      title: "Ограничение публикаций",
      body: `Вам временно отключили посты и комментарии${until}. Причина: ${cleanReason}`,
    };
  }
  if (type === "warning") {
    return {
      title: "Предупреждение модерации",
      body: `Вы получили предупреждение. Причина: ${cleanReason}${cleanDuration && cleanDuration !== "—" ? ` · ${cleanDuration}` : ""}`,
    };
  }
  return null;
}

async function notifyPunishment(req, userId, type, reason, duration, expiresAt) {
  const notice = punishmentNotice(type, reason, duration, expiresAt);
  if (!notice) return;
  await pushNotification(req, userId, {
    type: "system",
    title: notice.title,
    body: notice.body,
    read: false,
  });
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

function serializeReport(row, target = null) {
  return {
    ...row,
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    resolutionNote: row.resolution_note || "",
    reviewedBy: row.reviewed_by || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at,
    target,
  };
}

async function resolveReportTarget(report) {
  const type = String(report.target_type || "");
  const id = String(report.target_id || "");
  if (!id) return null;
  if (type === "user") {
    const { data } = await safeQuery(supabase.from("users").select("id,username,display_name,bio,avatar_url,role,is_premium,created_at").eq("id", id).maybeSingle(), null);
    return data ? { type, ...data } : null;
  }
  if (type === "post") {
    const { data } = await safeQuery(supabase.from("posts").select("id,text,author_user_id,author_channel_id,created_at").eq("id", id).maybeSingle(), null);
    return data ? { type, ...data } : null;
  }
  if (type === "comment") {
    const { data } = await safeQuery(supabase.from("comments").select("id,text,author_id,post_id,created_at").eq("id", id).maybeSingle(), null);
    return data ? { type, ...data } : null;
  }
  if (type === "channel") {
    const { data } = await safeQuery(supabase.from("channels").select("id,name,handle,description,avatar_url,owner_id,subscribers_count,created_at").eq("id", id).maybeSingle(), null);
    return data ? { type, ...data } : null;
  }
  return null;
}

async function resolveReportTargetUser(report) {
  const type = String(report.target_type || "");
  const id = String(report.target_id || "");
  if (type === "user") {
    const { data } = await safeQuery(supabase.from("users").select("id,username").eq("id", id).maybeSingle(), null);
    return data;
  }
  if (type === "post") {
    const { data: post } = await safeQuery(supabase.from("posts").select("author_user_id,author_channel_id").eq("id", id).maybeSingle(), null);
    if (post?.author_user_id) return (await safeQuery(supabase.from("users").select("id,username").eq("id", post.author_user_id).maybeSingle(), null)).data;
    if (post?.author_channel_id) {
      const { data: channel } = await safeQuery(supabase.from("channels").select("owner_id").eq("id", post.author_channel_id).maybeSingle(), null);
      if (channel?.owner_id) return (await safeQuery(supabase.from("users").select("id,username").eq("id", channel.owner_id).maybeSingle(), null)).data;
    }
  }
  if (type === "comment") {
    const { data: comment } = await safeQuery(supabase.from("comments").select("author_id").eq("id", id).maybeSingle(), null);
    if (comment?.author_id) return (await safeQuery(supabase.from("users").select("id,username").eq("id", comment.author_id).maybeSingle(), null)).data;
  }
  if (type === "channel") {
    const { data: channel } = await safeQuery(supabase.from("channels").select("owner_id").eq("id", id).maybeSingle(), null);
    if (channel?.owner_id) return (await safeQuery(supabase.from("users").select("id,username").eq("id", channel.owner_id).maybeSingle(), null)).data;
  }
  return null;
}

async function addReportNote(req, report, body) {
  const note = String(body || "").trim();
  if (!note) return null;
  const { data: admin } = await safeQuery(supabase.from("users").select("username").eq("id", req.userId).maybeSingle(), null);
  const { data } = await safeQuery(
    supabase.from("moderation_notes").insert({
      report_id: report.id,
      target_type: report.target_type,
      target_id: report.target_id,
      author_id: req.userId,
      author_name: admin?.username || "admin",
      body: note,
    }).select("*").single(),
    null,
  );
  return data;
}

// ============================================================================
//  TICKETS
// ============================================================================

router.get("/tickets/me", async (req, res) => {
  const { data, error } = await safeQuery(
    supabase
      .from("tickets")
      .select("*")
      .eq("author_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(50),
  );
  if (error) return res.json([]);
  res.json(data || []);
});

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

router.get("/tickets/:id/messages", requireAdmin, async (req, res) => {
  const { data, error } = await safeQuery(
    supabase.from("ticket_messages").select("*").eq("ticket_id", req.params.id).order("created_at", { ascending: true }),
  );
  if (error) return res.json([]);
  res.json(data || []);
});

router.post("/tickets/:id/messages", requireAdmin, async (req, res) => {
  const { text } = req.body;
  if (!text || !String(text).trim()) return res.status(400).json({ error: "Empty reply" });
  const { data: ticket } = await safeQuery(supabase.from("tickets").select("author_id,subject").eq("id", req.params.id).single());
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  const { data, error } = await safeQuery(
    supabase.from("ticket_messages").insert({
      ticket_id: req.params.id,
      author_id: req.userId,
      author_role: "support",
      text: String(text).trim(),
    }).select("*").single(),
  );
  if (error) return res.status(503).json({ error: "Ticket replies unavailable", detail: error.message });
  await supabase.from("tickets").update({ status: "in_progress" }).eq("id", req.params.id);
  if (ticket.author_id && ticket.author_id !== req.userId) {
    await pushNotification(req, ticket.author_id, {
      type: "system",
      title: "Ответ поддержки",
      body: `В тикете «${ticket.subject || "Без темы"}» появился новый ответ`,
      read: false,
    });
  }
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
  let result = await safeQuery(
    supabase.from("users").select("id, username, display_name, role, ng_id, custom_id, is_premium, verified, avatar_url, created_at, email").order("created_at", { ascending: false }).limit(parseInt(limit)),
    [],
  );
  if (result.error && /verified|schema cache/i.test(result.error.message || "")) {
    result = await safeQuery(
      supabase.from("users").select("id, username, display_name, role, ng_id, custom_id, is_premium, avatar_frame, avatar_url, created_at, email").order("created_at", { ascending: false }).limit(parseInt(limit)),
      [],
    );
  }
  const { data, error } = result;
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

  // For bans, we could also set a flag on the user. Mutes/warnings are sent to notifications.
  if (type === "ban") {
    await supabase.from("users").update({ banned_until: expiresAt }).eq("id", userId);
  } else {
    await notifyPunishment(req, userId, type, reason || "Не указана", duration || "7d", expiresAt);
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
  const trust = await getTrustProfile(req.userId);
  const reportLimit = await consumeRateLimitDistributed(`reports:create:${req.userId}`, { limit: trustLimit(25, trust, { new: 0.25, low: 0.45, trusted: 1.2, staff: 3 }), windowMs: 24 * 60 * 60 * 1000 });
  if (!reportLimit.allowed) {
    await logSpamEvent({ userId: req.userId, eventType: "report_rate_limited", targetType: "report", meta: { retryAfter: reportLimit.retryAfter, trust } });
    return rateLimitResponse(res, reportLimit, "Слишком много жалоб за сутки. Подожди перед следующей отправкой.");
  }
  const { targetType, targetId, category, reason } = req.body;
  if (!targetType || !targetId || !category) return res.status(400).json({ error: "Недостаточно данных" });

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: duplicateReports } = await safeQuery(
    supabase
      .from("reports")
      .select("id,status")
      .eq("reporter_id", req.userId)
      .eq("target_type", targetType)
      .eq("target_id", String(targetId))
      .gte("created_at", since24h),
    [],
  );
  if ((duplicateReports || []).length >= 2) {
    await logSpamEvent({ userId: req.userId, eventType: "duplicate_report", targetType, targetId, meta: { count: duplicateReports.length, trust } });
    return res.status(429).json({ error: "rate_limited", message: "Ты уже отправлял жалобу на этот объект. Модерация её увидит.", retryAfter: 3600 });
  }

  const { data: rejectedReports } = await safeQuery(
    supabase
      .from("reports")
      .select("id")
      .eq("reporter_id", req.userId)
      .eq("status", "reviewed")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(20),
    [],
  );
  if ((rejectedReports || []).length >= 10 && trust.level !== "staff") {
    await logSpamEvent({ userId: req.userId, eventType: "possible_false_reports", targetType, targetId, meta: { rejectedCount: rejectedReports.length, trust } });
    await createModerationFlag({ userId: req.userId, type: "possible_false_reports", severity: 2, reason: "Много отклонённых жалоб", meta: { rejectedCount: rejectedReports.length } });
  }
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

  const out = [];
  for (const report of data || []) {
    out.push(serializeReport(report, await resolveReportTarget(report)));
  }
  res.json(out);
});

router.get("/reports/:id/notes", requireAdmin, async (req, res) => {
  const { data, error } = await safeQuery(
    supabase.from("moderation_notes").select("*").eq("report_id", req.params.id).order("created_at", { ascending: true }),
  );
  if (error) return res.json([]);
  res.json(data || []);
});

router.post("/reports/:id/notes", requireAdmin, async (req, res) => {
  const { body } = req.body;
  const { data: report } = await safeQuery(supabase.from("reports").select("*").eq("id", req.params.id).single(), null);
  if (!report) return res.status(404).json({ error: "Жалоба не найдена" });
  const note = await addReportNote(req, report, body);
  if (!note) return res.status(400).json({ error: "Напишите заметку" });
  await logAction("Заметка к жалобе", req.userId, null, report.reporter_name, String(body).slice(0, 120));
  res.status(201).json(note);
});

router.patch("/reports/:id/target", requireAdmin, async (req, res) => {
  const { data: report } = await safeQuery(supabase.from("reports").select("*").eq("id", req.params.id).single(), null);
  if (!report) return res.status(404).json({ error: "Жалоба не найдена" });
  const type = String(report.target_type || "");
  const targetId = String(report.target_id || "");
  const patch = {};

  if (type === "post") {
    if (req.body.text !== undefined) patch.text = String(req.body.text).slice(0, 4096);
    if (Object.keys(patch).length) await safeQuery(supabase.from("posts").update(patch).eq("id", targetId));
  } else if (type === "comment") {
    if (req.body.text !== undefined) patch.text = String(req.body.text).slice(0, 1000);
    if (Object.keys(patch).length) await safeQuery(supabase.from("comments").update(patch).eq("id", targetId));
  } else if (type === "channel") {
    if (req.body.name !== undefined) patch.name = String(req.body.name).slice(0, 80);
    if (req.body.description !== undefined) patch.description = String(req.body.description).slice(0, 300);
    if (Object.keys(patch).length) await safeQuery(supabase.from("channels").update(patch).eq("id", targetId));
  } else if (type === "user") {
    if (req.body.displayName !== undefined) patch.display_name = String(req.body.displayName).slice(0, 80);
    if (req.body.bio !== undefined) patch.bio = String(req.body.bio).slice(0, 300);
    if (Object.keys(patch).length) await safeQuery(supabase.from("users").update(patch).eq("id", targetId));
  } else {
    return res.status(400).json({ error: "Этот тип цели нельзя редактировать" });
  }

  await addReportNote(req, report, `Инлайн-редактирование цели: ${JSON.stringify(patch)}`);
  await logAction("Редактирование цели жалобы", req.userId, null, report.reporter_name, `${type}:${targetId}`);
  res.json({ ok: true, target: await resolveReportTarget(report) });
});

router.post("/reports/:id/action", requireAdmin, async (req, res) => {
  const { action, note, punishment } = req.body; // "reviewed" or "actioned"
  if (!["reviewed", "actioned", "pending"].includes(action)) return res.status(400).json({ error: "Неверный статус" });
  const { data: report } = await safeQuery(supabase.from("reports").select("*").eq("id", req.params.id).single(), null);
  if (!report) return res.status(404).json({ error: "Жалоба не найдена" });

  const update = { status: action, reviewed_by: req.userId, resolution_note: note || null, updated_at: new Date().toISOString() };
  let result = await safeQuery(supabase.from("reports").update(update).eq("id", req.params.id));
  if (result.error && /reviewed_by|resolution_note|updated_at|schema cache/i.test(result.error.message || "")) {
    result = await safeQuery(supabase.from("reports").update({ status: action }).eq("id", req.params.id));
  }
  if (result.error) return res.status(500).json({ error: result.error.message });

  if (note) await addReportNote(req, report, `Решение: ${note}`);

  if (punishment?.type) {
    const targetUser = punishment.userId
      ? (await safeQuery(supabase.from("users").select("id,username").eq("id", punishment.userId).maybeSingle(), null)).data
      : await resolveReportTargetUser(report);
    if (targetUser?.id) {
      const duration = String(punishment.duration || "7d");
      let expiresAt = null;
      if (duration && duration !== "permanent" && duration !== "—") {
        const days = parseInt(duration.replace(/\D/g, "")) || 7;
        expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      }
      const { data: admin } = await safeQuery(supabase.from("users").select("username").eq("id", req.userId).single(), null);
      const punishmentReason = punishment.reason || `Жалоба: ${report.category}`;
      await safeQuery(supabase.from("punishments").insert({
        user_id: targetUser.id,
        type: punishment.type,
        reason: punishmentReason,
        duration,
        issued_by: req.userId,
        issued_by_name: admin?.username || "admin",
        active: true,
        expires_at: expiresAt,
      }));
      if (punishment.type === "ban") await safeQuery(supabase.from("users").update({ banned_until: expiresAt }).eq("id", targetUser.id));
      else await notifyPunishment(req, targetUser.id, punishment.type, punishmentReason, duration, expiresAt);
    }
  }

  await logAction(`Жалоба: ${action}`, req.userId, null, report.reporter_name, `${report.category}${note ? ` · ${note}` : ""}`);
  res.json({ ok: true });
});

// ============================================================================
//  PURCHASE REQUESTS (moved from before)
// ============================================================================

router.post("/purchases", async (req, res) => {
  const { itemType, itemName, price, giftRecipientId } = req.body;
  if (!itemType || !itemName || !price) return res.status(400).json({ error: "Недостаточно данных" });
  const { data: user } = await supabase.from("users").select("id, username, ng_id").eq("id", req.userId).single();
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  let recipient = null;
  if (giftRecipientId && giftRecipientId !== req.userId) {
    const { data } = await safeQuery(
      supabase.from("users").select("id,username,ng_id").eq("id", giftRecipientId).maybeSingle(),
      null,
    );
    if (!data) return res.status(404).json({ error: "Получатель подарка не найден" });
    recipient = data;
  }

  const paymentCode = `NG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const giftSuffix = recipient ? ` GIFT @${recipient.username} #${recipient.ng_id}` : "";
  const paymentComment = `${paymentCode} #${user.ng_id}${giftSuffix} ${itemName} ${price}₽`;
  const payload = {
    user_id: req.userId,
    username: user.username,
    ng_id: user.ng_id,
    recipient_user_id: recipient?.id || null,
    recipient_username: recipient?.username || null,
    recipient_ng_id: recipient?.ng_id || null,
    item_type: itemType,
    item_name: itemName,
    price,
    status: "pending",
    payment_code: paymentCode,
    expected_amount: price,
    provider: "donation",
  };

  let result = await safeQuery(supabase.from("purchase_requests").insert(payload).select("*").single());
  // DB not migrated yet — keep manual flow working without the new columns.
  if (result.error && /payment_code|expected_amount|provider|recipient_|schema cache/i.test(result.error.message || "")) {
    result = await safeQuery(supabase.from("purchase_requests").insert({
      user_id: req.userId, username: user.username, ng_id: user.ng_id,
      item_type: itemType, item_name: itemName, price, status: "pending",
    }).select("*").single());
  }

  if (result.error) return res.status(500).json({ error: result.error.message });
  res.status(201).json({
    ...result.data,
    paymentCode,
    payment_code: paymentCode,
    paymentComment,
    payment_comment: paymentComment,
    giftRecipientUsername: recipient?.username,
    giftRecipientNgId: recipient?.ng_id,
  });
});

router.get("/payments/events", requireAdmin, async (req, res) => {
  const { status } = req.query;
  let q = supabase.from("payment_events").select("*").order("created_at", { ascending: false }).limit(100);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await safeQuery(q);
  if (error) return res.json([]);
  res.json(data || []);
});

router.get("/purchases", requireAdmin, async (req, res) => {
  const { status } = req.query;
  let q = supabase.from("purchase_requests").select("*").order("created_at", { ascending: false }).limit(100);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await safeQuery(q);
  if (error) return res.json([]);
  res.json(data || []);
});

function premiumMonthsFromName(itemName = "") {
  const name = String(itemName).toLowerCase();
  if (name.includes("2 год") || name.includes("24") || name.includes("2 year")) return 24;
  if (name.includes("год") || name.includes("12") || name.includes("year")) return 12;
  return 1;
}

function premiumBoostsByMonths(months) {
  return months >= 24 ? 9 : months >= 12 ? 6 : 3;
}

function isMissingBoostBalance(error) {
  return /boost_balance|schema cache|column .*boost/i.test(error?.message || "");
}

function normalizedPurchaseType(purchase) {
  const type = String(purchase.item_type || "").toLowerCase();
  const name = String(purchase.item_name || "").toLowerCase();
  if (type === "premium" || /premium|прем/.test(name)) return "premium";
  if (["coins", "nightcoins", "night_coins", "coin"].includes(type) || /coin|nightcoin|nightcoins|✦|зв[её]зд|найткоин/.test(name)) return "coins";
  return type;
}

function coinsFromPurchaseName(itemName = "") {
  const compact = String(itemName).replace(/[\s.,]+(?=\d)/g, "");
  const match = compact.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

async function grantPurchaseToTarget(req, purchase) {
  const targetUserId = purchase.recipient_user_id || purchase.user_id;
  if (!targetUserId) throw new Error("У заявки нет пользователя для выдачи");
  const isGift = Boolean(purchase.recipient_user_id && purchase.recipient_user_id !== purchase.user_id);
  const io = req.app.get("io");
  const purchaseType = normalizedPurchaseType(purchase);

  if (purchaseType === "premium") {
    const months = premiumMonthsFromName(purchase.item_name);
    const boostBalance = premiumBoostsByMonths(months);
    let targetResult = await safeQuery(
      supabase.from("users").select("premium_until,boost_balance").eq("id", targetUserId).single(),
      null,
    );
    let boostColumnAvailable = !isMissingBoostBalance(targetResult.error);
    if (!boostColumnAvailable) {
      targetResult = await safeQuery(
        supabase.from("users").select("premium_until").eq("id", targetUserId).single(),
        null,
      );
    }
    if (targetResult.error) throw new Error(targetResult.error.message);
    const target = targetResult.data;
    const base = target?.premium_until && new Date(target.premium_until).getTime() > Date.now()
      ? new Date(target.premium_until).getTime()
      : Date.now();
    const until = new Date(base + months * 30 * 24 * 60 * 60 * 1000).toISOString();
    const premiumPatch = {
      is_premium: true,
      premium_until: until,
      ...(boostColumnAvailable ? { boost_balance: (target?.boost_balance ?? 0) + boostBalance } : {}),
    };
    let premiumUpdate = await safeQuery(supabase.from("users").update(premiumPatch).eq("id", targetUserId), null);
    if (premiumUpdate.error && isMissingBoostBalance(premiumUpdate.error)) {
      boostColumnAvailable = false;
      premiumUpdate = await safeQuery(supabase.from("users").update({ is_premium: true, premium_until: until }).eq("id", targetUserId), null);
    }
    if (premiumUpdate.error) throw new Error(premiumUpdate.error.message);
    io?.to(`user:${targetUserId}`).emit("premium:update", true, until);
    return { targetUserId, isGift, granted: { premiumUntil: until, boostBalance: boostColumnAvailable ? boostBalance : 0, boostBalanceUnavailable: !boostColumnAvailable } };
  }

  if (purchaseType === "coins") {
    const coins = coinsFromPurchaseName(purchase.item_name);
    const { data: target } = await safeQuery(
      supabase.from("users").select("night_coins").eq("id", targetUserId).single(),
      null,
    );
    if (!coins) throw new Error(`Не удалось понять количество NightCoins из "${purchase.item_name}"`);
    const balance = (target?.night_coins ?? 0) + coins;
    const coinUpdate = await safeQuery(supabase.from("users").update({ night_coins: balance }).eq("id", targetUserId), null);
    if (coinUpdate.error) throw new Error(coinUpdate.error.message);
    await safeQuery(supabase.from("coin_transactions").insert({ user_id: targetUserId, delta: coins, reason: isGift ? "gift_coins" : "topup", reference_id: purchase.id }));
    io?.to(`user:${targetUserId}`).emit("coins:update", balance);
    return { targetUserId, isGift, granted: { coins, balance } };
  }

  return { targetUserId, isGift, granted: {} };
}

router.post("/purchases/:id/approve", requireAdmin, async (req, res) => {
  const { data: purchase } = await safeQuery(supabase.from("purchase_requests").select("*").eq("id", req.params.id).single());
  if (!purchase) return res.status(404).json({ error: "Заявка не найдена" });
  if (purchase.status === "approved") return res.json({ ok: true, alreadyApproved: true });

  let grant;
  try {
    grant = await grantPurchaseToTarget(req, purchase);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Покупка не выдана" });
  }
  await safeQuery(supabase.from("purchase_requests").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", req.params.id));

  if (grant.isGift) {
    await pushNotification(req, grant.targetUserId, { type: "store", title: "Вам подарили покупку", body: `@${purchase.username} подарил: ${purchase.item_name}`, read: false });
    await pushNotification(req, purchase.user_id, { type: "store", title: "Подарок доставлен", body: `Подарок для @${purchase.recipient_username || "user"}: ${purchase.item_name}`, read: false });
  } else {
    await pushNotification(req, grant.targetUserId, { type: "store", title: "Покупка активирована", body: `${purchase.item_name} успешно выдано`, read: false });
  }
  await logAction("Одобрена покупка", req.userId, grant.targetUserId, purchase.recipient_username || purchase.username, `${purchase.item_name} · ${purchase.price}₽${grant.isGift ? ` · gift from @${purchase.username}` : ""}`);
  res.json({ ok: true, ...grant.granted });
});

router.post("/purchases/:id/regrant", requireAdmin, async (req, res) => {
  const { data: purchase } = await safeQuery(supabase.from("purchase_requests").select("*").eq("id", req.params.id).single());
  if (!purchase) return res.status(404).json({ error: "Заявка не найдена" });
  let grant;
  try {
    grant = await grantPurchaseToTarget(req, purchase);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Покупка не выдана" });
  }
  await safeQuery(supabase.from("purchase_requests").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", req.params.id));
  await pushNotification(req, grant.targetUserId, { type: "store", title: "Покупка повторно выдана", body: `${purchase.item_name} начислено вручную`, read: false });
  await logAction("Повторная выдача покупки", req.userId, grant.targetUserId, purchase.recipient_username || purchase.username, `${purchase.item_name} · ${purchase.price}₽`);
  res.json({ ok: true, ...grant.granted });
});

router.post("/purchases/:id/reject", requireAdmin, async (req, res) => {
  const { data: purchase } = await safeQuery(supabase.from("purchase_requests").select("*").eq("id", req.params.id).single());
  if (!purchase) return res.status(404).json({ error: "Заявка не найдена" });
  await safeQuery(supabase.from("purchase_requests").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", req.params.id));
  await logAction("Отклонена покупка", req.userId, purchase.user_id, purchase.username, `${purchase.item_name}`);
  res.json({ ok: true });
});

// ============================================================================
//  USER DETAIL / PROFILE MODERATION
// ============================================================================

function sanitizeAdminUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
}
function validUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username || "");
}
async function usernameHandleTaken(username, excludeUserId = null) {
  const normalized = normalizeUsername(username);
  const [{ data: user }, { data: channel }] = await Promise.all([
    safeQuery(supabase.from("users").select("id").eq("username", normalized).maybeSingle(), null),
    safeQuery(supabase.from("channels").select("id").eq("handle", normalized).maybeSingle(), null),
  ]);
  return Boolean(channel || (user && String(user.id) !== String(excludeUserId || "")));
}

async function countQuery(query) {
  const result = await safeQuery(query, null);
  return result.count || 0;
}

router.get("/users/:id/detail", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: user } = await safeQuery(supabase.from("users").select("*").eq("id", id).maybeSingle(), null);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  const [
    postsCount,
    commentsCount,
    followersCount,
    followingCount,
    friendsCount,
    conversationsCount,
    ticketsCount,
    purchasesCount,
    itemsCount,
    reportsMadeCount,
    reportsTargetCount,
    activePunishmentsRes,
    recentPurchasesRes,
    recentReportsRes,
    safetyEventsRes,
    safetyFlagsRes,
  ] = await Promise.all([
    countQuery(supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_user_id", id)),
    countQuery(supabase.from("comments").select("*", { count: "exact", head: true }).eq("author_id", id)),
    countQuery(supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", id)),
    countQuery(supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", id)),
    countQuery(supabase.from("friendships").select("*", { count: "exact", head: true }).eq("user_id", id).eq("status", "accepted")),
    countQuery(supabase.from("conversation_participants").select("*", { count: "exact", head: true }).eq("user_id", id)),
    countQuery(supabase.from("tickets").select("*", { count: "exact", head: true }).eq("author_id", id)),
    countQuery(supabase.from("purchase_requests").select("*", { count: "exact", head: true }).or(`user_id.eq.${id},recipient_user_id.eq.${id}`)),
    countQuery(supabase.from("user_items").select("*", { count: "exact", head: true }).eq("user_id", id)),
    countQuery(supabase.from("reports").select("*", { count: "exact", head: true }).eq("reporter_id", id)),
    countQuery(supabase.from("reports").select("*", { count: "exact", head: true }).eq("target_id", id)),
    safeQuery(supabase.from("punishments").select("*").eq("user_id", id).eq("active", true).order("created_at", { ascending: false }).limit(20), []),
    safeQuery(supabase.from("purchase_requests").select("*").or(`user_id.eq.${id},recipient_user_id.eq.${id}`).order("created_at", { ascending: false }).limit(10), []),
    safeQuery(supabase.from("reports").select("*").or(`reporter_id.eq.${id},target_id.eq.${id}`).order("created_at", { ascending: false }).limit(10), []),
    safeQuery(supabase.from("spam_events").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(20), []),
    safeQuery(supabase.from("moderation_flags").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(20), []),
  ]);

  const trust = await getTrustProfile(id).catch(() => null);
  res.json({
    user: sanitizeAdminUser(user),
    stats: {
      posts: postsCount,
      comments: commentsCount,
      followers: followersCount,
      following: followingCount,
      friends: friendsCount,
      conversations: conversationsCount,
      tickets: ticketsCount,
      purchases: purchasesCount,
      items: itemsCount,
      reportsMade: reportsMadeCount,
      reportsTarget: reportsTargetCount,
    },
    activePunishments: activePunishmentsRes.data || [],
    recentPurchases: recentPurchasesRes.data || [],
    recentReports: recentReportsRes.data || [],
    safety: { trust, events: safetyEventsRes.data || [], flags: safetyFlagsRes.data || [] },
  });
});

router.patch("/users/:id/profile", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const allowed = {
    username: "username",
    displayName: "display_name",
    bio: "bio",
    customId: "custom_id",
    nameColor: "name_color",
    nameColorId: "name_color_id",
    avatarUrl: "avatar_url",
    bannerUrl: "banner_url",
    avatarFrame: "avatar_frame",
    glowEffect: "glow_effect",
    hideSocial: "hide_social",
    hidePurchases: "hide_purchases",
    verified: "verified",
  };
  const patch = {};
  for (const [key, column] of Object.entries(allowed)) {
    if (req.body[key] !== undefined) patch[column] = req.body[key] === "" ? null : req.body[key];
  }
  if (patch.username !== undefined) {
    patch.username = normalizeUsername(patch.username);
    if (!validUsername(patch.username)) return res.status(400).json({ error: "Юзернейм: 3–24 символа, латиница, цифры и _" });
    if (await usernameHandleTaken(patch.username, id)) return res.status(409).json({ error: "Такой @username уже занят пользователем или каналом" });
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Нет изменений" });
  let result = await safeQuery(supabase.from("users").update(patch).eq("id", id).select("*").single(), null);
  if (result.error && /verified|hide_purchases|schema cache/i.test(result.error.message || "")) {
    delete patch.verified;
    delete patch.hide_purchases;
    result = await safeQuery(supabase.from("users").update(patch).eq("id", id).select("*").single(), null);
  }
  if (result.error) return res.status(500).json({ error: result.error.message });
  await logAction("Редактирование профиля", req.userId, id, result.data.username, JSON.stringify(patch));
  res.json(sanitizeAdminUser(result.data));
});

router.post("/users/:id/reset-cosmetics", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const patch = { name_color: "#ffffff", name_color_id: "light", avatar_frame: null, glow_effect: null };
  const { data, error } = await safeQuery(supabase.from("users").update(patch).eq("id", id).select("*").single(), null);
  if (error) return res.status(500).json({ error: error.message });
  await logAction("Сброс косметики", req.userId, id, data.username, "name_color/avatar_frame/glow");
  res.json(sanitizeAdminUser(data));
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
  const { data: target } = await supabase.from("users").select("username,avatar_frame").eq("id", id).single();
  if (!target) return res.status(404).json({ error: "Пользователь не найден" });

  let result = await safeQuery(supabase.from("users").update({ verified: Boolean(verified) }).eq("id", id));
  if (result.error && /verified|schema cache/i.test(result.error.message || "")) {
    // Legacy fallback for DBs without users.verified. New schema keeps verification separate from avatar_frame.
    result = await safeQuery(supabase.from("users").update({ avatar_frame: verified ? "verified" : (target.avatar_frame === "verified" ? null : target.avatar_frame) }).eq("id", id));
  }
  if (result.error) return res.status(500).json({ error: result.error.message });
  await logAction(verified ? "Верификация" : "Снятие верификации", req.userId, id, target.username, "");
  res.json({ ok: true, verified: Boolean(verified) });
});

// ============================================================================
//  EDIT USER STATS
// ============================================================================

router.patch("/users/:id/stats", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nightCoins, boostBalance, isPremium, premiumUntil } = req.body;
  const update = {};
  if (nightCoins !== undefined) update.night_coins = parseInt(nightCoins);
  if (boostBalance !== undefined) update.boost_balance = parseInt(boostBalance);
  if (isPremium !== undefined) update.is_premium = isPremium;
  if (premiumUntil !== undefined) update.premium_until = premiumUntil;
  const { data: target } = await supabase.from("users").select("username").eq("id", id).single();
  if (!target) return res.status(404).json({ error: "Пользователь не найден" });
  let result = await safeQuery(supabase.from("users").update(update).eq("id", id), null);
  if (result.error && isMissingBoostBalance(result.error) && update.boost_balance !== undefined) {
    delete update.boost_balance;
    if (Object.keys(update).length === 0) {
      return res.status(503).json({ error: "В Supabase нет колонки users.boost_balance. Запусти supabase/repair_boost_balance.sql" });
    }
    result = await safeQuery(supabase.from("users").update(update).eq("id", id), null);
  }
  if (result.error) return res.status(500).json({ error: result.error.message });
  await logAction("Изменение статистики", req.userId, id, target.username, JSON.stringify(update));
  res.json({ ok: true, boostBalanceSkipped: boostBalance !== undefined && update.boost_balance === undefined });
});

function normalizeStoreEffectPayload(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeListField(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map((x) => (typeof x === "string" ? x.trim() : x)).filter(Boolean);
  return String(value).split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

function enrichNftPayload(basePayload, body, category) {
  const payload = { ...normalizeStoreEffectPayload(basePayload) };
  if (category !== "nft" && body.effectType !== "nft" && body.effect_type !== "nft") return payload;

  const upgradePrice = body.upgradePriceCoins ?? body.upgrade_price_coins;
  if (upgradePrice !== undefined && upgradePrice !== null && String(upgradePrice).trim() !== "") {
    payload.upgradePriceCoins = Math.max(1, Number(upgradePrice) || 1);
  }
  const models = normalizeListField(body.nftModels ?? body.nft_models);
  if (models !== undefined) payload.nftModels = models;
  const colors = normalizeListField(body.nftColors ?? body.nft_colors);
  if (colors !== undefined) payload.nftColors = colors;
  return payload;
}

function upgradePriceFromPayload(raw) {
  const payload = normalizeStoreEffectPayload(raw);
  const value = Number(payload.upgradePriceCoins ?? payload.upgrade_price_coins ?? payload.upgradeCost ?? payload.upgradeCostBase);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function serializeStoreItem(data) {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    category: data.category,
    previewUrl: data.preview_url,
    priceCoins: data.price_coins,
    stripePriceId: data.stripe_price_id,
    rarity: data.rarity,
    effectType: data.effect_type || null,
    effectValue: data.effect_value || null,
    effectPayload: data.effect_payload || null,
    upgradeable: Boolean(data.upgradeable),
    maxLevel: data.category === "nft" ? 2 : (data.max_level || 1),
    upgradePriceCoins: upgradePriceFromPayload(data.effect_payload),
    nftCollection: data.nft_collection || null,
    owned: false,
    dropStartsAt: data.drop_starts_at || null,
    dropEndsAt: data.drop_ends_at || null,
    stockTotal: data.stock_total ?? null,
    stockSold: data.stock_sold ?? 0,
  };
}

// ============================================================================
//  STORE ITEMS
// ============================================================================

router.post("/store/items", requireAdmin, async (req, res) => {
  const {
    name,
    description = "",
    category = "theme",
    previewUrl,
    preview_url,
    priceCoins = 0,
    price_coins,
    stripePriceId,
    stripe_price_id,
    rarity = "common",
    effectType,
    effect_type,
    effectValue,
    effect_value,
    effectPayload,
    effect_payload,
    upgradeable,
    maxLevel,
    max_level,
    nftCollection,
    nft_collection,
    dropStartsAt,
    drop_starts_at,
    dropEndsAt,
    drop_ends_at,
    stockTotal,
    stock_total,
  } = req.body;

  const preview = previewUrl || preview_url;
  const price = Number(priceCoins ?? price_coins ?? 0);
  const validCategories = ["theme", "color_pack", "sticker_pack", "frame", "glow_effect", "badge", "nft"];
  const validRarities = ["common", "rare", "epic", "legendary"];

  if (!name || !preview) return res.status(400).json({ error: "Укажите название и preview URL" });
  if (!validCategories.includes(category)) return res.status(400).json({ error: "Недопустимая категория" });
  if (!validRarities.includes(rarity)) return res.status(400).json({ error: "Недопустимая редкость" });

  const row = {
    name,
    description,
    category,
    preview_url: preview,
    price_coins: Number.isFinite(price) ? price : 0,
    stripe_price_id: stripePriceId || stripe_price_id || null,
    rarity,
    effect_type: effectType || effect_type || (category === "nft" ? "nft" : null),
    effect_value: effectValue || effect_value || null,
    effect_payload: enrichNftPayload(effectPayload ?? effect_payload ?? {}, req.body, category),
    upgradeable: upgradeable !== undefined ? Boolean(upgradeable) : false,
    max_level: category === "nft" ? 2 : (Number(maxLevel ?? max_level ?? 1) || 1),
    nft_collection: nftCollection || nft_collection || null,
    drop_starts_at: dropStartsAt || drop_starts_at || null,
    drop_ends_at: dropEndsAt || drop_ends_at || null,
    stock_total: stockTotal !== undefined || stock_total !== undefined ? Number(stockTotal ?? stock_total) || null : null,
    stock_sold: 0,
  };
  let result = await supabase.from("store_items").insert(row).select("*").single();
  if (result.error && /drop_|stock_|effect_|upgradeable|max_level|nft_collection|schema cache/i.test(result.error.message || "")) {
    delete row.drop_starts_at;
    delete row.drop_ends_at;
    delete row.stock_total;
    delete row.stock_sold;
    delete row.effect_type;
    delete row.effect_value;
    delete row.effect_payload;
    delete row.upgradeable;
    delete row.max_level;
    delete row.nft_collection;
    result = await supabase.from("store_items").insert(row).select("*").single();
  }
  if (result.error) return res.status(500).json({ error: result.error.message });

  await logAction("Создан товар", req.userId, null, name, `${category} · ${price}✦`);
  res.status(201).json(serializeStoreItem(result.data));
});

router.patch("/store/items/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    category,
    previewUrl,
    preview_url,
    priceCoins,
    price_coins,
    stripePriceId,
    stripe_price_id,
    rarity,
    effectType,
    effect_type,
    effectValue,
    effect_value,
    effectPayload,
    effect_payload,
    upgradeable,
    maxLevel,
    max_level,
    nftCollection,
    nft_collection,
    dropStartsAt,
    drop_starts_at,
    dropEndsAt,
    drop_ends_at,
    stockTotal,
    stock_total,
    stockSold,
    stock_sold,
  } = req.body;

  const validCategories = ["theme", "color_pack", "sticker_pack", "frame", "glow_effect", "badge", "nft"];
  const validRarities = ["common", "rare", "epic", "legendary"];
  const patch = {};
  if (name !== undefined) patch.name = String(name).trim();
  if (description !== undefined) patch.description = String(description);
  if (category !== undefined) {
    if (!validCategories.includes(category)) return res.status(400).json({ error: "Недопустимая категория" });
    patch.category = category;
  }
  if (previewUrl !== undefined || preview_url !== undefined) patch.preview_url = previewUrl || preview_url;
  if (priceCoins !== undefined || price_coins !== undefined) patch.price_coins = Number(priceCoins ?? price_coins ?? 0);
  if (stripePriceId !== undefined || stripe_price_id !== undefined) patch.stripe_price_id = stripePriceId || stripe_price_id || null;
  if (rarity !== undefined) {
    if (!validRarities.includes(rarity)) return res.status(400).json({ error: "Недопустимая редкость" });
    patch.rarity = rarity;
  }
  if (effectType !== undefined || effect_type !== undefined) patch.effect_type = effectType || effect_type || (category === "nft" ? "nft" : null);
  if (effectValue !== undefined || effect_value !== undefined) patch.effect_value = effectValue || effect_value || null;
  if (effectPayload !== undefined || effect_payload !== undefined || req.body.upgradePriceCoins !== undefined || req.body.upgrade_price_coins !== undefined || req.body.nftModels !== undefined || req.body.nft_models !== undefined || req.body.nftColors !== undefined || req.body.nft_colors !== undefined) {
    patch.effect_payload = enrichNftPayload(effectPayload ?? effect_payload ?? {}, req.body, category);
  }
  if (upgradeable !== undefined) patch.upgradeable = Boolean(upgradeable);
  if (maxLevel !== undefined || max_level !== undefined || category === "nft") patch.max_level = category === "nft" ? 2 : (Number(maxLevel ?? max_level ?? 1) || 1);
  if (nftCollection !== undefined || nft_collection !== undefined) patch.nft_collection = nftCollection || nft_collection || null;
  if (dropStartsAt !== undefined || drop_starts_at !== undefined) patch.drop_starts_at = dropStartsAt || drop_starts_at || null;
  if (dropEndsAt !== undefined || drop_ends_at !== undefined) patch.drop_ends_at = dropEndsAt || drop_ends_at || null;
  if (stockTotal !== undefined || stock_total !== undefined) patch.stock_total = Number(stockTotal ?? stock_total) || null;
  if (stockSold !== undefined || stock_sold !== undefined) patch.stock_sold = Math.max(0, Number(stockSold ?? stock_sold) || 0);

  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Нет изменений" });
  let result = await supabase.from("store_items").update(patch).eq("id", id).select("*").single();
  if (result.error && /drop_|stock_|effect_|upgradeable|max_level|nft_collection|schema cache/i.test(result.error.message || "")) {
    delete patch.drop_starts_at;
    delete patch.drop_ends_at;
    delete patch.stock_total;
    delete patch.stock_sold;
    delete patch.effect_type;
    delete patch.effect_value;
    delete patch.effect_payload;
    delete patch.upgradeable;
    delete patch.max_level;
    delete patch.nft_collection;
    result = await supabase.from("store_items").update(patch).eq("id", id).select("*").single();
  }
  if (result.error) return res.status(500).json({ error: result.error.message });
  await logAction("Изменён товар", req.userId, null, result.data.name, JSON.stringify(patch));
  res.json(serializeStoreItem(result.data));
});

router.delete("/store/items/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: item } = await supabase.from("store_items").select("name").eq("id", id).maybeSingle();
  const { error } = await supabase.from("store_items").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  await logAction("Удалён товар", req.userId, null, item?.name || id, "");
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

  // Batch insert (Supabase handles arrays) + realtime push to online users.
  const { data: inserted, error } = await safeQuery(
    supabase.from("notifications").insert(notifications).select("*"),
  );
  if (error) return res.status(500).json({ error: error.message });

  const io = req.app.get("io");
  for (const notification of inserted || []) {
    io?.to(`user:${notification.user_id}`).emit("notification:new", {
      id: notification.id,
      type: notification.type || "system",
      title: notification.title,
      body: notification.body || "",
      avatarUrl: notification.avatar_url || null,
      read: notification.read || false,
      createdAt: notification.created_at,
    });
  }

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

router.get("/safety/events", requireAdmin, async (req, res) => {
  const { data, error } = await safeQuery(
    supabase.from("spam_events").select("*, user:users(id,username,display_name,avatar_url)").order("created_at", { ascending: false }).limit(150),
    [],
  );
  if (error) return res.json([]);
  res.json(data || []);
});

router.get("/safety/flags", requireAdmin, async (req, res) => {
  const { status = "open" } = req.query;
  let q = supabase.from("moderation_flags").select("*, user:users(id,username,display_name,avatar_url)").order("created_at", { ascending: false }).limit(100);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await safeQuery(q, []);
  if (error) return res.json([]);
  res.json(data || []);
});

router.get("/safety/users", requireAdmin, async (req, res) => {
  const { mode = "all" } = req.query;
  const now = new Date().toISOString();
  let q = supabase
    .from("users")
    .select("id,username,display_name,avatar_url,role,is_premium,safety_trust_override,safety_restrictions,safety_restricted_until,created_at")
    .order("created_at", { ascending: false })
    .limit(80);
  if (mode === "trusted") q = q.eq("safety_trust_override", "trusted");
  if (mode === "restricted") q = q.or(`safety_trust_override.eq.restricted,safety_restricted_until.gt.${now}`);
  const { data, error } = await safeQuery(q, []);
  if (error) return res.json([]);
  const out = [];
  for (const user of data || []) {
    out.push({ ...user, trust: await getTrustProfile(user.id) });
  }
  res.json(out);
});

router.get("/safety/users/:id", requireAdmin, async (req, res) => {
  const { data: user } = await safeQuery(
    supabase.from("users").select("id,username,display_name,avatar_url,role,is_premium,safety_trust_override,safety_restrictions,safety_restricted_until").eq("id", req.params.id).maybeSingle(),
    null,
  );
  if (!user) return res.status(404).json({ error: "User not found or run safety user migration" });
  const [trust, events, flags] = await Promise.all([
    getTrustProfile(req.params.id),
    safeQuery(supabase.from("spam_events").select("*").eq("user_id", req.params.id).order("created_at", { ascending: false }).limit(30), []),
    safeQuery(supabase.from("moderation_flags").select("*").eq("user_id", req.params.id).order("created_at", { ascending: false }).limit(30), []),
  ]);
  res.json({ user, trust, events: events.data || [], flags: flags.data || [] });
});

router.patch("/safety/users/:id/restrictions", requireAdmin, async (req, res) => {
  const { restrictions = {}, restrictedUntil = null, trustOverride = null } = req.body;
  const patch = {
    safety_restrictions: restrictions || {},
    safety_restricted_until: restrictedUntil || null,
    safety_trust_override: trustOverride || null,
  };
  const { data, error } = await safeQuery(
    supabase.from("users").update(patch).eq("id", req.params.id).select("id,username,safety_trust_override,safety_restrictions,safety_restricted_until").single(),
    null,
  );
  if (error) return res.status(503).json({ error: "Run safety user migration", detail: error.message });
  clearTrustCache(req.params.id);
  await logAction("Safety restrictions", req.userId, req.params.id, data?.username || req.params.id, JSON.stringify(patch));
  res.json({ ok: true, user: data, trust: await getTrustProfile(req.params.id) });
});

router.get("/safety/domains", requireAdmin, async (req, res) => {
  const { data, error } = await safeQuery(supabase.from("safety_domains").select("*").order("created_at", { ascending: false }).limit(200), []);
  if (error) return res.json([]);
  res.json(data || []);
});

router.post("/safety/domains", requireAdmin, async (req, res) => {
  const domain = normalizeDomain(req.body.domain);
  const action = req.body.action === "allow" ? "allow" : "deny";
  const reason = String(req.body.reason || "").slice(0, 240);
  if (!domain) return res.status(400).json({ error: "Domain required" });
  const { data, error } = await safeQuery(
    supabase.from("safety_domains").upsert({ domain, action, reason, created_by: req.userId }, { onConflict: "domain" }).select("*").single(),
    null,
  );
  if (error) return res.status(503).json({ error: "Run safety domains migration", detail: error.message });
  clearDomainRulesCache();
  await logAction("Safety domain", req.userId, null, domain, `${action} · ${reason}`);
  res.status(201).json(data);
});

router.delete("/safety/domains/:domain", requireAdmin, async (req, res) => {
  const domain = normalizeDomain(req.params.domain);
  await safeQuery(supabase.from("safety_domains").delete().eq("domain", domain), null);
  clearDomainRulesCache();
  res.json({ ok: true });
});

router.post("/safety/flags/:id/resolve", requireAdmin, async (req, res) => {
  const { error } = await safeQuery(
    supabase.from("moderation_flags").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: req.userId }).eq("id", req.params.id),
    null,
  );
  if (error) return res.status(500).json({ error: error.message });
  await logAction("Safety flag resolved", req.userId, null, req.params.id, "");
  res.json({ ok: true });
});

module.exports = router;
