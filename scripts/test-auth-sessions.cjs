const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = "test-access-secret-test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-test-refresh-secret";
process.env.REFRESH_TOKEN_TTL = "7d";

const root = path.resolve(__dirname, "..");
const rows = [];

function matches(row, filters) {
  return filters.every(({ type, key, value }) => {
    if (type === "eq") return row[key] === value;
    if (type === "lt") return String(row[key]) < String(value);
    if (type === "is") return row[key] === value;
    if (type === "neq") return row[key] !== value;
    return true;
  });
}

function builder(table) {
  const state = { op: "select", payload: null, filters: [] };
  const api = {
    select() { state.op = "select"; return api; },
    insert(payload) { state.op = "insert"; state.payload = payload; return api; },
    update(payload) { state.op = "update"; state.payload = payload; return api; },
    delete() { state.op = "delete"; return api; },
    eq(key, value) { state.filters.push({ type: "eq", key, value }); return api; },
    neq(key, value) { state.filters.push({ type: "neq", key, value }); return api; },
    lt(key, value) { state.filters.push({ type: "lt", key, value }); return api; },
    is(key, value) { state.filters.push({ type: "is", key, value }); return api; },
    async maybeSingle() {
      const found = rows.find((row) => matches(row, state.filters)) || null;
      return { data: found ? { ...found } : null, error: null };
    },
    then(resolve, reject) {
      Promise.resolve().then(() => {
        if (table !== "auth_sessions") return { data: null, error: null };
        if (state.op === "insert") rows.push({ ...state.payload });
        if (state.op === "update") {
          for (const row of rows) if (matches(row, state.filters)) Object.assign(row, state.payload);
        }
        if (state.op === "delete") {
          for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], state.filters)) rows.splice(i, 1);
        }
        return { data: null, error: null };
      }).then(resolve, reject);
    },
  };
  return api;
}

const supabasePath = require.resolve(path.join(root, "backend/src/lib/supabase.js"));
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: { supabase: { from: builder } } };
const safetyPath = require.resolve(path.join(root, "backend/src/lib/safety.js"));
require.cache[safetyPath] = { id: safetyPath, filename: safetyPath, loaded: true, exports: { clientIp: () => "127.0.0.1" } };
const jwtPath = require.resolve(path.join(root, "backend/src/lib/jwt.js"));
let tokenCounter = 0;
require.cache[jwtPath] = {
  id: jwtPath,
  filename: jwtPath,
  loaded: true,
  exports: {
    signAccessToken: (_user, sid) => `access.${sid || "legacy"}.${++tokenCounter}`,
    signRefreshToken: (_user, sid) => `refresh.${sid || "legacy"}.${++tokenCounter}`,
  },
};

const { issueAuthTokens, validateRefreshSession, revokeSession } = require(path.join(root, "backend/src/lib/auth-sessions.js"));

(async () => {
  const user = { id: "00000000-0000-4000-8000-000000000001", username: "tester", role: "user" };
  const req = { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Electron/32.0", "x-nightgram-platform": "windows-desktop" } };
  const first = await issueAuthTokens(user, req);
  assert.equal(first.sessionTracking, true);
  assert.equal(rows.length, 1);
  assert.ok(first.refreshToken.includes(first.sessionId));
  assert.equal((await validateRefreshSession(user.id, first.sessionId, first.refreshToken)).valid, true);

  const rotated = await issueAuthTokens(user, req, first.sessionId);
  assert.equal((await validateRefreshSession(user.id, first.sessionId, first.refreshToken)).valid, false);
  assert.equal((await validateRefreshSession(user.id, first.sessionId, rotated.refreshToken)).valid, true);

  await revokeSession(user.id, first.sessionId);
  assert.equal((await validateRefreshSession(user.id, first.sessionId, rotated.refreshToken)).valid, false);
  console.log("[OK] Session create, rotation and revocation tests passed.");
})().catch((error) => { console.error(error); process.exit(1); });
