// JWT helpers — access + refresh tokens
const jwt = require("jsonwebtoken");

function getSecret(name) {
  const value = process.env[name];
  if (!value || value.startsWith("replace_with")) {
    const err = new Error(`${name} is not configured on backend`);
    err.statusCode = 500;
    throw err;
  }
  return value;
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    getSecret("JWT_SECRET"),
    { expiresIn: process.env.ACCESS_TOKEN_TTL || "15m" },
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    getSecret("JWT_REFRESH_SECRET"),
    { expiresIn: process.env.REFRESH_TOKEN_TTL || "7d" },
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, getSecret("JWT_SECRET"));
}

function verifyRefreshToken(token) {
  return jwt.verify(token, getSecret("JWT_REFRESH_SECRET"));
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
