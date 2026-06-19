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
// CORS: dynamically echo any origin (required when credentials: true).
// Cannot use "*" with credentials — browser rejects it.
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "50mb" })); // allow large payloads

// --- Root health check ---
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "nightgram",
    version: "1.0.0",
    ts: Date.now(),
    supabase: !!process.env.SUPABASE_URL ? "configured" : "not-configured",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "nightgram", ts: Date.now() });
});

// --- Stripe webhook ---
let stripeWebhookHandler = null;
try {
  stripeWebhookHandler = require("./routes/stripe").stripeWebhook;
} catch (e) {
  console.warn("[NightGram] Stripe module not loaded:", e.message);
}
if (stripeWebhookHandler) {
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
}

// --- Auth routes (public) ---
const { authRouter } = require("./routes/auth");
app.use("/api/auth", authRouter);

// --- Upload route (needs multer, before express.json) ---
try {
  app.use("/api/upload", require("./middleware/auth").authMiddleware, require("./routes/upload"));
  console.log("[NightGram] Upload routes loaded ✓");
} catch (e) {
  console.error("[NightGram] Upload routes FAILED:", e.message);
}

// --- Auth middleware ---
const { authMiddleware } = require("./middleware/auth");

// --- Protected routes — each loaded independently so one failure doesn't break all ---
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
