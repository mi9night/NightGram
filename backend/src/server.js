// =============================================================================
//  NightGram — Backend entry (Express + Socket.io + Stripe + Supabase)
//  Deploy on Railway. Shared by the Web client and the mobile app.
//  Robust against missing env vars — starts even without Supabase configured.
// =============================================================================

require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// --- Middleware ---
app.use(
  cors({
    origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",") : "*",
    credentials: true,
  }),
);
app.use(express.json());

// --- Root health check (Railway probes "/" by default) ---
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

// --- Stripe webhook (raw body, BEFORE json middleware if placed after) ---
let stripeWebhookHandler = null;
try {
  stripeWebhookHandler = require("./routes/stripe").stripeWebhook;
} catch (e) {
  console.warn("[NightGram] Stripe module not loaded:", e.message);
}
if (stripeWebhookHandler) {
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
}

// --- Routes (lazy-loaded, won't crash if Supabase is missing) ---
function loadRoutes() {
  try {
    app.use("/api/auth", require("./routes/auth").authRouter);
    app.use("/api/feed", require("./middleware/auth").authMiddleware, require("./routes/feed").feedRouter);
    app.use("/api/conversations", require("./middleware/auth").authMiddleware, require("./routes/conversations").conversationsRouter);
    app.use("/api/store", require("./middleware/auth").authMiddleware, require("./routes/store").storeRouter);
    app.use("/api/users", require("./middleware/auth").authMiddleware, require("./routes/users").usersRouter);
    app.use("/api/premium", require("./middleware/auth").authMiddleware, require("./routes/premium").premiumRouter);
    app.use("/api/posts", require("./middleware/auth").authMiddleware, require("./routes/posts"));
    console.log("[NightGram] All API routes loaded ✓");
  } catch (e) {
    console.error("[NightGram] Failed to load routes:", e.message);
    // Graceful fallback: return 503 for all API routes
    app.use("/api/*", (_req, res) => {
      res.status(503).json({ error: "Service partially unavailable", detail: e.message });
    });
  }
}

loadRoutes();

// --- Socket.io (optional, won't crash if missing) ---
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
// Railway injects PORT automatically. Bind to 0.0.0.0 (required by Railway).
const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`✦ NightGram backend listening on ${HOST}:${PORT}`);
});

// --- Global error handlers ---
process.on("uncaughtException", (err) => {
  console.error("[NightGram] Uncaught Exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[NightGram] Unhandled Rejection:", reason);
});
