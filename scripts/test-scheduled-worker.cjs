const Module = require("node:module");
const path = require("node:path");

const scheduled = {
  id: "sched-1",
  conversation_id: "conv-1",
  sender_id: "user-1",
  text: "Сообщение из будущего",
  type: "text",
  scheduled_at: new Date(Date.now() - 1000).toISOString(),
  status: "pending",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const emitted = [];
const writes = [];

class Query {
  constructor(table) { this.table = table; this.action = "select"; this.payload = null; this.filters = []; }
  select() { if (!this.action || this.action === "select") this.action = "select"; return this; }
  update(payload) { this.action = "update"; this.payload = payload; return this; }
  insert(payload) { this.action = "insert"; this.payload = payload; return this; }
  eq(key, value) { this.filters.push(["eq", key, value]); return this; }
  lte(key, value) { this.filters.push(["lte", key, value]); return this; }
  lt(key, value) { this.filters.push(["lt", key, value]); return this; }
  order() { return this; }
  limit() { return this; }
  async maybeSingle() { return this.execute(true); }
  async single() { return this.execute(true); }
  then(resolve, reject) { return this.execute(false).then(resolve, reject); }
  async execute(single) {
    if (this.table === "scheduled_messages" && this.action === "select") return { data: [{ id: scheduled.id }], error: null };
    if (this.table === "scheduled_messages" && this.action === "update") {
      writes.push({ table: this.table, payload: this.payload, filters: this.filters });
      if (this.payload.status === "processing") return { data: { ...scheduled, ...this.payload }, error: null };
      return { data: single ? { ...scheduled, ...this.payload } : null, error: null };
    }
    if (this.table === "messages" && this.action === "insert") {
      writes.push({ table: this.table, payload: this.payload });
      return { data: { id: "msg-1", created_at: new Date().toISOString(), ...this.payload }, error: null };
    }
    if (this.table === "users") return { data: { id: "user-1", username: "midnight", display_name: "Midnight", avatar_url: null, name_color: "#fff" }, error: null };
    if (this.table === "conversation_participants") return { data: [{ user_id: "user-1", muted: false }, { user_id: "user-2", muted: false }], error: null };
    if (this.table === "conversations") return { data: { title: "Тестовый чат", avatar_url: null, type: "direct" }, error: null };
    return { data: single ? null : [], error: null };
  }
}

const mockSupabase = { from(table) { return new Query(table); } };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename?.endsWith(path.join("lib", "scheduledMessages.js")) && request === "./supabase") return { supabase: mockSupabase };
  if (parent?.filename?.endsWith(path.join("lib", "scheduledMessages.js")) && request === "./messageReceipts") {
    return { getReceiptSummaries: async () => new Map([["msg-1", { status: "sent", deliveredTo: [], readBy: [] }]]) };
  }
  if (parent?.filename?.endsWith(path.join("lib", "scheduledMessages.js")) && request === "./punishments") {
    return { hasActivePunishment: async () => null };
  }
  if (parent?.filename?.endsWith(path.join("lib", "scheduledMessages.js")) && request === "./safety") {
    return {
      assessLinksWithRules: async () => ({ links: [], blocked: [] }),
      getTrustProfile: async () => ({ restrictions: {} }),
      hasRestriction: () => false,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const { processDueScheduledMessages } = require("../backend/src/lib/scheduledMessages");
    const io = { to(room) { return { emit(event, payload) { emitted.push({ room, event, payload }); } }; } };
    await processDueScheduledMessages(io);
    const mustEmit = [
      ["conv:conv-1", "message:new"],
      ["user:user-2", "message:push"],
      ["user:user-1", "message:push"],
      ["user:user-1", "scheduled:sent"],
    ];
    for (const [room, event] of mustEmit) {
      if (!emitted.some((entry) => entry.room === room && entry.event === event)) throw new Error(`Missing emit ${room} ${event}`);
    }
    if (!writes.some((entry) => entry.table === "messages" && entry.payload.text === scheduled.text)) throw new Error("Message was not inserted");
    if (!writes.some((entry) => entry.table === "scheduled_messages" && entry.payload.status === "sent")) throw new Error("Scheduled row was not marked sent");
    console.log("Scheduled messages worker test passed.");
  } finally {
    Module._load = originalLoad;
  }
})().catch((error) => { console.error(error); process.exit(1); });
