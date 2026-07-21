const crypto = require("node:crypto");
const http2 = require("node:http2");
const { supabase } = require("./supabase");
const { shouldDeliver } = require("./push-rules");

const fcmProjectId = String(process.env.FCM_PROJECT_ID || "").trim();
const fcmClientEmail = String(process.env.FCM_CLIENT_EMAIL || "").trim();
const fcmPrivateKey = String(process.env.FCM_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
const androidConfigured = Boolean(fcmProjectId && fcmClientEmail && fcmPrivateKey);

const apnsKeyId = String(process.env.APNS_KEY_ID || "").trim();
const apnsTeamId = String(process.env.APNS_TEAM_ID || "").trim();
const apnsPrivateKey = String(process.env.APNS_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
const apnsBundleId = String(process.env.APNS_BUNDLE_ID || "app.nightgram.mobile").trim();
const apnsProduction = String(process.env.APNS_PRODUCTION || "false").toLowerCase() === "true";
const iosConfigured = Boolean(apnsKeyId && apnsTeamId && apnsPrivateKey && apnsBundleId);

let googleTokenCache = null;
let apnsJwtCache = null;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function compactPayload(payload) {
  const result = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") result[key] = JSON.stringify(value);
    else result[key] = String(value);
  }
  return result;
}

async function getGoogleAccessToken() {
  if (googleTokenCache && googleTokenCache.expiresAt > Date.now() + 60_000) return googleTokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: fcmClientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const input = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(input), fcmPrivateKey).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${signature}` }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`FCM OAuth ${response.status}: ${body.error_description || body.error || "token failed"}`);
  googleTokenCache = { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 };
  return googleTokenCache.token;
}

async function sendFcm(token, payload, urgent) {
  const accessToken = await getGoogleAccessToken();
  const data = compactPayload(payload);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcmProjectId)}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        ...(!payload.silent ? { notification: { title: String(payload.title || "NightGram"), body: String(payload.body || "") } } : {}),
        data,
        android: {
          priority: urgent ? "HIGH" : "NORMAL",
          ttl: urgent ? "75s" : "3600s",
          notification: {
            channel_id: payload.kind === "call" ? "nightgram_calls" : "nightgram_messages",
            sound: "default",
            click_action: "FCM_PLUGIN_ACTIVITY",
            visibility: "PRIVATE",
          },
        },
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`FCM ${response.status}: ${body?.error?.message || "send failed"}`);
    error.statusCode = response.status;
    error.code = body?.error?.details?.[0]?.errorCode || body?.error?.status || "";
    throw error;
  }
  return body;
}

function getApnsJwt() {
  if (apnsJwtCache && apnsJwtCache.expiresAt > Date.now() + 60_000) return apnsJwtCache.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: apnsKeyId }));
  const claims = base64url(JSON.stringify({ iss: apnsTeamId, iat: now }));
  const input = `${header}.${claims}`;
  const signature = crypto.sign("sha256", Buffer.from(input), { key: apnsPrivateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  apnsJwtCache = { token: `${input}.${signature}`, expiresAt: Date.now() + 50 * 60_000 };
  return apnsJwtCache.token;
}

function sendApns(token, payload, { urgent, voip }) {
  return new Promise((resolve, reject) => {
    const origin = apnsProduction ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
    const client = http2.connect(origin);
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      client.close();
      if (error) reject(error); else resolve(value);
    };
    client.on("error", (error) => finish(error));
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${getApnsJwt()}`,
      "apns-topic": voip ? `${apnsBundleId}.voip` : apnsBundleId,
      "apns-push-type": voip ? "voip" : payload.silent ? "background" : "alert",
      "apns-priority": voip || !payload.silent ? "10" : "5",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + (urgent ? 75 : 3600)),
      ...(payload.tag ? { "apns-collapse-id": String(payload.tag).slice(0, 64) } : {}),
    });
    let status = 0;
    let responseBody = "";
    request.setEncoding("utf8");
    request.on("response", (headers) => { status = Number(headers[":status"] || 0); });
    request.on("data", (chunk) => { responseBody += chunk; });
    request.on("end", () => {
      if (status >= 200 && status < 300) return finish(null, { ok: true });
      const parsed = (() => { try { return JSON.parse(responseBody); } catch { return {}; } })();
      const error = new Error(`APNs ${status}: ${parsed.reason || responseBody || "send failed"}`);
      error.statusCode = status;
      error.code = parsed.reason || "";
      finish(error);
    });
    const custom = compactPayload(payload);
    const body = voip || payload.silent
      ? { aps: { "content-available": 1 }, ...custom }
      : { aps: { alert: { title: String(payload.title || "NightGram"), body: String(payload.body || "") }, sound: "default", badge: 1, "mutable-content": 1 }, ...custom };
    request.end(JSON.stringify(body));
  });
}

function nativePushConfig() {
  return { enabled: androidConfigured || iosConfigured, android: androidConfigured, ios: iosConfigured, voip: iosConfigured };
}

async function sendNativePushToUsers(userIds, payload, { category = "message", urgent = false } = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0 || (!androidConfigured && !iosConfigured)) return { configured: nativePushConfig(), sent: 0, failed: 0 };
  const [{ data: tokens, error }, { data: users }] = await Promise.all([
    supabase.from("native_push_tokens").select("id,user_id,token,platform,device_id,timezone_offset_minutes,voip").in("user_id", ids).eq("enabled", true),
    supabase.from("users").select("id,notification_settings").in("id", ids),
  ]);
  if (error) {
    if (!/native_push_tokens|schema cache|does not exist/i.test(error.message || "")) console.error("[NativePush] tokens", error.message || error);
    return { configured: nativePushConfig(), sent: 0, failed: 0 };
  }
  const settingsByUser = new Map((users || []).map((user) => [String(user.id), user.notification_settings || {}]));
  const voipDevices = new Set((tokens || []).filter((row) => row.platform === "ios" && row.voip).map((row) => `${row.user_id}:${row.device_id}`));
  let sent = 0;
  let failed = 0;

  await Promise.all((tokens || []).map(async (row) => {
    const isCall = category === "call" || payload.kind === "call";
    if (row.voip && !isCall) return;
    if (isCall && row.platform === "ios" && !row.voip && voipDevices.has(`${row.user_id}:${row.device_id}`)) return;
    const settings = settingsByUser.get(String(row.user_id)) || {};
    if (!shouldDeliver(settings, row.timezone_offset_minutes, category, urgent)) return;
    try {
      if (row.platform === "android") {
        if (!androidConfigured) return;
        await sendFcm(row.token, payload, urgent);
      } else if (row.platform === "ios") {
        if (!iosConfigured) return;
        await sendApns(row.token, payload, { urgent, voip: Boolean(row.voip) });
      } else return;
      sent += 1;
      await supabase.from("native_push_tokens").update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
    } catch (sendError) {
      failed += 1;
      const status = Number(sendError?.statusCode || 0);
      const code = String(sendError?.code || "");
      const invalid = status === 404 || status === 410 || /UNREGISTERED|BadDeviceToken|DeviceTokenNotForTopic|Unregistered/i.test(code);
      if (invalid) await supabase.from("native_push_tokens").delete().eq("id", row.id);
      else await supabase.from("native_push_tokens").update({ last_error: String(sendError?.message || sendError).slice(0, 500), updated_at: new Date().toISOString() }).eq("id", row.id);
    }
  }));

  return { configured: nativePushConfig(), sent, failed };
}

module.exports = { nativePushConfig, sendNativePushToUsers, compactPayload };
