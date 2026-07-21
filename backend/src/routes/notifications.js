// Notifications and Web Push subscriptions.
const router = require("express").Router();
const { supabase } = require("../lib/supabase");
const { webPushConfigured, webPushPublicKey } = require("../lib/web-push");
const { nativePushConfig } = require("../lib/native-push");
const { sendPushToUsers } = require("../lib/push");

function cleanText(value, max) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= max ? text : null;
}

function validEndpoint(value) {
  const text = cleanText(value, 4096);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return res.json([]);
    res.json(data || []);
  } catch {
    res.json([]);
  }
});

router.get("/push-config", (_req, res) => {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.json({ enabled: webPushConfigured, publicKey: webPushConfigured ? webPushPublicKey : null });
});

router.get("/native-config", (_req, res) => {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.json(nativePushConfig());
});

router.post("/native-tokens", async (req, res) => {
  const token = cleanText(req.body?.token, 8192);
  const platform = cleanText(req.body?.platform, 16);
  const deviceId = cleanText(req.body?.deviceId, 256);
  const appVersion = cleanText(req.body?.appVersion, 80);
  const voip = Boolean(req.body?.voip);
  if (!token || !deviceId || !["android", "ios"].includes(platform)) return res.status(400).json({ error: "Некорректный токен мобильного устройства" });
  if (voip && platform !== "ios") return res.status(400).json({ error: "VoIP-токен поддерживается только на iOS" });
  const timezoneOffset = Math.min(840, Math.max(-840, Number(req.body?.timezoneOffsetMinutes || 0) || 0));
  const timestamp = new Date().toISOString();
  try {
    const { error } = await supabase.from("native_push_tokens").upsert({
      user_id: req.userId,
      token,
      platform,
      device_id: deviceId,
      app_version: appVersion,
      timezone_offset_minutes: timezoneOffset,
      voip,
      enabled: true,
      last_error: null,
      updated_at: timestamp,
    }, { onConflict: "platform,token" });
    if (error) {
      if (/native_push_tokens|schema cache|does not exist/i.test(error.message || "")) return res.status(503).json({ error: "Сначала примените migration_native_mobile_apps.sql" });
      throw error;
    }
    return res.json({ ok: true, enabled: nativePushConfig()[platform] });
  } catch (error) {
    console.error("[NativePush] subscribe", error?.message || error);
    return res.status(500).json({ error: "Не удалось сохранить токен мобильного устройства" });
  }
});

router.delete("/native-tokens", async (req, res) => {
  const token = cleanText(req.body?.token, 8192);
  const deviceId = cleanText(req.body?.deviceId, 256);
  if (!token && !deviceId) return res.status(400).json({ error: "Укажите токен или устройство" });
  try {
    let query = supabase.from("native_push_tokens").delete().eq("user_id", req.userId);
    if (token) query = query.eq("token", token);
    if (deviceId) query = query.eq("device_id", deviceId);
    await query;
  } catch { /* best effort */ }
  res.json({ ok: true });
});

router.post("/push-subscriptions", async (req, res) => {
  const endpoint = validEndpoint(req.body?.endpoint);
  const p256dh = cleanText(req.body?.keys?.p256dh, 1024);
  const auth = cleanText(req.body?.keys?.auth, 512);
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: "Некорректная push-подписка" });
  const timezoneOffset = Math.min(840, Math.max(-840, Number(req.body?.timezoneOffsetMinutes || 0) || 0));
  const platform = cleanText(req.body?.platform, 80);
  const userAgent = cleanText(req.headers["user-agent"], 500);
  const timestamp = new Date().toISOString();
  try {
    const { error } = await supabase.from("push_subscriptions").upsert({
      user_id: req.userId,
      endpoint,
      p256dh,
      auth,
      platform,
      user_agent: userAgent,
      timezone_offset_minutes: timezoneOffset,
      enabled: true,
      last_error: null,
      updated_at: timestamp,
    }, { onConflict: "endpoint" });
    if (error) {
      if (/push_subscriptions|schema cache|does not exist/i.test(error.message || "")) {
        return res.status(503).json({ error: "Сначала примените migration_call_history_web_push.sql" });
      }
      throw error;
    }
    return res.json({ ok: true, enabled: webPushConfigured });
  } catch (error) {
    console.error("[Push] subscribe", error?.message || error);
    return res.status(500).json({ error: "Не удалось сохранить push-подписку" });
  }
});

router.delete("/push-subscriptions", async (req, res) => {
  const endpoint = validEndpoint(req.body?.endpoint);
  if (!endpoint) return res.status(400).json({ error: "Некорректная push-подписка" });
  try {
    await supabase.from("push_subscriptions").delete().eq("user_id", req.userId).eq("endpoint", endpoint);
  } catch { /* best effort */ }
  res.json({ ok: true });
});

router.post("/push-test", async (req, res) => {
  const result = await sendPushToUsers([req.userId], {
    kind: "system",
    title: "NightGram push работает",
    body: "Это тестовое уведомление для текущего устройства.",
    url: "/settings",
    tag: "nightgram-push-test",
  }, { category: "system", urgent: true });
  res.json({ ok: result.sent > 0, ...result });
});

router.post("/read-all", async (req, res) => {
  try {
    await supabase.from("notifications").update({ read: true }).eq("user_id", req.userId).eq("read", false);
  } catch { /* ignore missing table in early setups */ }
  res.json({ ok: true });
});

router.post("/:id/read", async (req, res) => {
  try {
    await supabase.from("notifications").update({ read: true }).eq("id", req.params.id).eq("user_id", req.userId);
  } catch { /* ignore missing table in early setups */ }
  res.json({ ok: true });
});

module.exports = router;
module.exports._internals = { validEndpoint };
