// Auth routes — register, login, refresh, logout, me
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { supabase } = require("../lib/supabase");
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require("../lib/jwt");
const { authMiddleware } = require("../middleware/auth");

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: "Missing fields" });

  const password_hash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase
    .from("users")
    .insert({ username, email, password_hash })
    .select()
    .single();
  if (error) return res.status(409).json({ error: error.message });

  const accessToken = signAccessToken(data);
  const refreshToken = signRefreshToken(data);
  res.json({ user: sanitize(data), accessToken, refreshToken });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  res.json({ user: sanitize(user), accessToken, refreshToken });
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const payload = verifyRefreshToken(refreshToken);
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", payload.sub)
      .single();
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
    });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

// POST /api/auth/logout  (in production, blacklist the refresh token)
router.post("/logout", authMiddleware, async (_req, res) => {
  // TODO: add refresh token to a revocation list (e.g. Redis)
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res) => {
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", req.userId)
    .single();
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json(sanitize(user));
});

// Strip sensitive fields.
function sanitize(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

module.exports = { authRouter: router };
