import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [
  ["supabase/migration_auth_sessions.sql", ["create table if not exists public.auth_sessions", "token_hash", "revoked_at"]],
  ["backend/src/lib/jwt.js", ["sessionId", "sid"]],
  ["backend/src/lib/auth-sessions.js", ["issueAuthTokens", "validateRefreshSession", "timingSafeEqual", "revokeOtherSessions"]],
  ["backend/src/routes/auth.js", ["/sessions", "sessions/revoke-others", "Session revoked"]],
  ["backend/src/middleware/auth.js", ["req.sessionId = payload.sid"]],
  ["src/lib/api.ts", ["getAuthSessions", "revokeAuthSession", "X-NightGram-Platform"]],
  ["src/app/(app)/settings/page.tsx", ["Активные устройства", "Отключить остальные", "migration_auth_sessions.sql"]],
  ["src/app/api/backend/[...path]/route.ts", ["x-nightgram-platform", "x-nightgram-device-name"]],
];

for (const [file, needles] of checks) {
  const content = read(file);
  for (const needle of needles) {
    if (!content.includes(needle)) throw new Error(`${file}: missing ${needle}`);
  }
}

for (const file of [
  "backend/src/lib/jwt.js",
  "backend/src/lib/auth-sessions.js",
  "backend/src/middleware/auth.js",
  "backend/src/routes/auth.js",
]) {
  execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
}

console.log("[OK] Active device sessions are configured.");
