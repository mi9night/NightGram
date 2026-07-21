const crypto = require('crypto');
const rateLimitStore = require('./rateLimitStore');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function requestIdMiddleware(req, res, next) {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  req.requestId = /^[a-zA-Z0-9._:-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.path.startsWith('/api/auth')) res.setHeader('Cache-Control', 'no-store');
  next();
}

function configuredOrigins() {
  const raw = [process.env.CLIENT_URL, process.env.CLIENT_ORIGINS]
    .filter(Boolean)
    .join(',');
  return new Set(raw.split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean));
}

function isLoopbackOrigin(origin) {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (isLoopbackOrigin(origin)) return true;
  const allowed = configuredOrigins();
  // Compatibility mode for deployments that have not configured CLIENT_URL yet:
  // allow public HTTPS origins, but never enable credentialed CORS.
  if (allowed.size === 0) return /^https:\/\//i.test(origin);
  return allowed.has(origin.replace(/\/$/, ''));
}

function corsMiddleware(req, res, next) {
  const origin = String(req.headers.origin || '');
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({ error: 'origin_not_allowed', message: 'Этот источник не разрешён сервером NightGram' });
  }

  const configured = configuredOrigins();
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (configured.size === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Cache-Control, X-Request-Id');
  res.setHeader('Access-Control-Expose-Headers', 'Retry-After, X-Request-Id, X-RateLimit-Remaining, X-RateLimit-Reset');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

async function apiRateLimit(req, res, next) {
  if (!req.path.startsWith('/api') || req.method === 'OPTIONS' || req.path === '/api/health') return next();
  if (req.path === '/api/stripe/webhook' || req.path.startsWith('/api/payments/')) return next();

  const isWrite = !['GET', 'HEAD'].includes(req.method);
  const limit = Number(process.env[isWrite ? 'API_WRITE_RATE_LIMIT' : 'API_READ_RATE_LIMIT']) || (isWrite ? 180 : 600);
  const windowMs = 5 * 60 * 1000;
  const bucket = isWrite ? 'write' : 'read';
  const result = await rateLimitStore.consume(`api:${bucket}:${requestIp(req)}`, { limit, windowMs });
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfter || 1));
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Слишком много запросов. Подожди немного и попробуй снова.',
      retryAfter: result.retryAfter || 1,
    });
  }
  next();
}

function containsUnsafeKey(value, depth = 0) {
  if (!value || typeof value !== 'object') return false;
  if (depth > 24) return true;
  if (Array.isArray(value)) return value.some((item) => containsUnsafeKey(item, depth + 1));
  for (const [key, nested] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key) || containsUnsafeKey(nested, depth + 1)) return true;
  }
  return false;
}

function rejectUnsafeJson(req, res, next) {
  if (containsUnsafeKey(req.body)) {
    return res.status(400).json({ error: 'invalid_payload', message: 'Некорректная структура запроса' });
  }
  next();
}

function looksInternal(message) {
  return /schema cache|relation |column |duplicate key|violates|postgres|supabase|jwt_|service role|stack|syntax error/i.test(String(message || ''));
}

function sanitizeErrorResponses(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (!payload || typeof payload !== 'object') return originalJson(payload);
    const status = res.statusCode;
    const nextPayload = { ...payload };

    if (status >= 500) {
      console.error(`[HTTP ${req.requestId}] ${req.method} ${req.originalUrl} -> ${status}`, payload);
      if (IS_PRODUCTION) {
        return originalJson({
          error: status === 503 ? 'service_unavailable' : 'internal_error',
          message: status === 503 ? 'Сервис временно недоступен. Попробуй позже.' : 'Внутренняя ошибка сервера.',
          requestId: req.requestId,
        });
      }
    }

    if (status >= 400 && looksInternal(nextPayload.error)) {
      nextPayload.error = 'request_failed';
      nextPayload.message = nextPayload.message || 'Не удалось выполнить запрос';
      delete nextPayload.detail;
    }
    return originalJson(nextPayload);
  };
  next();
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not_found', message: 'Маршрут не найден', requestId: req.requestId });
}

function errorHandler(err, req, res, _next) {
  const isTooLarge = err?.type === 'entity.too.large';
  const isJsonSyntax = err instanceof SyntaxError && 'body' in err;
  const status = isTooLarge ? 413 : isJsonSyntax ? 400 : Number(err?.status || err?.statusCode) || 500;
  console.error(`[HTTP ${req.requestId}]`, err?.stack || err);
  if (res.headersSent) return;
  res.status(status).json({
    error: isTooLarge ? 'payload_too_large' : isJsonSyntax ? 'invalid_json' : 'internal_error',
    message: isTooLarge ? 'Размер запроса слишком большой' : isJsonSyntax ? 'Некорректный JSON' : 'Внутренняя ошибка сервера',
    requestId: req.requestId,
  });
}

module.exports = {
  requestIdMiddleware,
  securityHeaders,
  corsMiddleware,
  apiRateLimit,
  rejectUnsafeJson,
  sanitizeErrorResponses,
  notFoundHandler,
  errorHandler,
  isOriginAllowed,
};
