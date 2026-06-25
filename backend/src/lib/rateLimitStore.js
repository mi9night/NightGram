// =============================================================================
// NightGram rate-limit store adapter
// Memory by default; Upstash Redis REST-ready when env is configured.
// This file is intentionally dependency-free for Railway.
// =============================================================================

const memory = new Map();

function nowMs() { return Date.now(); }
function seconds(ms) { return Math.max(1, Math.ceil(ms / 1000)); }

function memoryConsume(key, { limit, windowMs, cost = 1 }) {
  const now = nowMs();
  const current = memory.get(key);
  if (!current || current.resetAt <= now) {
    const bucket = { count: cost, resetAt: now + windowMs };
    memory.set(key, bucket);
    return { allowed: true, remaining: Math.max(0, limit - cost), retryAfter: 0, resetAt: bucket.resetAt, store: "memory" };
  }
  if (current.count + cost > limit) {
    return { allowed: false, remaining: 0, retryAfter: seconds(current.resetAt - now), resetAt: current.resetAt, store: "memory" };
  }
  current.count += cost;
  memory.set(key, current);
  return { allowed: true, remaining: Math.max(0, limit - current.count), retryAfter: 0, resetAt: current.resetAt, store: "memory" };
}

async function upstashCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || typeof fetch !== "function") return null;
  const res = await fetch(url.replace(/\/$/, ""), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function redisConsume(key, { limit, windowMs, cost = 1 }) {
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const safeKey = `ng:rl:${key}`;
  try {
    const incr = await upstashCommand(["INCRBY", safeKey, String(cost)]);
    const count = Number(incr?.result ?? NaN);
    if (!Number.isFinite(count)) return null;
    if (count === cost) await upstashCommand(["EXPIRE", safeKey, String(ttlSeconds)]);
    const ttl = await upstashCommand(["TTL", safeKey]);
    const retryAfter = Math.max(1, Number(ttl?.result ?? ttlSeconds));
    if (count > limit) return { allowed: false, remaining: 0, retryAfter, resetAt: nowMs() + retryAfter * 1000, store: "upstash" };
    return { allowed: true, remaining: Math.max(0, limit - count), retryAfter: 0, resetAt: nowMs() + retryAfter * 1000, store: "upstash" };
  } catch {
    return null;
  }
}

async function consume(key, options) {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = await redisConsume(key, options);
    if (redis) return redis;
  }
  return memoryConsume(key, options);
}

module.exports = { consume, memoryConsume };
