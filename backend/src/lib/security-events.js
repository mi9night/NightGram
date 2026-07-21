const { supabase } = require("./supabase");
const { clientIp } = require("./safety");

function securityTableMissing(error) {
  const message = String(error?.message || error || "");
  return /auth_security_events|two_factor_recovery_requests|relation .* does not exist|schema cache/i.test(message);
}

function clean(value, max = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function requestMeta(req) {
  return {
    ip_address: clean(clientIp(req), 96) || null,
    device_name: clean(req?.headers?.["x-nightgram-device-name"] || req?.headers?.["user-agent"], 240) || null,
    platform: clean(req?.headers?.["x-nightgram-platform"], 64) || null,
  };
}

async function logSecurityEvent({ userId, eventType, req, sessionId = null, success = true, metadata = {} }) {
  if (!userId || !eventType) return false;
  const payload = {
    user_id: userId,
    session_id: sessionId || null,
    event_type: clean(eventType, 80),
    success: Boolean(success),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    ...requestMeta(req || { headers: {} }),
  };
  try {
    const { error } = await supabase.from("auth_security_events").insert(payload);
    if (error && !securityTableMissing(error)) console.error("[SecurityEvents] insert failed:", error.message);
    return !error;
  } catch (error) {
    console.error("[SecurityEvents] insert failed:", error?.message || error);
    return false;
  }
}

module.exports = { logSecurityEvent, securityTableMissing, requestMeta };
