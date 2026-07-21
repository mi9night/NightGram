const assert = require("node:assert/strict");
const Module = require("node:module");

let globalHandler = null;
const router = {
  get(path, handler) {
    if (path === "/global") globalHandler = handler;
    return this;
  },
};

function queryFor(table) {
  const state = { table, ops: [] };
  const chain = {
    select(value) { state.ops.push(["select", value]); return chain; },
    eq(column, value) { state.ops.push(["eq", column, value]); return chain; },
    neq(column, value) { state.ops.push(["neq", column, value]); return chain; },
    in(column, value) { state.ops.push(["in", column, value]); return chain; },
    is(column, value) { state.ops.push(["is", column, value]); return chain; },
    not(column, operator, value) { state.ops.push(["not", column, operator, value]); return chain; },
    ilike(column, value) { state.ops.push(["ilike", column, value]); return chain; },
    or(value) { state.ops.push(["or", value]); return chain; },
    order(column, options) { state.ops.push(["order", column, options]); return chain; },
    limit(value) { state.ops.push(["limit", value]); return chain; },
    then(resolve, reject) {
      try { resolve(resolveQuery(state)); } catch (error) { reject(error); }
    },
  };
  return chain;
}

function hasOp(state, name, column) {
  return state.ops.some((op) => op[0] === name && (column === undefined || op[1] === column));
}

function resolveQuery(state) {
  if (state.table === "conversation_participants") {
    if (hasOp(state, "eq", "user_id")) {
      return { data: [{ conversation_id: "conv-1", hidden: false, request_status: "accepted" }], error: null };
    }
    return {
      data: [
        { conversation_id: "conv-1", user_id: "viewer", role: "owner" },
        { conversation_id: "conv-1", user_id: "friend", role: "member" },
      ],
      error: null,
    };
  }
  if (state.table === "conversations") {
    return { data: [{ id: "conv-1", type: "direct", title: "Чат", avatar_url: null, description: null }], error: null };
  }
  if (state.table === "users") {
    if (hasOp(state, "in", "id")) {
      return {
        data: [
          { id: "viewer", username: "viewer", display_name: "Viewer", avatar_url: null, name_color: "#fff", role: "user", is_premium: false },
          { id: "friend", username: "alice", display_name: "Alice", avatar_url: null, name_color: "#fff", role: "user", is_premium: false },
        ],
        error: null,
      };
    }
    return { data: [{ id: "friend", username: "alice", display_name: "Alice", avatar_url: null, name_color: "#fff", role: "user", is_premium: false }], error: null };
  }
  if (state.table === "messages") {
    if (hasOp(state, "not", "attachment_url")) {
      return {
        data: [{ id: "file-1", conversation_id: "conv-1", sender_id: "friend", text: "project brief", type: "file", attachment_url: "https://cdn.example/project.pdf", attachment_thumbnail_url: null, created_at: "2026-07-20T10:00:00.000Z", deleted_at: null }],
        error: null,
      };
    }
    return {
      data: [{ id: "msg-1", conversation_id: "conv-1", sender_id: "friend", text: "project status", type: "text", attachment_url: null, created_at: "2026-07-20T09:00:00.000Z", deleted_at: null }],
      error: null,
    };
  }
  throw new Error(`Unexpected table ${state.table}`);
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "express") return { Router: () => router };
  if (request === "../lib/supabase") return { supabase: { from: queryFor } };
  return originalLoad.call(this, request, parent, isMain);
};

try {
  require("../backend/src/routes/search.js");
} finally {
  Module._load = originalLoad;
}

assert.equal(typeof globalHandler, "function", "Global search handler was not registered");

const req = { userId: "viewer", query: { q: "project", type: "all", limit: "8" } };
let statusCode = 200;
let payload = null;
const res = {
  status(code) { statusCode = code; return this; },
  json(value) { payload = value; return this; },
};

Promise.resolve(globalHandler(req, res)).then(() => {
  assert.equal(statusCode, 200);
  assert.equal(payload.query, "project");
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.files.length, 1);
  assert.equal(payload.messages[0].conversationId, "conv-1");
  assert.equal(payload.messages[0].conversationTitle, "Alice");
  assert.equal(payload.files[0].attachmentUrl, "https://cdn.example/project.pdf");
  assert.ok(payload.conversations.every((item) => item.id === "conv-1"));
  console.log("Global search route test passed: visibility, messages, files and direct-chat title.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
