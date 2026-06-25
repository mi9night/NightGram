// =============================================================================
//  NightGram Safety — soft rate limits, duplicate detection and spam logs
//  In-memory limiter is fast and safe; Supabase logging is best-effort.
// =============================================================================

const crypto = require("crypto");
const { supabase } = require("./supabase");
const rateLimitStore = require("./rateLimitStore");

const buckets = new Map();
const fingerprints = new Map();
const trustCache = new Map();
const domainRulesCache = { value: null, expiresAt: 0 };

const BLOCKED_LINK_HOSTS = new Set([
  "bit.ly-nightgram-login.example",
  "nightgram-free-coins.example",
]);
const SUSPICIOUS_TLDS = new Set(["zip", "mov", "click", "top", "rest", "cam", "quest"]);
const RISKY_LINK_KEYWORDS = ["free nitro", "free coins", "giveaway", "airdrop", "seed phrase", "wallet connect", "login verify", "nightcoins free"];

function nowMs() {
  return Date.now();
}

function seconds(ms) {
  return Math.max(1, Math.ceil(ms / 1000));
}

function clientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
}

function cleanup(map, limit = 5000) {
  if (map.size < limit) return;
  const now = nowMs();
  for (const [key, value] of map.entries()) {
    if ((value.resetAt || value.expiresAt || 0) <= now) map.delete(key);
  }
}

async function consumeRateLimitDistributed(key, { limit, windowMs, cost = 1 } = {}) {
  return rateLimitStore.consume(key, { limit, windowMs, cost });
}

function consumeRateLimit(key, { limit, windowMs, cost = 1 } = {}) {
  cleanup(buckets);
  const now = nowMs();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const bucket = { count: cost, resetAt: now + windowMs };
    buckets.set(key, bucket);
    return { allowed: true, remaining: Math.max(0, limit - cost), retryAfter: 0, resetAt: bucket.resetAt };
  }

  if (existing.count + cost > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: seconds(existing.resetAt - now),
      resetAt: existing.resetAt,
    };
  }

  existing.count += cost;
  buckets.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfter: 0,
    resetAt: existing.resetAt,
  };
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 800);
}

function fingerprint(value) {
  return crypto.createHash("sha1").update(normalizeText(value)).digest("hex");
}

function extractLinks(value) {
  return String(value || "").match(/https?:\/\/\S+/gi) || [];
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function assessLinks(text) {
  const links = extractLinks(text);
  const normalized = normalizeText(text);
  const domains = links.map(hostnameFromUrl).filter(Boolean);
  const blocked = domains.filter((domain) => BLOCKED_LINK_HOSTS.has(domain));
  const suspicious = domains.filter((domain) => {
    const tld = domain.split(".").pop();
    return SUSPICIOUS_TLDS.has(tld) || /xn--/.test(domain) || domain.split(".").length > 4;
  });
  const keywordHits = RISKY_LINK_KEYWORDS.filter((keyword) => normalized.includes(keyword));
  const score = blocked.length * 100 + suspicious.length * 20 + keywordHits.length * 15 + Math.max(0, links.length - 3) * 8;
  return { links, domains, blocked, suspicious, keywordHits, score };
}


function normalizeDomain(domain) {
  return String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .slice(0, 180);
}

async function getDomainRules() {
  if (domainRulesCache.value && domainRulesCache.expiresAt > nowMs()) return domainRulesCache.value;
  const { data, error } = await safeQuery(
    supabase.from("safety_domains").select("domain,action,reason"),
    [],
  );
  const allow = new Set();
  const deny = new Map();
  if (!error) {
    for (const row of data || []) {
      const domain = normalizeDomain(row.domain);
      if (!domain) continue;
      if (row.action === "allow") allow.add(domain);
      if (row.action === "deny") deny.set(domain, row.reason || "blocked");
    }
  }
  const value = { allow, deny };
  domainRulesCache.value = value;
  domainRulesCache.expiresAt = nowMs() + 60_000;
  return value;
}

async function assessLinksWithRules(text) {
  const base = assessLinks(text);
  const rules = await getDomainRules();
  const allowedDomains = base.domains.filter((domain) => rules.allow.has(domain));
  const deniedDomains = base.domains.filter((domain) => rules.deny.has(domain));
  const blocked = [...new Set([...base.blocked, ...deniedDomains])];
  const suspicious = base.suspicious.filter((domain) => !rules.allow.has(domain));
  const score = blocked.length * 100 + suspicious.length * 20 + base.keywordHits.length * 15 + Math.max(0, base.links.length - 3) * 8;
  return { ...base, allowedDomains, blocked, suspicious, score, domainRules: { denied: deniedDomains, allowed: allowedDomains } };
}

function checkDuplicate(key, value, { limit = 4, windowMs = 10 * 60 * 1000 } = {}) {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length < 8) return { allowed: true, count: 0, retryAfter: 0, fingerprint: null };
  cleanup(fingerprints);
  const fp = fingerprint(normalized);
  const fullKey = `${key}:${fp}`;
  const now = nowMs();
  const existing = fingerprints.get(fullKey);
  if (!existing || existing.expiresAt <= now) {
    fingerprints.set(fullKey, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, count: 1, retryAfter: 0, fingerprint: fp };
  }
  existing.count += 1;
  fingerprints.set(fullKey, existing);
  if (existing.count > limit) {
    return { allowed: false, count: existing.count, retryAfter: seconds(existing.expiresAt - now), fingerprint: fp };
  }
  return { allowed: true, count: existing.count, retryAfter: 0, fingerprint: fp };
}

function rateLimitResponse(res, result, message = "Слишком много действий. Подожди немного.") {
  res.setHeader("Retry-After", String(result.retryAfter || 1));
  return res.status(429).json({
    error: "rate_limited",
    message,
    retryAfter: result.retryAfter || 1,
  });
}

function socketRateLimitAck(ack, result, message = "Слишком много действий. Подожди немного.") {
  ack?.({ error: "rate_limited", message, retryAfter: result.retryAfter || 1 });
}

async function logSpamEvent({ userId = null, eventType, targetType = null, targetId = null, fingerprint: fp = null, meta = {} }) {
  try {
    await supabase.from("spam_events").insert({
      user_id: userId,
      event_type: eventType,
      target_type: targetType,
      target_id: targetId ? String(targetId) : null,
      fingerprint: fp,
      meta,
    });
    if (userId) await maybeAutoRestrictByEvents(userId, eventType);
  } catch {
    // Migration may not be installed yet; never break the main action because of logging.
  }
}

async function notifySafetyUser(userId, title, body) {
  if (!userId) return;
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "system",
      title,
      body,
      read: false,
    });
  } catch {
    // optional; do not block moderation actions
  }
}

async function applySafetyRestriction({ userId, restrictions = {}, hours = 2, reason = "Safety restriction", trustOverride = "restricted" }) {
  if (!userId) return { ok: false };
  const until = new Date(Date.now() + Math.max(1, Number(hours) || 1) * 60 * 60 * 1000).toISOString();
  let current = await safeQuery(
    supabase.from("users").select("safety_restrictions").eq("id", userId).maybeSingle(),
    null,
  );
  if (current.error && /safety_|schema cache/i.test(current.error.message || "")) return { ok: false, missing: true };
  const merged = {
    ...((current.data?.safety_restrictions && typeof current.data.safety_restrictions === "object") ? current.data.safety_restrictions : {}),
    ...restrictions,
  };
  const result = await safeQuery(
    supabase.from("users").update({
      safety_restrictions: merged,
      safety_restricted_until: until,
      safety_trust_override: trustOverride,
    }).eq("id", userId),
    null,
  );
  if (result.error) return { ok: false, error: result.error };
  clearTrustCache(userId);
  await notifySafetyUser(
    userId,
    "Ограничение безопасности",
    `${reason}. Ограничение активно до ${new Date(until).toLocaleString("ru-RU")}.`,
  );
  return { ok: true, restrictions: merged, restrictedUntil: until };
}

async function maybeAutoRestrictByEvents(userId, eventType) {
  if (!userId) return;
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: events, error } = await safeQuery(
    supabase.from("spam_events").select("id,event_type").eq("user_id", userId).gte("created_at", since1h).limit(40),
    [],
  );
  if (error) return;
  const count = (events || []).length;
  const linkEvents = (events || []).filter((event) => String(event.event_type || "").includes("link")).length;
  if (count >= 25) {
    await applySafetyRestriction({
      userId,
      restrictions: { messagingDisabled: true, noLinks: true, noUnknownDm: true },
      hours: 6,
      reason: "Обнаружена массовая подозрительная активность",
    });
  } else if (count >= 12 || linkEvents >= 6 || String(eventType || "").includes("blocked_")) {
    await applySafetyRestriction({
      userId,
      restrictions: { noLinks: true, noUnknownDm: true },
      hours: 2,
      reason: "Включён временный антиспам-режим",
    });
  }
}

async function createModerationFlag({ userId, type, severity = 1, reason, meta = {} }) {
  try {
    await supabase.from("moderation_flags").insert({
      user_id: userId,
      type,
      severity,
      reason,
      meta,
      status: "open",
    });
    if (userId && Number(severity) >= 4) {
      await applySafetyRestriction({
        userId,
        restrictions: { noLinks: true, noUnknownDm: true },
        hours: 24,
        reason: reason || "Высокий риск безопасности",
      });
    } else if (userId && Number(severity) >= 3) {
      await applySafetyRestriction({
        userId,
        restrictions: { noLinks: true },
        hours: 6,
        reason: reason || "Подозрительная активность",
      });
    }
  } catch {
    // optional migration
  }
}

async function safeQuery(promise, fallback = null) {
  try {
    const result = await promise;
    if (result?.error) return { data: fallback, error: result.error };
    return result;
  } catch (error) {
    return { data: fallback, error };
  }
}

async function getTrustProfile(userId) {
  if (!userId) return { score: 25, level: "unknown", ageDays: 0, isStaff: false, isPremium: false };
  const cached = trustCache.get(userId);
  if (cached && cached.expiresAt > nowMs()) return cached.value;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let userResult = await safeQuery(
    supabase
      .from("users")
      .select("id,created_at,is_premium,premium_until,avatar_url,followers_count,role,email,safety_trust_override,safety_restrictions,safety_restricted_until")
      .eq("id", userId)
      .maybeSingle(),
    null,
  );
  if (userResult.error && /safety_|schema cache/i.test(userResult.error.message || "")) {
    userResult = await safeQuery(
      supabase.from("users").select("id,created_at,is_premium,premium_until,avatar_url,followers_count,role,email").eq("id", userId).maybeSingle(),
      null,
    );
  }
  const [{ data: events }, { data: flags }] = await Promise.all([
    safeQuery(supabase.from("spam_events").select("id").eq("user_id", userId).gte("created_at", since24h).limit(60), []),
    safeQuery(supabase.from("moderation_flags").select("id,severity").eq("user_id", userId).eq("status", "open").limit(30), []),
  ]);
  const user = userResult.data;

  const role = user?.role || "user";
  const isStaff = ["moderator", "admin", "support", "co_owner", "owner"].includes(role);
  const premiumActive = Boolean(user?.is_premium && (!user?.premium_until || new Date(user.premium_until).getTime() > Date.now()));
  const ageDays = user?.created_at ? Math.max(0, Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86_400_000)) : 0;
  const flagPenalty = (flags || []).reduce((sum, flag) => sum + Math.max(1, Number(flag.severity || 1)) * 8, 0);
  const eventPenalty = Math.min(35, (events || []).length * 3);

  let score = 42;
  score += Math.min(20, ageDays * 2);
  if (premiumActive) score += 12;
  if (user?.avatar_url) score += 6;
  if ((user?.followers_count || 0) >= 10) score += 5;
  if ((user?.followers_count || 0) >= 100) score += 8;
  if (isStaff) score += 35;
  score -= flagPenalty + eventPenalty;
  score = Math.max(0, Math.min(100, score));

  const restrictedUntil = user?.safety_restricted_until || null;
  const restrictionActive = Boolean(restrictedUntil && new Date(restrictedUntil).getTime() > Date.now());
  const restrictions = restrictionActive && user?.safety_restrictions && typeof user.safety_restrictions === "object"
    ? user.safety_restrictions
    : {};
  const override = user?.safety_trust_override || null;
  if (restrictionActive) score = Math.min(score, 32);
  if (override === "trusted") score = Math.max(score, 82);
  if (override === "restricted") score = Math.min(score, 24);

  const level = isStaff ? "staff" : override === "trusted" ? "trusted" : override === "restricted" ? "new" : score >= 78 ? "trusted" : score >= 48 ? "normal" : score >= 28 ? "low" : "new";
  const value = {
    score,
    level,
    ageDays,
    isStaff,
    isPremium: premiumActive,
    recentEvents: (events || []).length,
    openFlags: (flags || []).length,
    override,
    restrictedUntil,
    restrictions,
    restrictionActive,
  };
  trustCache.set(userId, { value, expiresAt: nowMs() + 45_000 });
  return value;
}

function clearTrustCache(userId) {
  if (userId) trustCache.delete(userId);
  else trustCache.clear();
}

function hasRestriction(trust, key) {
  return Boolean(trust?.restrictionActive && trust?.restrictions && trust.restrictions[key]);
}

function clearDomainRulesCache() {
  domainRulesCache.value = null;
  domainRulesCache.expiresAt = 0;
}

function trustLimit(base, trust, multipliers = {}) {
  const defaults = { staff: 4, trusted: 1.5, normal: 1, low: 0.55, new: 0.35, unknown: 0.35 };
  const merged = { ...defaults, ...multipliers };
  return Math.max(1, Math.floor(base * (merged[trust?.level || "unknown"] ?? 1)));
}

function shouldRestrictLinks(trust) {
  return ["new", "low", "unknown"].includes(trust?.level || "unknown");
}

async function cleanupExpiredSafetyData() {
  const now = new Date().toISOString();
  const oldSpam = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const oldResolvedFlags = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  try {
    await supabase
      .from("users")
      .update({ safety_restrictions: {}, safety_restricted_until: null, safety_trust_override: null })
      .not("safety_restricted_until", "is", null)
      .lt("safety_restricted_until", now)
      .or("safety_trust_override.is.null,safety_trust_override.eq.restricted");
    await supabase
      .from("users")
      .update({ safety_restrictions: {}, safety_restricted_until: null })
      .not("safety_restricted_until", "is", null)
      .lt("safety_restricted_until", now)
      .eq("safety_trust_override", "trusted");
  } catch { /* optional migration */ }
  try { await supabase.from("rate_limits").delete().lt("expires_at", now); } catch { /* optional */ }
  try { await supabase.from("spam_events").delete().lt("created_at", oldSpam); } catch { /* optional */ }
  try { await supabase.from("moderation_flags").delete().neq("status", "open").lt("created_at", oldResolvedFlags); } catch { /* optional */ }
  clearTrustCache();
  return { ok: true };
}

module.exports = {
  clientIp,
  consumeRateLimit,
  consumeRateLimitDistributed,
  checkDuplicate,
  extractLinks,
  assessLinks,
  assessLinksWithRules,
  getTrustProfile,
  trustLimit,
  shouldRestrictLinks,
  hasRestriction,
  clearTrustCache,
  applySafetyRestriction,
  normalizeDomain,
  clearDomainRulesCache,
  rateLimitResponse,
  socketRateLimitAck,
  logSpamEvent,
  createModerationFlag,
  cleanupExpiredSafetyData,
};
