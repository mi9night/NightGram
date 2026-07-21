// =============================================================================
// NightGram — Backend entry (Express + Socket.io + Stripe + Supabase)
// =============================================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const { authMiddleware } = require('./middleware/auth');
const {
  requestIdMiddleware,
  securityHeaders,
  corsMiddleware,
  apiRateLimit,
  rejectUnsafeJson,
  sanitizeErrorResponses,
  notFoundHandler,
  errorHandler,
  isOriginAllowed,
} = require('./lib/httpSecurity');

const APP_VERSION = '3.4.0';
const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Request identity, safe response headers, CORS and generic abuse protection.
app.use(requestIdMiddleware);
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(sanitizeErrorResponses);
app.use(apiRateLimit);

// Stripe verifies the exact raw body and therefore must be mounted before JSON parsers.
let stripeWebhookHandler = null;
try {
  stripeWebhookHandler = require('./routes/stripe').stripeWebhook;
} catch (error) {
  console.warn('[NightGram] Stripe module not loaded:', error.message);
}
if (stripeWebhookHandler) {
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '2mb' }), stripeWebhookHandler);
}

function tryMount(path, middleware, routerFn, name) {
  try {
    app.use(path, middleware, routerFn);
    console.log(`[NightGram] ${name} routes loaded ✓`);
  } catch (error) {
    console.error(`[NightGram] ${name} routes FAILED:`, error.message);
    app.use(path, middleware, (_req, res) => {
      res.status(503).json({ error: `${name} unavailable` });
    });
  }
}

// Upload is the only JSON endpoint allowed to carry a large base64 payload.
// Every other API route is deliberately capped at 1 MB.
tryMount(
  '/api/upload',
  [express.json({ limit: '70mb' }), rejectUnsafeJson, authMiddleware],
  require('./routes/upload'),
  'Upload',
);

app.use(express.json({ limit: '1mb' }));
app.use(rejectUnsafeJson);

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'nightgram', version: APP_VERSION, ts: Date.now() });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'nightgram',
    version: APP_VERSION,
    ts: Date.now(),
    uptime: Math.floor(process.uptime()),
    ...(process.env.NODE_ENV !== 'production' ? {
      supabase: process.env.SUPABASE_URL ? 'configured' : 'not-configured',
      jwt: process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET ? 'configured' : 'not-configured',
    } : {}),
  });
});

// Public auth routes.
const { authRouter } = require('./routes/auth');
app.use('/api/auth', authRouter);

// Provider webhooks are public but protected by their own shared secret.
try {
  app.use('/api/payments', require('./routes/payments'));
  console.log('[NightGram] Payment webhook routes loaded ✓');
} catch (error) {
  console.error('[NightGram] Payment webhook routes FAILED:', error.message);
}

// Protected API routes.
tryMount('/api/feed', authMiddleware, require('./routes/feed').feedRouter, 'Feed');
tryMount('/api/conversations', authMiddleware, require('./routes/conversations').conversationsRouter, 'Conversations');
tryMount('/api/store', authMiddleware, require('./routes/store').storeRouter, 'Store');
tryMount('/api/users', authMiddleware, require('./routes/users').usersRouter, 'Users');
tryMount('/api/search', authMiddleware, require('./routes/search'), 'Search');
tryMount('/api/premium', authMiddleware, require('./routes/premium').premiumRouter, 'Premium');
tryMount('/api/posts', authMiddleware, require('./routes/posts'), 'Posts');
tryMount('/api/admin', authMiddleware, require('./routes/admin'), 'Admin');
tryMount('/api/notifications', authMiddleware, require('./routes/notifications'), 'Notifications');
tryMount('/api/support', authMiddleware, require('./routes/support'), 'Support');
tryMount('/api/social', authMiddleware, require('./routes/social').socialRouter, 'Social');
tryMount('/api/channels', authMiddleware, require('./routes/channels').channelsRouter, 'Channels');
tryMount('/api/calls', authMiddleware, require('./routes/calls'), 'Calls');
tryMount('/api/stories', authMiddleware, require('./routes/stories'), 'Stories');

// Safety cleanup is best-effort and never blocks application startup.
try {
  const { cleanupExpiredSafetyData } = require('./lib/safety');
  setTimeout(() => cleanupExpiredSafetyData().catch(() => {}), 30_000);
  setInterval(() => cleanupExpiredSafetyData().catch(() => {}), 60 * 60 * 1000).unref();
  console.log('[NightGram] Safety cleanup scheduled ✓');
} catch (error) {
  console.warn('[NightGram] Safety cleanup not scheduled:', error.message);
}

// Socket.io uses bearer-token auth; credentialed CORS is unnecessary.
let io = null;
try {
  const { Server } = require('socket.io');
  const { setupSocket } = require('./socket');
  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        callback(isOriginAllowed(origin) ? null : new Error('Origin not allowed'), isOriginAllowed(origin));
      },
      credentials: false,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1_000_000,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });
  setupSocket(io);
  app.set('io', io);
  console.log('[NightGram] Socket.io initialized ✓');
} catch (error) {
  console.warn('[NightGram] Socket.io not loaded:', error.message);
}

try {
  const { startScheduledMessages } = require('./lib/scheduledMessages');
  app.set('stopScheduledMessages', startScheduledMessages(io));
} catch (scheduledError) {
  console.warn('[NightGram] Scheduled messages worker not started:', scheduledError.message);
}

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.requestTimeout = 120_000;

server.listen(PORT, HOST, () => {
  console.log(`✦ NightGram backend ${APP_VERSION} listening on ${HOST}:${PORT}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[NightGram] ${signal}: graceful shutdown started`);
  const forceTimer = setTimeout(() => process.exit(1), 12_000);
  forceTimer.unref();
  try { app.get('stopScheduledMessages')?.(); } catch {}
  io?.close();
  server.close(() => {
    clearTimeout(forceTimer);
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  console.error('[NightGram] Uncaught Exception:', error.stack || error.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[NightGram] Unhandled Rejection:', reason);
});
