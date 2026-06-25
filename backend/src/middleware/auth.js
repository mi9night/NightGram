// Auth middleware — verifies the JWT bearer token and refreshes role from DB.
const { verifyAccessToken } = require("../lib/jwt");
const { supabase } = require("../lib/supabase");
const { hasActivePunishment, punishmentMessage } = require("../lib/punishments");

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.username = payload.username;
    req.userRole = payload.role || "user";

    // Roles can be changed in Supabase/admin while the JWT is still alive.
    // Always prefer the database role so moderation starts working immediately.
    try {
      const { data: user } = await supabase
        .from("users")
        .select("role,username")
        .eq("id", req.userId)
        .maybeSingle();
      if (user) {
        req.userRole = user.role || req.userRole;
        req.username = user.username || req.username;
      }
    } catch {
      /* keep JWT role fallback */
    }

    const ban = await hasActivePunishment(req.userId, "ban");
    if (ban) {
      req.activeBan = ban;
      const allowWhileBanned = req.originalUrl.startsWith("/api/auth/me")
        || req.originalUrl.startsWith("/api/auth/logout")
        || req.originalUrl.startsWith("/api/support/tickets");
      if (!allowWhileBanned) {
        return res.status(403).json({ error: punishmentMessage(ban), code: "PUNISHED", type: "ban" });
      }
    }

    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { authMiddleware };
