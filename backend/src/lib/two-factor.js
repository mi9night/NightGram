const crypto = require("crypto");
const { supabase } = require("./supabase");
const { clientIp } = require("./safety");

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeBackupCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function makeBackupCode() {
  let raw = "";
  for (let index = 0; index < 10; index += 1) raw += BACKUP_ALPHABET[crypto.randomInt(0, BACKUP_ALPHABET.length)];
  return `NG-${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function createBackupCodes(count = 8) {
  const codes = Array.from({ length: count }, () => makeBackupCode());
  return { codes, hashes: codes.map((code) => sha256(normalizeBackupCode(code))) };
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const clean = String(input || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, "0");
}

function totpCounter(timestampMs = Date.now()) {
  return Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
}

function verifyTotpCode(secret, code, { now = Date.now(), window = TOTP_WINDOW, lastCounter = -1 } = {}) {
  const normalized = String(code || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const current = totpCounter(now);
  for (let delta = -window; delta <= window; delta += 1) {
    const counter = current + delta;
    if (counter <= Number(lastCounter ?? -1)) continue;
    if (secureEqual(hotp(secret, counter), normalized)) return counter;
  }
  return null;
}

function encryptionKey() {
  const source = String(
    process.env.TWO_FACTOR_ENCRYPTION_KEY
      || process.env.JWT_REFRESH_SECRET
      || process.env.JWT_SECRET
      || "",
  );
  if (!source) throw challengeError("Не настроен ключ шифрования 2FA", 503, "TWO_FACTOR_KEY_NOT_CONFIGURED");
  return crypto.createHash("sha256").update(`nightgram-totp:${source}`).digest();
}

function encryptTotpSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptTotpSecret(payload) {
  const [version, ivRaw, tagRaw, dataRaw] = String(payload || "").split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !dataRaw) throw challengeError("Повреждена конфигурация 2FA", 500, "TWO_FACTOR_SECRET_INVALID");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString("utf8");
}

function buildOtpAuthUrl({ secret, accountLabel, issuer = "NightGram" }) {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

function challengeTableMissing(error) {
  const message = String(error?.message || error || "");
  return /auth_two_factor_challenges|two_factor_|relation .* does not exist|schema cache/i.test(message);
}

function challengeError(message, statusCode = 400, code = "TWO_FACTOR_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function createChallenge({ user, req, purpose, pendingSecretEncrypted = null }) {
  const challengeToken = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();

  await supabase.from("auth_two_factor_challenges").delete().lt("expires_at", now.toISOString());
  await supabase.from("auth_two_factor_challenges").update({ consumed_at: now.toISOString() })
    .eq("user_id", user.id).eq("purpose", purpose).is("consumed_at", null);

  const { error } = await supabase.from("auth_two_factor_challenges").insert({
    user_id: user.id,
    purpose,
    token_hash: sha256(challengeToken),
    code_hash: sha256(crypto.randomBytes(32)),
    email: user.email || "authenticator@nightgram.local",
    attempts: 0,
    expires_at: expiresAt,
    ip_address: clientIp(req) || null,
    device_name: String(req.headers["x-nightgram-device-name"] || req.headers["user-agent"] || "").slice(0, 240) || null,
    pending_secret_encrypted: pendingSecretEncrypted,
  });
  if (error) {
    if (challengeTableMissing(error)) throw challengeError("Сначала выполните migration_authenticator_two_factor.sql", 503, "TWO_FACTOR_MIGRATION_REQUIRED");
    throw error;
  }
  return { challengeToken, expiresIn: Math.floor(CHALLENGE_TTL_MS / 1000) };
}

async function getChallenge(challengeToken) {
  const token = String(challengeToken || "");
  if (token.length < 32 || token.length > 256) throw challengeError("Некорректный запрос подтверждения", 400, "TWO_FACTOR_INVALID_CHALLENGE");
  const { data, error } = await supabase.from("auth_two_factor_challenges").select("*").eq("token_hash", sha256(token)).maybeSingle();
  if (error) {
    if (challengeTableMissing(error)) throw challengeError("Сначала выполните migration_authenticator_two_factor.sql", 503, "TWO_FACTOR_MIGRATION_REQUIRED");
    throw error;
  }
  if (!data || data.consumed_at || new Date(data.expires_at).getTime() <= Date.now()) {
    throw challengeError("Запрос подтверждения истёк. Введите пароль ещё раз.", 401, "TWO_FACTOR_CHALLENGE_EXPIRED");
  }
  if (Number(data.attempts || 0) >= MAX_ATTEMPTS) throw challengeError("Слишком много неверных попыток. Начните заново.", 429, "TWO_FACTOR_ATTEMPTS_EXCEEDED");
  return data;
}

async function consumeChallenge(id) {
  await supabase.from("auth_two_factor_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", id).is("consumed_at", null);
}

async function markInvalidAttempt(challenge) {
  const attempts = Number(challenge.attempts || 0) + 1;
  await supabase.from("auth_two_factor_challenges")
    .update({ attempts, ...(attempts >= MAX_ATTEMPTS ? { consumed_at: new Date().toISOString() } : {}) })
    .eq("id", challenge.id);
  throw challengeError(
    attempts >= MAX_ATTEMPTS ? "Слишком много неверных попыток. Начните заново." : "Неверный код из приложения-аутентификатора",
    attempts >= MAX_ATTEMPTS ? 429 : 401,
    attempts >= MAX_ATTEMPTS ? "TWO_FACTOR_ATTEMPTS_EXCEEDED" : "TWO_FACTOR_INVALID_CODE",
  );
}

async function consumeTotpCounter(userId, counter) {
  const { data, error } = await supabase.rpc("consume_two_factor_counter", { p_user_id: userId, p_counter: counter });
  if (error) {
    if (challengeTableMissing(error) || /consume_two_factor_counter/i.test(String(error.message || ""))) {
      throw challengeError("Сначала выполните migration_authenticator_two_factor.sql", 503, "TWO_FACTOR_MIGRATION_REQUIRED");
    }
    throw error;
  }
  if (data !== true) throw challengeError("Этот временный код уже использован. Дождитесь нового кода.", 409, "TWO_FACTOR_CODE_REUSED");
}

function matchBackupCode(hashes, code) {
  const normalized = normalizeBackupCode(code);
  if (!/^NG[A-Z0-9]{10}$/.test(normalized)) return -1;
  const candidate = sha256(normalized);
  return (Array.isArray(hashes) ? hashes : []).findIndex((stored) => secureEqual(stored, candidate));
}

module.exports = {
  challengeError,
  challengeTableMissing,
  createBackupCodes,
  createChallenge,
  getChallenge,
  consumeChallenge,
  markInvalidAttempt,
  matchBackupCode,
  normalizeBackupCode,
  generateTotpSecret,
  verifyTotpCode,
  encryptTotpSecret,
  decryptTotpSecret,
  buildOtpAuthUrl,
  consumeTotpCounter,
};
