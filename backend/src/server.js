// =============================================================================
//  NightGram — Backend entry (Express + Socket.io + Stripe + Supabase)
//  Deploy on Railway. Shared by the Web client and the mobile app.
// =============================================================================

require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { authRouter } = require("./routes/auth");
const { feedRouter } = require("./routes/feed");
const { conversationsRouter } = require("./routes/conversations");
const { storeRouter } = require("./routes/store");
const { usersRouter } = require("./routes/users");
const { premiumRouter } = require("./routes/premium");
const { authMiddleware } = require("./middleware/auth");
const { setupSocket } = require("./socket");
const { stripeWebhook } = require("./routes/stripe");

const app = express();
const server = http.createServer(app);

// Stripe webhook needs the raw body — register BEFORE express.json().
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);

app.use(
  cors({
    origin: process.env.CLIENT_URL?.split(",") ?? "*",
    credentials: true,
  }),
);
app.use(express.json());

// Health check (Railway)
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "nightgram", ts: Date.now() }));

// Public routes
app.use("/api/auth", authRouter);

// Protected routes
app.use("/api/feed", authMiddleware, feedRouter);
app.use("/api/conversations", authMiddleware, conversationsRouter);
app.use("/api/store", authMiddleware, storeRouter);
app.use("/api/users", authMiddleware, usersRouter);
app.use("/api/premium", authMiddleware, premiumRouter);
app.use("/api/posts", authMiddleware, require("./routes/posts"));

// Socket.io
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL?.split(",") ?? "*", credentials: true },
});
setupSocket(io);
app.set("io", io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`✦ NightGram backend on :${PORT}`);
});
