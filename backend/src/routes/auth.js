// Auth routes — register, login, refresh, logout, me
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { supabase } = require("../lib/supabase");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../lib/jwt");
const { authMiddleware } = require("../middleware/auth");
const { clientIp, consumeRateLimitDistributed, rateLimitResponse, logSpamEvent } = require("../lib/safety");
const { getActivePunishments } = require("../lib/punishments");

function authError(res, err) {
  const status = err?.statusCode || 500;
  const message = err?.message || "Auth error";
  console.error("[Auth]", message);
  return res.status(status).json({ error: message });
}

async function safeAuthQuery(promise, fallback = { data: null, error: null }) {
  try {
    return await promise;
  } catch (error) {
    return { ...fallback, error };
  }
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
}

function validUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username || "");
}

async function usernameTaken(username) {
  const normalized = normalizeUsername(username);
  const [{ data: user }, { data: channel }] = await Promise.all([
    safeAuthQuery(
      supabase.from("users").select("id").eq("username", normalized).maybeSingle(),
      { data: null, error: null },
    ),
    safeAuthQuery(
      supabase.from("channels").select("id").eq("handle", normalized).maybeSingle(),
      { data: null, error: null },
    ),
  ]);
  return Boolean(user || channel);
}

function serializePunishment(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    reason: row.reason || "Не указана",
    duration: row.duration || null,
    issuedByName: row.issued_by_name || "moderation",
    expiresAt: row.expires_at || null,
    createdAt: row.created_at || null,
  };
}

async function withActiveBan(user) {
  const ban = (await getActivePunishments(user.id, ["ban"])).find(Boolean);
  return ban ? { ...user, activeBan: serializePunishment(ban) } : user;
}

async function finalizeDeletionIfDue(user) {
  let scheduledAt = user.deletion_scheduled_at;
  if (!scheduledAt) {
    const { data: req } = await safeAuthQuery(
      supabase
        .from("account_deletion_requests")
        .select("scheduled_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      { data: null, error: null },
    );
    scheduledAt = req?.scheduled_at;
  }
  if (!scheduledAt || new Date(scheduledAt).getTime() > Date.now()) return user;

  const deletedUsername = `deleted_${String(user.ng_id || Date.now())}`;
  const patch = {
    username: deletedUsername,
    display_name: "Удалённый аккаунт",
    avatar_url: null,
    banner_url: null,
    bio: "",
    custom_id: null,
    name_color: "#fb7185",
    deleted_at: new Date().toISOString(),
    deletion_requested_at: null,
    deletion_scheduled_at: null,
  };
  let result = await supabase.from("users").update(patch).eq("id", user.id).select("*").single();
  if (result.error && /deleted_at|deletion_|schema cache/i.test(result.error.message || "")) {
    const { deleted_at, deletion_requested_at, deletion_scheduled_at, ...legacyPatch } = patch;
    result = await supabase.from("users").update(legacyPatch).eq("id", user.id).select("*").single();
  }
  await safeAuthQuery(
    supabase.from("account_deletion_requests").delete().eq("user_id", user.id),
    { data: null, error: null },
  );
  return result.data || { ...user, ...patch };
}

// GET /api/auth/username/:username — public username availability check
router.get("/username/:username", async (req, res) => {
  const username = normalizeUsername(req.params.username);
  if (!validUsername(username)) {
    return res.json({ username, available: false, reason: "Юзернейм: 3–24 символа, латиница, цифры и _" });
  }
  const taken = await usernameTaken(username);
  res.json({ username, available: !taken, reason: taken ? "Юзернейм уже занят" : null });
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const ip = clientIp(req);
    const limited = await consumeRateLimitDistributed(`auth:register:${ip}`, { limit: 3, windowMs: 60 * 60 * 1000 });
    if (!limited.allowed) {
      await logSpamEvent({ eventType: "register_rate_limited", targetType: "ip", targetId: ip, meta: { retryAfter: limited.retryAfter } });
      return rateLimitResponse(res, limited, "Слишком много регистраций с этого IP. Попробуй позже.");
    }

    const { login, displayName, username: rawUsername, email, password } = req.body;
    const username = normalizeUsername(rawUsername);
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const cleanDisplayName = String(displayName || login || username).trim().slice(0, 32);

    if (!cleanDisplayName || !username || !normalizedEmail || !password) return res.status(400).json({ error: "Missing fields" });
    if (!validUsername(username)) return res.status(400).json({ error: "Юзернейм: 3–24 символа, латиница, цифры и _" });
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return res.status(400).json({ error: "Некорректная почта" });
    if (String(password).length < 6) return res.status(400).json({ error: "Пароль должен быть минимум 6 символов" });
    if (await usernameTaken(username)) return res.status(409).json({ error: "Юзернейм уже занят" });

    const password_hash = await bcrypt.hash(String(password), 12);
    const insertPayload = {
      username,
      email: normalizedEmail,
      password_hash,
      display_name: cleanDisplayName,
      name_color: "#ffffff",
      name_color_id: "light",
      banner_url: null,
    };
    let result = await supabase
      .from("users")
      .insert(insertPayload)
      .select()
      .single();

    // Backward compatibility for databases that have not run optional profile-column migrations yet.
    if (result.error && /name_color_id|banner_url|schema cache/i.test(result.error.message || "")) {
      const { banner_url, name_color_id, ...legacyPayload } = insertPayload;
      result = await supabase
        .from("users")
        .insert(legacyPayload)
        .select()
        .single();
    }

    const { data, error } = result;
    if (error) return res.status(409).json({ error: /duplicate|unique/i.test(error.message || "") ? "Этот email или username уже занят" : error.message });

    const userWithBan = await withActiveBan(data);
    const accessToken = signAccessToken(data);
    const refreshToken = signRefreshToken(data);
    res.json({ user: sanitize(userWithBan), accessToken, refreshToken });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const ip = clientIp(req);
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const ipLimit = await consumeRateLimitDistributed(`auth:login:ip:${ip}`, { limit: 25, windowMs: 10 * 60 * 1000 });
    const accountLimit = await consumeRateLimitDistributed(`auth:login:account:${normalizedEmail || ip}`, { limit: 8, windowMs: 10 * 60 * 1000 });
    const limited = !ipLimit.allowed ? ipLimit : !accountLimit.allowed ? accountLimit : null;
    if (limited) {
      await logSpamEvent({ eventType: "login_rate_limited", targetType: "ip", targetId: ip, meta: { email: normalizedEmail, retryAfter: limited.retryAfter } });
      return rateLimitResponse(res, limited, "Слишком много попыток входа. Подожди и попробуй снова.");
    }
    if (!email || !password) return res.status(400).json({ error: "Missing credentials" });

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", String(email).trim().toLowerCase())
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (!user.password_hash || typeof user.password_hash !== "string") {
      // Prevent Express async route from hanging if legacy rows have no password hash.
      return res.status(401).json({ error: "This account has no web password. Register again or reset the password." });
    }

    let ok = false;
    try {
      ok = await bcrypt.compare(String(password), user.password_hash);
    } catch (err) {
      console.error("[Auth] bcrypt compare failed:", err.message);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const activeUser = await finalizeDeletionIfDue(user);
    const userWithBan = await withActiveBan(activeUser);
    const accessToken = signAccessToken(activeUser);
    const refreshToken = signRefreshToken(activeUser);
    res.json({ user: sanitize(userWithBan), accessToken, refreshToken });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const payload = verifyRefreshToken(refreshToken);
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", payload.sub)
      .single();
    if (!user) return res.status(401).json({ error: "User not found" });
    const activeUser = await finalizeDeletionIfDue(user);
    res.json({
      accessToken: signAccessToken(activeUser),
      refreshToken: signRefreshToken(activeUser),
    });
  } catch (err) {
    const msg = err?.message || "";
    if (msg.includes("JWT_") || msg.includes("not configured")) return authError(res, err);
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

// PATCH /api/auth/email — change email after password confirmation
router.patch("/email", authMiddleware, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const normalized = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) return res.status(400).json({ error: "Invalid email" });

    const { data: user } = await supabase.from("users").select("*").eq("id", req.userId).single();
    if (!user) return res.status(404).json({ error: "User not found" });
    const ok = await bcrypt.compare(String(password), user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Invalid password" });

    const { data, error } = await supabase
      .from("users")
      .update({ email: normalized })
      .eq("id", req.userId)
      .select("*")
      .single();
    if (error) return res.status(409).json({ error: error.message });
    res.json(sanitize(data));
  } catch (err) {
    return authError(res, err);
  }
});

// PATCH /api/auth/password — change password after password confirmation
router.patch("/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: "Password fields invalid" });
    }
    const { data: user } = await supabase.from("users").select("*").eq("id", req.userId).single();
    if (!user) return res.status(404).json({ error: "User not found" });
    const ok = await bcrypt.compare(String(currentPassword), user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Invalid password" });
    const password_hash = await bcrypt.hash(String(newPassword), 12);
    const { error } = await supabase.from("users").update({ password_hash }).eq("id", req.userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/delete-request — schedule account deletion for 24h later
router.post("/delete-request", authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    const { data: user } = await supabase.from("users").select("*").eq("id", req.userId).single();
    if (!user) return res.status(404).json({ error: "User not found" });
    const ok = await bcrypt.compare(String(password || ""), user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Invalid password" });
    const now = new Date();
    const scheduled = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    let result = await supabase
      .from("users")
      .update({ deletion_requested_at: now.toISOString(), deletion_scheduled_at: scheduled })
      .eq("id", req.userId)
      .select("*")
      .single();
    if (result.error && /deletion_|schema cache/i.test(result.error.message || "")) {
      const fallback = await supabase
        .from("account_deletion_requests")
        .upsert({ user_id: req.userId, requested_at: now.toISOString(), scheduled_at: scheduled }, { onConflict: "user_id" })
        .select("*")
        .single();
      if (fallback.error) return res.status(503).json({ error: "Run latest Supabase schema migration for account deletion", detail: fallback.error.message });
      return res.json(sanitize({ ...user, deletion_requested_at: now.toISOString(), deletion_scheduled_at: scheduled }));
    }
    if (result.error) return res.status(500).json({ error: result.error.message });
    res.json(sanitize(result.data));
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/delete-cancel — cancel scheduled deletion
router.post("/delete-cancel", authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    const { data: user } = await supabase.from("users").select("*").eq("id", req.userId).single();
    if (!user) return res.status(404).json({ error: "User not found" });
    const ok = await bcrypt.compare(String(password || ""), user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Invalid password" });
    let result = await supabase
      .from("users")
      .update({ deletion_requested_at: null, deletion_scheduled_at: null })
      .eq("id", req.userId)
      .select("*")
      .single();
    if (result.error && /deletion_|schema cache/i.test(result.error.message || "")) {
      await supabase.from("account_deletion_requests").delete().eq("user_id", req.userId);
      return res.json(sanitize({ ...user, deletion_requested_at: null, deletion_scheduled_at: null }));
    }
    if (result.error) return res.status(500).json({ error: result.error.message });
    await supabase.from("account_deletion_requests").delete().eq("user_id", req.userId);
    res.json(sanitize(result.data));
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/logout  (in production, blacklist the refresh token)
router.post("/logout", authMiddleware, async (_req, res) => {
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", req.userId)
      .single();
    if (!user) return res.status(404).json({ error: "Not found" });
    const activeUser = await finalizeDeletionIfDue(user);
    const userWithBan = await withActiveBan(activeUser);
    res.json(sanitize(userWithBan));
  } catch (err) {
    return authError(res, err);
  }
});

// Strip sensitive fields.
function sanitize(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

module.exports = { authRouter: router };
