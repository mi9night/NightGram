// Auth routes — register, login, refresh, logout, me
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { supabase } = require("../lib/supabase");
const { verifyRefreshToken } = require("../lib/jwt");
const {
  issueAuthTokens,
  validateRefreshSession,
  revokeSession,
  revokeOtherSessions,
  sessionTableMissing,
} = require("../lib/auth-sessions");
const { authMiddleware } = require("../middleware/auth");
const { clientIp, consumeRateLimitDistributed, rateLimitResponse, logSpamEvent } = require("../lib/safety");
const { getActivePunishments } = require("../lib/punishments");
const { logSecurityEvent, securityTableMissing, requestMeta } = require("../lib/security-events");
const {
  createBackupCodes,
  createChallenge,
  getChallenge,
  consumeChallenge,
  markInvalidAttempt,
  matchBackupCode,
  challengeTableMissing,
  generateTotpSecret,
  verifyTotpCode,
  encryptTotpSecret,
  decryptTotpSecret,
  buildOtpAuthUrl,
  consumeTotpCounter,
} = require("../lib/two-factor");

function authError(res, err) {
  const status = err?.statusCode || 500;
  const message = err?.message || "Auth error";
  console.error("[Auth]", message);
  return res.status(status).json({ error: message, ...(err?.code ? { code: err.code } : {}), ...(err?.trustedAt ? { trustedAt: err.trustedAt } : {}) });
}

async function safeAuthQuery(promise, fallback = { data: null, error: null }) {
  try {
    return await promise;
  } catch (error) {
    return { ...fallback, error };
  }
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 254);
}

function normalizeDisplayName(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
}

function validPassword(value) {
  const length = typeof value === 'string' ? value.length : 0;
  return length >= 8 && length <= 128;
}

function validUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username || "");
}

const TRUSTED_SESSION_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const TWO_FACTOR_RECOVERY_DELAY_MS = 24 * 60 * 60 * 1000;
const TWO_FACTOR_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function requireTrustedCurrentSession(userId, sessionId) {
  if (!sessionId) {
    const error = new Error("Войдите заново на этом устройстве, чтобы использовать восстановление 2FA");
    error.statusCode = 403;
    throw error;
  }
  const { data, error } = await supabase
    .from("auth_sessions")
    .select("id,created_at,last_seen_at,revoked_at,expires_at,device_name,ip_address")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (sessionTableMissing(error)) {
      const migration = new Error("Сначала выполните migration_auth_sessions.sql");
      migration.statusCode = 503;
      throw migration;
    }
    throw error;
  }
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
    const invalid = new Error("Текущая сессия больше не активна");
    invalid.statusCode = 403;
    throw invalid;
  }
  const trustedAt = new Date(data.created_at).getTime() + TRUSTED_SESSION_MIN_AGE_MS;
  if (trustedAt > Date.now()) {
    const wait = new Error("Это устройство станет доверенным через 24 часа после входа");
    wait.statusCode = 403;
    wait.code = "SESSION_NOT_TRUSTED_YET";
    wait.trustedAt = new Date(trustedAt).toISOString();
    throw wait;
  }
  return data;
}

function serializeRecovery(row, currentSessionId = null) {
  if (!row) return null;
  return {
    id: row.id,
    requestedAt: row.requested_at,
    availableAt: row.available_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at || null,
    cancelledAt: row.cancelled_at || null,
    ready: !row.completed_at && !row.cancelled_at && new Date(row.available_at).getTime() <= Date.now(),
    can_complete: Boolean(currentSessionId && row.session_id === currentSessionId),
  };
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
    const normalizedEmail = normalizeEmail(email);
    const cleanDisplayName = normalizeDisplayName(displayName || login || username);

    if (!cleanDisplayName || !username || !normalizedEmail || !password) return res.status(400).json({ error: "Missing fields" });
    if (!validUsername(username)) return res.status(400).json({ error: "Юзернейм: 3–24 символа, латиница, цифры и _" });
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return res.status(400).json({ error: 'Некорректная почта' });
    if (!validPassword(password)) return res.status(400).json({ error: 'Пароль должен содержать от 8 до 128 символов' });
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
    const tokens = await issueAuthTokens(data, req);
    await logSecurityEvent({ userId: data.id, eventType: "account_registered", req, sessionId: tokens.sessionId || null });
    res.json({ user: sanitize(userWithBan), ...tokens });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const ip = clientIp(req);
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const ipLimit = await consumeRateLimitDistributed(`auth:login:ip:${ip}`, { limit: 25, windowMs: 10 * 60 * 1000 });
    const accountLimit = await consumeRateLimitDistributed(`auth:login:account:${normalizedEmail || ip}`, { limit: 8, windowMs: 10 * 60 * 1000 });
    const limited = !ipLimit.allowed ? ipLimit : !accountLimit.allowed ? accountLimit : null;
    if (limited) {
      await logSpamEvent({ eventType: "login_rate_limited", targetType: "ip", targetId: ip, meta: { email: normalizedEmail, retryAfter: limited.retryAfter } });
      return rateLimitResponse(res, limited, "Слишком много попыток входа. Подожди и попробуй снова.");
    }
    if (!normalizedEmail || typeof password !== 'string' || password.length > 128) return res.status(400).json({ error: 'Missing credentials' });

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (!user.password_hash || typeof user.password_hash !== "string") {
      // Prevent Express async route from hanging if legacy rows have no password hash.
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let ok = false;
    try {
      ok = await bcrypt.compare(String(password), user.password_hash);
    } catch (err) {
      console.error("[Auth] bcrypt compare failed:", err.message);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!ok) {
      await logSecurityEvent({ userId: user.id, eventType: "login_failed", req, success: false, metadata: { reason: "invalid_password" } });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const activeUser = await finalizeDeletionIfDue(user);
    const userWithBan = await withActiveBan(activeUser);
    if (activeUser.two_factor_enabled && activeUser.two_factor_secret_encrypted) {
      const challenge = await createChallenge({ user: activeUser, req, purpose: "login" });
      return res.status(202).json({
        twoFactorRequired: true,
        method: "authenticator",
        challengeToken: challenge.challengeToken,
        expiresIn: challenge.expiresIn,
      });
    }
    const tokens = await issueAuthTokens(activeUser, req);
    await logSecurityEvent({ userId: activeUser.id, eventType: "login_success", req, sessionId: tokens.sessionId || null, metadata: { twoFactor: false } });
    res.json({ user: sanitize(userWithBan), ...tokens });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/2fa/verify-login — finish a password-authenticated login with TOTP or a backup code.
router.post("/2fa/verify-login", async (req, res) => {
  try {
    const ip = clientIp(req);
    const limited = await consumeRateLimitDistributed(`auth:2fa:verify:${ip}`, { limit: 15, windowMs: 10 * 60 * 1000 });
    if (!limited.allowed) return rateLimitResponse(res, limited, "Слишком много попыток двухэтапного входа.");

    const challenge = await getChallenge(req.body?.challengeToken);
    if (challenge.purpose !== "login") return res.status(400).json({ error: "Неверный тип подтверждения" });
    const { data: user, error } = await supabase.from("users").select("*").eq("id", challenge.user_id).maybeSingle();
    if (error) throw error;
    if (!user || !user.two_factor_enabled || !user.two_factor_secret_encrypted) return res.status(401).json({ error: "Двухэтапная защита отключена" });

    const submitted = String(req.body?.code || "").trim();
    const backupIndex = matchBackupCode(user.two_factor_backup_codes, submitted);
    if (backupIndex >= 0) {
      const nextCodes = [...(Array.isArray(user.two_factor_backup_codes) ? user.two_factor_backup_codes : [])];
      nextCodes.splice(backupIndex, 1);
      const { error: updateError } = await supabase.from("users").update({ two_factor_backup_codes: nextCodes }).eq("id", user.id);
      if (updateError) throw updateError;
      user.two_factor_backup_codes = nextCodes;
      await consumeChallenge(challenge.id);
    } else {
      const secret = decryptTotpSecret(user.two_factor_secret_encrypted);
      const counter = verifyTotpCode(secret, submitted, { lastCounter: Number(user.two_factor_last_counter ?? -1) });
      if (counter === null) {
        await logSecurityEvent({ userId: user.id, eventType: "two_factor_code_failed", req, success: false, metadata: { purpose: "login" } });
        await markInvalidAttempt(challenge);
      }
      await consumeTotpCounter(user.id, counter);
      await consumeChallenge(challenge.id);
    }

    const activeUser = await finalizeDeletionIfDue(user);
    const userWithBan = await withActiveBan(activeUser);
    const tokens = await issueAuthTokens(activeUser, req);
    await logSecurityEvent({ userId: activeUser.id, eventType: "login_success", req, sessionId: tokens.sessionId || null, metadata: { twoFactor: true, backupCodeUsed: backupIndex >= 0 } });
    res.json({ user: sanitize(userWithBan), ...tokens, backupCodeUsed: backupIndex >= 0 });
  } catch (err) {
    return authError(res, err);
  }
});

// Kept for compatibility with older clients. TOTP codes are generated in the app, so this only renews the login challenge.
router.post("/2fa/resend-login", async (req, res) => {
  try {
    const oldChallenge = await getChallenge(req.body?.challengeToken);
    if (oldChallenge.purpose !== "login") return res.status(400).json({ error: "Неверный тип подтверждения" });
    const { data: user, error } = await supabase.from("users").select("*").eq("id", oldChallenge.user_id).maybeSingle();
    if (error) throw error;
    if (!user || !user.two_factor_enabled) return res.status(401).json({ error: "Двухэтапная защита отключена" });
    await consumeChallenge(oldChallenge.id);
    const challenge = await createChallenge({ user, req, purpose: "login" });
    res.json({ twoFactorRequired: true, method: "authenticator", challengeToken: challenge.challengeToken, expiresIn: challenge.expiresIn });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/2fa/request — prepare authenticator setup or a protected security action.
router.post("/2fa/request", authMiddleware, async (req, res) => {
  try {
    const action = String(req.body?.action || "");
    if (!["enable", "disable", "regenerate"].includes(action)) return res.status(400).json({ error: "Invalid 2FA action" });
    const limited = await consumeRateLimitDistributed(`auth:2fa:action:${req.userId}`, { limit: 12, windowMs: 60 * 60 * 1000 });
    if (!limited.allowed) return rateLimitResponse(res, limited, "Слишком много запросов безопасности.");

    const { data: user, error } = await supabase.from("users").select("*").eq("id", req.userId).single();
    if (error) throw error;
    const ok = await bcrypt.compare(String(req.body?.password || ""), user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Invalid password" });
    if (action === "enable" && user.two_factor_enabled) return res.status(409).json({ error: "Двухэтапная защита уже включена" });
    if (action !== "enable" && !user.two_factor_enabled) return res.status(409).json({ error: "Двухэтапная защита не включена" });

    let pendingSecretEncrypted = null;
    let setup = null;
    if (action === "enable") {
      const secret = generateTotpSecret();
      pendingSecretEncrypted = encryptTotpSecret(secret);
      const accountLabel = user.username ? `@${user.username}` : user.email;
      setup = {
        issuer: "NightGram",
        accountLabel,
        secret,
        otpauthUrl: buildOtpAuthUrl({ secret, accountLabel, issuer: "NightGram" }),
      };
    }
    const challenge = await createChallenge({ user, req, purpose: action, pendingSecretEncrypted });
    res.json({ challengeToken: challenge.challengeToken, expiresIn: challenge.expiresIn, action, method: "authenticator", setup });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/2fa/confirm — apply enable/disable/regenerate after authenticator verification.
router.post("/2fa/confirm", authMiddleware, async (req, res) => {
  try {
    const challenge = await getChallenge(req.body?.challengeToken);
    if (challenge.user_id !== req.userId || !["enable", "disable", "regenerate"].includes(challenge.purpose)) {
      return res.status(403).json({ error: "Этот запрос не относится к текущему аккаунту" });
    }
    const { data: user, error: userError } = await supabase.from("users").select("*").eq("id", req.userId).single();
    if (userError) throw userError;
    const submitted = String(req.body?.code || "").trim();
    let usedBackupIndex = -1;
    let matchedCounter = null;
    let secretEncrypted = user.two_factor_secret_encrypted;

    if (challenge.purpose === "enable") {
      if (!challenge.pending_secret_encrypted) return res.status(410).json({ error: "Настройка истекла. Создайте новый QR-код." });
      secretEncrypted = challenge.pending_secret_encrypted;
      const secret = decryptTotpSecret(secretEncrypted);
      matchedCounter = verifyTotpCode(secret, submitted);
      if (matchedCounter === null) {
        await logSecurityEvent({ userId: req.userId, eventType: "two_factor_code_failed", req, sessionId: req.sessionId, success: false, metadata: { purpose: challenge.purpose } });
        await markInvalidAttempt(challenge);
      }
    } else {
      usedBackupIndex = matchBackupCode(user.two_factor_backup_codes, submitted);
      if (usedBackupIndex < 0) {
        if (!secretEncrypted) return res.status(409).json({ error: "Секрет приложения-аутентификатора отсутствует" });
        const secret = decryptTotpSecret(secretEncrypted);
        matchedCounter = verifyTotpCode(secret, submitted, { lastCounter: Number(user.two_factor_last_counter ?? -1) });
        if (matchedCounter === null) {
          await logSecurityEvent({ userId: req.userId, eventType: "two_factor_code_failed", req, sessionId: req.sessionId, success: false, metadata: { purpose: challenge.purpose } });
          await markInvalidAttempt(challenge);
        }
      }
    }

    const currentBackupHashes = [...(Array.isArray(user.two_factor_backup_codes) ? user.two_factor_backup_codes : [])];
    if (usedBackupIndex >= 0) currentBackupHashes.splice(usedBackupIndex, 1);
    let backupCodes = null;
    let enabled = challenge.purpose !== "disable";

    if (challenge.purpose === "enable") {
      const created = createBackupCodes(8);
      backupCodes = created.codes;
      const { error } = await supabase.from("users").update({
        two_factor_enabled: true,
        two_factor_secret_encrypted: secretEncrypted,
        two_factor_last_counter: matchedCounter,
        two_factor_backup_codes: created.hashes,
      }).eq("id", req.userId);
      if (error) throw error;
    } else if (challenge.purpose === "regenerate") {
      if (matchedCounter !== null) await consumeTotpCounter(req.userId, matchedCounter);
      const created = createBackupCodes(8);
      backupCodes = created.codes;
      const { error } = await supabase.from("users").update({ two_factor_backup_codes: created.hashes }).eq("id", req.userId);
      if (error) throw error;
    } else {
      if (matchedCounter !== null) await consumeTotpCounter(req.userId, matchedCounter);
      const { error } = await supabase.from("users").update({
        two_factor_enabled: false,
        two_factor_secret_encrypted: null,
        two_factor_last_counter: null,
        two_factor_backup_codes: [],
      }).eq("id", req.userId);
      if (error) throw error;
      await supabase.from("two_factor_recovery_requests")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("user_id", req.userId)
        .is("completed_at", null)
        .is("cancelled_at", null);
    }

    if (usedBackupIndex >= 0 && challenge.purpose !== "regenerate" && challenge.purpose !== "disable") {
      await supabase.from("users").update({ two_factor_backup_codes: currentBackupHashes }).eq("id", req.userId);
    }
    await consumeChallenge(challenge.id);
    await revokeOtherSessions(req.userId, req.sessionId || null);
    const eventType = challenge.purpose === "enable"
      ? "two_factor_enabled"
      : challenge.purpose === "disable"
        ? "two_factor_disabled"
        : "two_factor_backup_codes_regenerated";
    await logSecurityEvent({ userId: req.userId, eventType, req, sessionId: req.sessionId, metadata: { backupCodeUsed: usedBackupIndex >= 0 } });
    res.json({ ok: true, enabled, backupCodes, backupCodeUsed: usedBackupIndex >= 0 });
  } catch (err) {
    return authError(res, err);
  }
});

// GET /api/auth/2fa/recovery — show a pending trusted-device recovery request.
router.get("/2fa/recovery", authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("two_factor_recovery_requests")
      .select("*")
      .eq("user_id", req.userId)
      .is("completed_at", null)
      .is("cancelled_at", null)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (securityTableMissing(error)) return res.status(503).json({ error: "Сначала выполните migration_account_recovery_security_log.sql", code: "SECURITY_MIGRATION_REQUIRED" });
      throw error;
    }
    res.json({ recovery: serializeRecovery(data, req.sessionId || null) });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/2fa/recovery/request — delayed reset from an established authenticated device.
router.post("/2fa/recovery/request", authMiddleware, async (req, res) => {
  try {
    const limited = await consumeRateLimitDistributed(`auth:2fa:recovery:${req.userId}`, { limit: 3, windowMs: 24 * 60 * 60 * 1000 });
    if (!limited.allowed) return rateLimitResponse(res, limited, "Слишком много запросов восстановления.");
    const { data: user, error: userError } = await supabase.from("users").select("*").eq("id", req.userId).single();
    if (userError) throw userError;
    if (!user.two_factor_enabled) return res.status(409).json({ error: "Двухэтапная защита не включена" });
    const passwordOk = await bcrypt.compare(String(req.body?.password || ""), user.password_hash || "");
    if (!passwordOk) return res.status(401).json({ error: "Invalid password" });
    const trustedSession = await requireTrustedCurrentSession(req.userId, req.sessionId || null);
    const now = new Date();
    const availableAt = new Date(now.getTime() + TWO_FACTOR_RECOVERY_DELAY_MS).toISOString();
    const expiresAt = new Date(now.getTime() + TWO_FACTOR_RECOVERY_TTL_MS).toISOString();
    await supabase.from("two_factor_recovery_requests")
      .update({ cancelled_at: now.toISOString() })
      .eq("user_id", req.userId)
      .is("completed_at", null)
      .is("cancelled_at", null);
    const meta = requestMeta(req);
    const { data, error } = await supabase.from("two_factor_recovery_requests").insert({
      user_id: req.userId,
      session_id: trustedSession.id,
      requested_at: now.toISOString(),
      available_at: availableAt,
      expires_at: expiresAt,
      ip_address: meta.ip_address,
      device_name: trustedSession.device_name || meta.device_name,
    }).select("*").single();
    if (error) {
      if (securityTableMissing(error)) return res.status(503).json({ error: "Сначала выполните migration_account_recovery_security_log.sql", code: "SECURITY_MIGRATION_REQUIRED" });
      throw error;
    }
    await revokeOtherSessions(req.userId, req.sessionId || null);
    await logSecurityEvent({ userId: req.userId, eventType: "two_factor_recovery_requested", req, sessionId: req.sessionId, metadata: { availableAt } });
    res.json({ recovery: serializeRecovery(data, req.sessionId || null), otherSessionsRevoked: true });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/2fa/recovery/cancel — stop a pending reset.
router.post("/2fa/recovery/cancel", authMiddleware, async (req, res) => {
  try {
    const { data: user } = await supabase.from("users").select("password_hash").eq("id", req.userId).single();
    const passwordOk = await bcrypt.compare(String(req.body?.password || ""), user?.password_hash || "");
    if (!passwordOk) return res.status(401).json({ error: "Invalid password" });
    const { error } = await supabase.from("two_factor_recovery_requests")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("user_id", req.userId)
      .is("completed_at", null)
      .is("cancelled_at", null);
    if (error) {
      if (securityTableMissing(error)) return res.status(503).json({ error: "Сначала выполните migration_account_recovery_security_log.sql", code: "SECURITY_MIGRATION_REQUIRED" });
      throw error;
    }
    await logSecurityEvent({ userId: req.userId, eventType: "two_factor_recovery_cancelled", req, sessionId: req.sessionId });
    res.json({ ok: true });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/2fa/recovery/complete — disable TOTP after the cooling-off period.
router.post("/2fa/recovery/complete", authMiddleware, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabase.from("users").select("*").eq("id", req.userId).single();
    if (userError) throw userError;
    const passwordOk = await bcrypt.compare(String(req.body?.password || ""), user.password_hash || "");
    if (!passwordOk) return res.status(401).json({ error: "Invalid password" });
    await requireTrustedCurrentSession(req.userId, req.sessionId || null);
    const { data: recovery, error } = await supabase.from("two_factor_recovery_requests")
      .select("*")
      .eq("user_id", req.userId)
      .eq("session_id", req.sessionId || "00000000-0000-0000-0000-000000000000")
      .is("completed_at", null)
      .is("cancelled_at", null)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (securityTableMissing(error)) return res.status(503).json({ error: "Сначала выполните migration_account_recovery_security_log.sql", code: "SECURITY_MIGRATION_REQUIRED" });
      throw error;
    }
    if (!recovery) return res.status(404).json({ error: "Активный запрос восстановления не найден" });
    if (new Date(recovery.expires_at).getTime() <= Date.now()) return res.status(410).json({ error: "Запрос восстановления истёк" });
    if (new Date(recovery.available_at).getTime() > Date.now()) return res.status(409).json({ error: "Период ожидания ещё не завершён", availableAt: recovery.available_at });
    const completedAt = new Date().toISOString();
    const { error: updateError } = await supabase.from("users").update({
      two_factor_enabled: false,
      two_factor_secret_encrypted: null,
      two_factor_last_counter: null,
      two_factor_backup_codes: [],
    }).eq("id", req.userId);
    if (updateError) throw updateError;
    await supabase.from("two_factor_recovery_requests").update({ completed_at: completedAt }).eq("id", recovery.id);
    await revokeOtherSessions(req.userId, req.sessionId || null);
    await logSecurityEvent({ userId: req.userId, eventType: "two_factor_recovery_completed", req, sessionId: req.sessionId });
    res.json({ ok: true, enabled: false });
  } catch (err) {
    return authError(res, err);
  }
});


// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken !== 'string' || refreshToken.length > 4096) return res.status(401).json({ error: 'Invalid refresh token' });
  try {
    const payload = verifyRefreshToken(refreshToken);
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", payload.sub)
      .single();
    if (!user) return res.status(401).json({ error: "User not found" });
    const activeUser = await finalizeDeletionIfDue(user);
    const session = await validateRefreshSession(activeUser.id, payload.sid || null, refreshToken);
    if (session.valid === false) return res.status(401).json({ error: "Session revoked" });
    const tokens = await issueAuthTokens(activeUser, req, session.sessionId || null);
    res.json(tokens);
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
    const normalized = normalizeEmail(email);
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
    await logSecurityEvent({ userId: req.userId, eventType: "email_changed", req, sessionId: req.sessionId, metadata: { newEmail: normalized } });
    res.json(sanitize(data));
  } catch (err) {
    return authError(res, err);
  }
});

// PATCH /api/auth/password — change password after password confirmation
router.patch("/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || !validPassword(newPassword)) {
      return res.status(400).json({ error: "Password fields invalid" });
    }
    const { data: user } = await supabase.from("users").select("*").eq("id", req.userId).single();
    if (!user) return res.status(404).json({ error: "User not found" });
    const ok = await bcrypt.compare(String(currentPassword), user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Invalid password" });
    const password_hash = await bcrypt.hash(String(newPassword), 12);
    const { error } = await supabase.from("users").update({ password_hash }).eq("id", req.userId);
    if (error) return res.status(500).json({ error: error.message });
    await revokeOtherSessions(req.userId, req.sessionId || null);
    const tokens = await issueAuthTokens(user, req, req.sessionId || null);
    await logSecurityEvent({ userId: req.userId, eventType: "password_changed", req, sessionId: req.sessionId });
    res.json({ ok: true, otherSessionsRevoked: true, ...tokens });
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
      await logSecurityEvent({ userId: req.userId, eventType: "account_deletion_requested", req, sessionId: req.sessionId, metadata: { scheduledAt: scheduled } });
      return res.json(sanitize({ ...user, deletion_requested_at: now.toISOString(), deletion_scheduled_at: scheduled }));
    }
    if (result.error) return res.status(500).json({ error: result.error.message });
    await logSecurityEvent({ userId: req.userId, eventType: "account_deletion_requested", req, sessionId: req.sessionId, metadata: { scheduledAt: scheduled } });
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
      await logSecurityEvent({ userId: req.userId, eventType: "account_deletion_cancelled", req, sessionId: req.sessionId });
      return res.json(sanitize({ ...user, deletion_requested_at: null, deletion_scheduled_at: null }));
    }
    if (result.error) return res.status(500).json({ error: result.error.message });
    await supabase.from("account_deletion_requests").delete().eq("user_id", req.userId);
    await logSecurityEvent({ userId: req.userId, eventType: "account_deletion_cancelled", req, sessionId: req.sessionId });
    res.json(sanitize(result.data));
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/logout — revoke the current refresh session.
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    let sessionId = req.sessionId || null;
    if (typeof refreshToken === "string" && refreshToken.length <= 4096) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        if (payload.sub === req.userId && payload.sid) sessionId = payload.sid;
      } catch { /* access token session id remains the fallback */ }
    }
    if (sessionId) await revokeSession(req.userId, sessionId);
    res.json({ ok: true });
  } catch (err) {
    return authError(res, err);
  }
});

// GET /api/auth/sessions — active devices for the current account.
router.get("/sessions", authMiddleware, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("auth_sessions")
      .select("id,device_name,platform,ip_address,created_at,last_seen_at,expires_at,revoked_at")
      .eq("user_id", req.userId)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .order("last_seen_at", { ascending: false });
    if (error) {
      if (sessionTableMissing(error)) return res.status(503).json({ error: "Run migration_auth_sessions.sql", code: "AUTH_SESSIONS_MIGRATION_REQUIRED" });
      throw error;
    }
    res.json((data || []).map((row) => ({ ...row, current: row.id === req.sessionId })));
  } catch (err) {
    return authError(res, err);
  }
});

// DELETE /api/auth/sessions/:id — terminate one device.
router.delete("/sessions/:id", authMiddleware, async (req, res) => {
  try {
    const sessionId = String(req.params.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return res.status(400).json({ error: "Invalid session" });
    const { data, error } = await supabase
      .from("auth_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", req.userId)
      .maybeSingle();
    if (error) {
      if (sessionTableMissing(error)) return res.status(503).json({ error: "Run migration_auth_sessions.sql", code: "AUTH_SESSIONS_MIGRATION_REQUIRED" });
      throw error;
    }
    if (!data) return res.status(404).json({ error: "Session not found" });
    await revokeSession(req.userId, sessionId);
    await logSecurityEvent({ userId: req.userId, eventType: "session_revoked", req, sessionId: req.sessionId, metadata: { revokedSessionId: sessionId, current: sessionId === req.sessionId } });
    res.json({ ok: true, current: sessionId === req.sessionId });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/sessions/revoke-others — keep only this device.
router.post("/sessions/revoke-others", authMiddleware, async (req, res) => {
  try {
    await revokeOtherSessions(req.userId, req.sessionId || null);
    await logSecurityEvent({ userId: req.userId, eventType: "other_sessions_revoked", req, sessionId: req.sessionId });
    res.json({ ok: true });
  } catch (err) {
    return authError(res, err);
  }
});

// POST /api/auth/export — export the current user's own NightGram data as JSON.
router.post("/export", authMiddleware, async (req, res) => {
  try {
    const limited = await consumeRateLimitDistributed(`auth:export:${req.userId}`, { limit: 2, windowMs: 24 * 60 * 60 * 1000 });
    if (!limited.allowed) return rateLimitResponse(res, limited, "Экспорт можно создавать не чаще двух раз в сутки.");
    const { data: user, error: userError } = await supabase.from("users").select("*").eq("id", req.userId).single();
    if (userError || !user) return res.status(404).json({ error: "User not found" });
    const passwordOk = await bcrypt.compare(String(req.body?.password || ""), user.password_hash || "");
    if (!passwordOk) return res.status(401).json({ error: "Invalid password" });

    const [sessions, memberships, messages, posts, comments, followers, following, securityEvents] = await Promise.all([
      safeAuthQuery(supabase.from("auth_sessions").select("id,device_name,platform,ip_address,created_at,last_seen_at,expires_at,revoked_at").eq("user_id", req.userId).order("created_at", { ascending: false }).limit(500), { data: [], error: null }),
      safeAuthQuery(supabase.from("conversation_participants").select("*").eq("user_id", req.userId).limit(5000), { data: [], error: null }),
      safeAuthQuery(supabase.from("messages").select("*").eq("sender_id", req.userId).order("created_at", { ascending: true }).limit(50000), { data: [], error: null }),
      safeAuthQuery(supabase.from("posts").select("*").eq("author_user_id", req.userId).order("created_at", { ascending: true }).limit(10000), { data: [], error: null }),
      safeAuthQuery(supabase.from("comments").select("*").eq("author_id", req.userId).order("created_at", { ascending: true }).limit(20000), { data: [], error: null }),
      safeAuthQuery(supabase.from("follows").select("*").eq("following_id", req.userId).limit(20000), { data: [], error: null }),
      safeAuthQuery(supabase.from("follows").select("*").eq("follower_id", req.userId).limit(20000), { data: [], error: null }),
      safeAuthQuery(supabase.from("auth_security_events").select("event_type,success,ip_address,device_name,platform,metadata,created_at").eq("user_id", req.userId).order("created_at", { ascending: true }).limit(10000), { data: [], error: null }),
    ]);

    const exportedAt = new Date().toISOString();
    await logSecurityEvent({ userId: req.userId, eventType: "data_exported", req, sessionId: req.sessionId });
    res.setHeader("Content-Disposition", `attachment; filename=nightgram-export-${req.userId}-${exportedAt.slice(0, 10)}.json`);
    res.json({
      format: "nightgram-account-export",
      version: 1,
      exportedAt,
      limits: { messages: 50000, posts: 10000, comments: 20000, relationships: 20000 },
      account: sanitize(user),
      sessions: sessions.data || [],
      conversationMemberships: memberships.data || [],
      messagesSent: messages.data || [],
      posts: posts.data || [],
      comments: comments.data || [],
      followers: followers.data || [],
      following: following.data || [],
      securityEvents: securityEvents.data || [],
    });
  } catch (err) {
    return authError(res, err);
  }
});

// GET /api/auth/security-events — recent account security activity.
router.get("/security-events", authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 40)));
    const { data, error } = await supabase
      .from("auth_security_events")
      .select("id,event_type,success,ip_address,device_name,platform,metadata,created_at")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      if (securityTableMissing(error)) return res.status(503).json({ error: "Сначала выполните migration_account_recovery_security_log.sql", code: "SECURITY_MIGRATION_REQUIRED" });
      throw error;
    }
    res.json(data || []);
  } catch (err) {
    return authError(res, err);
  }
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
  if (!u || typeof u !== 'object') return u;
  const { password_hash, two_factor_backup_codes, two_factor_secret_encrypted, two_factor_last_counter, ...rest } = u;
  return {
    ...rest,
    two_factor_backup_codes_remaining: Array.isArray(two_factor_backup_codes) ? two_factor_backup_codes.length : 0,
  };
}

module.exports = { authRouter: router };
