// =============================================================================
//  NightGram — Backend entry (Express + Socket.io + Stripe + Supabase)
// =============================================================================

require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// --- Middleware ---
// CORS: explicit configuration for maximum compatibility.
// Handles both regular requests and preflight OPTIONS.
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control");
  res.header("Access-Control-Max-Age", "86400");
  // Handle preflight immediately
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// --- Stripe webhook ---
// Must be registered BEFORE express.json(), because Stripe verifies the exact raw body.
let stripeWebhookHandler = null;
try {
  stripeWebhookHandler = require("./routes/stripe").stripeWebhook;
} catch (e) {
  console.warn("[NightGram] Stripe module not loaded:", e.message);
}
if (stripeWebhookHandler) {
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
}

app.use(express.json({ limit: "50mb" }));

// --- Root health check ---
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "nightgram",
    version: "1.0.0",
    ts: Date.now(),
    supabase: !!process.env.SUPABASE_URL ? "configured" : "not-configured",
    jwt: process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET ? "configured" : "not-configured",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "nightgram",
    ts: Date.now(),
    supabase: !!process.env.SUPABASE_URL ? "configured" : "not-configured",
    jwt: process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET ? "configured" : "not-configured",
  });
});


// --- Auth routes (public) ---
const { authRouter } = require("./routes/auth");
app.use("/api/auth", authRouter);

// --- Payment provider webhooks (public, protected by provider/shared secret) ---
try {
  app.use("/api/payments", require("./routes/payments"));
  console.log("[NightGram] Payment webhook routes loaded ✓");
} catch (e) {
  console.error("[NightGram] Payment webhook routes FAILED:", e.message);
}

// --- Auth middleware ---
const { authMiddleware } = require("./middleware/auth");

// --- Upload route (base64 JSON) ---
tryMount("/api/upload", authMiddleware, require("./routes/upload"), "Upload");

// --- Protected routes ---
function tryMount(path, middleware, routerFn, name) {
  try {
    app.use(path, middleware, routerFn);
    console.log(`[NightGram] ${name} routes loaded ✓`);
  } catch (e) {
    console.error(`[NightGram] ${name} routes FAILED:`, e.message);
    app.use(path, middleware, (_req, res) => {
      res.status(503).json({ error: `${name} unavailable`, detail: e.message });
    });
  }
}

tryMount("/api/feed", authMiddleware, require("./routes/feed").feedRouter, "Feed");
tryMount("/api/conversations", authMiddleware, require("./routes/conversations").conversationsRouter, "Conversations");
tryMount("/api/store", authMiddleware, require("./routes/store").storeRouter, "Store");
tryMount("/api/users", authMiddleware, require("./routes/users").usersRouter, "Users");
tryMount("/api/premium", authMiddleware, require("./routes/premium").premiumRouter, "Premium");
tryMount("/api/posts", authMiddleware, require("./routes/posts"), "Posts");
tryMount("/api/admin", authMiddleware, require("./routes/admin"), "Admin");
tryMount("/api/notifications", authMiddleware, require("./routes/notifications"), "Notifications");
tryMount("/api/support", authMiddleware, require("./routes/support"), "Support");
tryMount("/api/social", authMiddleware, require("./routes/social").socialRouter, "Social");
tryMount("/api/channels", authMiddleware, require("./routes/channels").channelsRouter, "Channels");
tryMount("/api/stories", authMiddleware, require("./routes/stories"), "Stories");

// --- Safety scheduled cleanup (best-effort; safe on Railway single instance) ---
try {
  const { cleanupExpiredSafetyData } = require("./lib/safety");
  setTimeout(() => cleanupExpiredSafetyData().catch(() => {}), 30_000);
  setInterval(() => cleanupExpiredSafetyData().catch(() => {}), 60 * 60 * 1000);
  console.log("[NightGram] Safety cleanup scheduled ✓");
} catch (e) {
  console.warn("[NightGram] Safety cleanup not scheduled:", e.message);
}

// --- Socket.io ---
let io = null;
try {
  const { Server } = require("socket.io");
  const { setupSocket } = require("./socket");
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",") : "*",
      credentials: true,
    },
  });
  setupSocket(io);
  app.set("io", io);
  console.log("[NightGram] Socket.io initialized ✓");
} catch (e) {
  console.warn("[NightGram] Socket.io not loaded:", e.message);
}

// --- Start server ---
const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`✦ NightGram backend listening on ${HOST}:${PORT}`);
});

process.on("uncaughtException", (err) => {
  console.error("[NightGram] Uncaught Exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[NightGram] Unhandled Rejection:", reason);
});
