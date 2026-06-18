// Auth middleware — verifies the JWT bearer token.
const { verifyAccessToken, signAccessToken } = require("../lib/jwt");

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userRole = payload.role;
    req.username = payload.username;
    return next();
  } catch (err) {
    // Token expired — caller should hit /auth/refresh.
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { authMiddleware };
