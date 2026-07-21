const webpush = require("web-push");
const { supabase } = require("./supabase");

const publicKey = String(process.env.WEB_PUSH_PUBLIC_KEY || "").trim();
const privateKey = String(process.env.WEB_PUSH_PRIVATE_KEY || "").trim();
const subject = String(process.env.WEB_PUSH_SUBJECT || "mailto:admin@nightgram.app").trim();
const configured = Boolean(publicKey && privateKey);

if (configured) webpush.setVapidDetails(subject, publicKey, privateKey);

const { quietHoursActive, categoryEnabled, shouldDeliver } = require("./push-rules");

async function sendWebPushToUsers(userIds, payload, { category = "message", urgent = false } = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!configured || ids.length === 0) return { configured, sent: 0, failed: 0 };

  const [{ data: subscriptions, error: subscriptionError }, { data: users }] = await Promise.all([
    supabase.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth,timezone_offset_minutes").in("user_id", ids).eq("enabled", true),
    supabase.from("users").select("id,notification_settings").in("id", ids),
  ]);
  if (subscriptionError) {
    if (!/push_subscriptions|schema cache|does not exist/i.test(subscriptionError.message || "")) console.error("[WebPush] subscriptions", subscriptionError.message || subscriptionError);
    return { configured, sent: 0, failed: 0 };
  }
  const settingsByUser = new Map((users || []).map((user) => [String(user.id), user.notification_settings || {}]));
  let sent = 0;
  let failed = 0;

  await Promise.all((subscriptions || []).map(async (row) => {
    const settings = settingsByUser.get(String(row.user_id)) || {};
    if (!shouldDeliver(settings, row.timezone_offset_minutes, category, urgent)) return;
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }, JSON.stringify(payload), { TTL: urgent ? 75 : 3600, urgency: urgent ? "high" : "normal" });
      sent += 1;
      await supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
    } catch (error) {
      failed += 1;
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", row.id);
      } else {
        await supabase.from("push_subscriptions").update({ last_error: String(error?.message || error).slice(0, 500), updated_at: new Date().toISOString() }).eq("id", row.id);
      }
    }
  }));
  return { configured, sent, failed };
}

module.exports = { webPushConfigured: configured, webPushPublicKey: publicKey, sendWebPushToUsers, quietHoursActive, categoryEnabled };
