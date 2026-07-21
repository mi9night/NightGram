const crypto = require("crypto");
const { supabase } = require("./supabase");
const { signAccessToken, signRefreshToken } = require("./jwt");
const { clientIp } = require("./safety");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function ttlToMs(value, fallback = 7 * 24 * 60 * 60 * 1000) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(60_000, value);
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return Math.max(60_000, Math.round(amount * multipliers[unit]));
}

function sessionTableMissing(error) {
  const message = String(error?.message || error || "");
  return /auth_sessions|relation .* does not exist|schema cache/i.test(message);
}

function cleanHeader(value, max = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function platformFromUserAgent(userAgent, hintedPlatform) {
  const hint = cleanHeader(hintedPlatform, 64).toLowerCase();
  if (hint) return hint;
  const ua = String(userAgent || "").toLowerCase();
  if (ua.includes("windows")) return ua.includes("electron") ? "windows-desktop" : "windows-web";
  if (ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (ua.includes("mac os")) return ua.includes("electron") ? "macos-desktop" : "macos-web";
  if (ua.includes("linux")) return ua.includes("electron") ? "linux-desktop" : "linux-web";
  return "unknown";
}

function browserFromUserAgent(userAgent) {
  const ua = String(userAgent || "");
  if (/NightGram/i.test(ua) || /Electron/i.test(ua)) return "NightGram для компьютера";
  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Google Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Браузер";
}

function osFromUserAgent(userAgent) {
  const ua = String(userAgent || "");
  if (/Windows NT 10/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone / iPad";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Неизвестная система";
}

function sessionMeta(req) {
  const userAgent = cleanHeader(req.headers["user-agent"], 500);
  const explicitName = cleanHeader(req.headers["x-nightgram-device-name"], 120);
  const platform = platformFromUserAgent(userAgent, req.headers["x-nightgram-platform"]);
  const deviceName = explicitName || `${browserFromUserAgent(userAgent)} · ${osFromUserAgent(userAgent)}`;
  return {
    device_name: deviceName,
    platform,
    user_agent: userAgent || null,
    ip_address: cleanHeader(clientIp(req), 96) || null,
  };
}

async function issueAuthTokens(user, req, existingSessionId = null) {
  const sessionId = existingSessionId || crypto.randomUUID();
  const accessToken = signAccessToken(user, sessionId);
  const refreshToken = signRefreshToken(user, sessionId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlToMs(process.env.REFRESH_TOKEN_TTL || "7d")).toISOString();
  const meta = sessionMeta(req);
  const payload = {
    id: sessionId,
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    ...meta,
    last_seen_at: now.toISOString(),
    expires_at: expiresAt,
    revoked_at: null,
  };

  const { id: _id, user_id: _userId, ...updatePayload } = payload;
  const result = existingSessionId
    ? await supabase.from("auth_sessions").update(updatePayload).eq("id", sessionId).eq("user_id", user.id)
    : await supabase.from("auth_sessions").insert({ ...payload, created_at: now.toISOString() });

  if (result.error) {
    if (!sessionTableMissing(result.error)) throw result.error;
    // Backward compatibility until migration_auth_sessions.sql is applied.
    return {
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
      sessionTracking: false,
    };
  }

  // Keep the table compact without a separate cron job.
  await supabase.from("auth_sessions").delete().eq("user_id", user.id).lt("expires_at", now.toISOString());
  return { accessToken, refreshToken, sessionTracking: true, sessionId };
}

async function validateRefreshSession(userId, sessionId, refreshToken) {
  if (!sessionId) return { legacy: true };
  const { data, error } = await supabase
    .from("auth_sessions")
    .select("id,user_id,token_hash,expires_at,revoked_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (sessionTableMissing(error)) return { legacy: true };
    throw error;
  }
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return { valid: false };
  const expected = Buffer.from(String(data.token_hash || ""));
  const actual = Buffer.from(hashToken(refreshToken));
  const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  return { valid, sessionId: data.id };
}

async function revokeSession(userId, sessionId) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("auth_sessions")
    .update({ revoked_at: now })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error && !sessionTableMissing(error)) throw error;
}

async function revokeOtherSessions(userId, currentSessionId = null) {
  let query = supabase
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (currentSessionId) query = query.neq("id", currentSessionId);
  const { error } = await query;
  if (error && !sessionTableMissing(error)) throw error;
}

module.exports = {
  hashToken,
  issueAuthTokens,
  validateRefreshSession,
  revokeSession,
  revokeOtherSessions,
  sessionTableMissing,
};
