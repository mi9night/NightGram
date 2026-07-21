// Supabase admin client (service role — bypasses RLS, server only)
// Robust: works on both Node 18 (with ws fallback) and Node 20+ (native WS).
const { createClient } = require("@supabase/supabase-js");

// On Node < 22, provide the 'ws' package so Supabase Realtime doesn't crash.
let wsTransport = undefined;
try {
  const ws = require("ws");
  // Supabase JS v2 uses a global WebSocket if available, else needs a polyfill.
  if (typeof global.WebSocket === "undefined" && ws) {
    global.WebSocket = ws.WebSocket || ws;
  }
} catch (e) {
  // ws not installed — fine on Node 22+
}

const supabaseUrl = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: {
    transport: wsTransport,
  },
});

module.exports = { supabase };
