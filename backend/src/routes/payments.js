// Donation payment automation — matches DonationAlerts/Donatex events to purchase_requests.
// If a payment cannot be matched safely, it is stored as an unmatched event for manual review.
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

function extractPayment(body) {
  const payload = body?.data || body?.donation || body?.payment || body || {};
  const amount = Number(payload.amount ?? payload.amount_main ?? payload.sum ?? payload.price ?? 0);
  const message = String(payload.message ?? payload.comment ?? payload.msg ?? payload.text ?? "");
  const providerPaymentId = String(payload.id ?? payload.payment_id ?? payload.alert_id ?? payload.uuid ?? `${Date.now()}-${Math.random()}`);
  const username = String(payload.username ?? payload.name ?? payload.nickname ?? "");
  const currency = String(payload.currency ?? payload.currency_code ?? "RUB").toUpperCase();
  return { amount, message, providerPaymentId, username, currency, raw: body };
}

function extractCode(message) {
  return (message.match(/NG-[A-Z0-9]{4,12}/i)?.[0] || "").toUpperCase();
}

function extractNgId(message) {
  const match = message.match(/#?(\d{6,12})/);
  return match ? Number(match[1]) : null;
}

async function safe(promise, fallback = { data: null, error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

function premiumMonthsFromName(itemName = "") {
  const name = String(itemName).toLowerCase();
  if (name.includes("2 год") || name.includes("24") || name.includes("2 year")) return 24;
  if (name.includes("год") || name.includes("12") || name.includes("year")) return 12;
  return 1;
}

function isMissingBoostBalance(error) {
  return /boost_balance|schema cache|column .*boost/i.test(error?.message || "");
}

async function grantPurchase(purchase, io) {
  const targetUserId = purchase.recipient_user_id || purchase.user_id;
  const isGift = Boolean(purchase.recipient_user_id && purchase.recipient_user_id !== purchase.user_id);
  if (purchase.item_type === "premium") {
    const months = premiumMonthsFromName(purchase.item_name);
    let untilBase = await safe(supabase.from("users").select("premium_until,boost_balance").eq("id", targetUserId).single(), { data: null, error: null });
    let boostColumnAvailable = !isMissingBoostBalance(untilBase.error);
    if (!boostColumnAvailable) {
      untilBase = await safe(supabase.from("users").select("premium_until").eq("id", targetUserId).single(), { data: null, error: null });
    }
    const base = untilBase.data?.premium_until && new Date(untilBase.data.premium_until).getTime() > Date.now()
      ? new Date(untilBase.data.premium_until).getTime()
      : Date.now();
    const until = new Date(base + months * 30 * 24 * 60 * 60 * 1000).toISOString();
    const boostBalance = months >= 24 ? 9 : months >= 12 ? 6 : 3;
    let update = await safe(supabase.from("users").update({
      is_premium: true,
      premium_until: until,
      ...(boostColumnAvailable ? { boost_balance: (untilBase.data?.boost_balance ?? 0) + boostBalance } : {}),
    }).eq("id", targetUserId), { error: null });
    if (update.error && isMissingBoostBalance(update.error)) {
      await safe(supabase.from("users").update({ is_premium: true, premium_until: until }).eq("id", targetUserId), { error: null });
    }
    io?.to(`user:${targetUserId}`).emit("premium:update", true, until);
  } else if (purchase.item_type === "coins") {
    const match = String(purchase.item_name).match(/(\d+)/);
    const coins = match ? parseInt(match[1], 10) : 0;
    const { data: user } = await supabase.from("users").select("night_coins").eq("id", targetUserId).single();
    const balance = (user?.night_coins ?? 0) + coins;
    await supabase.from("users").update({ night_coins: balance }).eq("id", targetUserId);
    await safe(supabase.from("coin_transactions").insert({ user_id: targetUserId, delta: coins, reason: isGift ? "gift_coins" : "topup", reference_id: purchase.id }));
    io?.to(`user:${targetUserId}`).emit("coins:update", balance);
  }

  if (isGift) {
    await safe(supabase.from("notifications").insert([
      { user_id: targetUserId, type: "store", title: "Вам подарили покупку", body: `@${purchase.username} подарил: ${purchase.item_name}`, read: false },
      { user_id: purchase.user_id, type: "store", title: "Подарок доставлен", body: `Подарок для @${purchase.recipient_username || "user"}: ${purchase.item_name}`, read: false },
    ]));
  } else {
    await safe(supabase.from("notifications").insert({ user_id: targetUserId, type: "store", title: "Покупка активирована", body: `${purchase.item_name} успешно выдано`, read: false }));
  }
}

async function findPurchase(payment) {
  const code = extractCode(payment.message);
  const ngId = extractNgId(payment.message);

  if (code) {
    const byCode = await safe(
      supabase.from("purchase_requests").select("*").eq("payment_code", code).eq("status", "pending").maybeSingle(),
    );
    if (byCode.data) return byCode.data;
  }

  if (ngId) {
    const byUser = await safe(
      supabase
        .from("purchase_requests")
        .select("*")
        .eq("ng_id", ngId)
        .eq("status", "pending")
        .lte("price", payment.amount)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (byUser.data) return byUser.data;
  }

  return null;
}

async function storeEvent(provider, payment, purchase, status) {
  await safe(supabase.from("payment_events").insert({
    provider,
    provider_payment_id: payment.providerPaymentId,
    amount: payment.amount,
    currency: payment.currency,
    username: payment.username,
    message: payment.message,
    raw_payload: payment.raw,
    matched_purchase_id: purchase?.id || null,
    status,
  }));
}

async function handlePayment(req, res, provider) {
  const secret = process.env.DONATION_WEBHOOK_SECRET || process.env.DONATIONALERTS_WEBHOOK_SECRET || process.env.DONATEX_WEBHOOK_SECRET;
  if (secret && req.get("x-nightgram-secret") !== secret && req.query.secret !== secret) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const payment = extractPayment(req.body);
  if (!payment.amount || payment.amount <= 0) {
    await storeEvent(provider, payment, null, "ignored");
    return res.status(400).json({ error: "Invalid amount" });
  }

  // Idempotency: ignore already processed provider payment id when the table exists.
  const existing = await safe(
    supabase.from("payment_events").select("id,status").eq("provider", provider).eq("provider_payment_id", payment.providerPaymentId).maybeSingle(),
  );
  if (existing.data) return res.json({ ok: true, duplicate: true, status: existing.data.status });

  const purchase = await findPurchase(payment);
  if (!purchase) {
    await storeEvent(provider, payment, null, "unmatched");
    return res.json({ ok: true, status: "unmatched", manualReview: true });
  }

  if (payment.amount < Number(purchase.price || purchase.expected_amount || 0)) {
    await storeEvent(provider, payment, purchase, "amount_mismatch");
    await safe(supabase.from("purchase_requests").update({
      status: "pending",
      paid_amount: payment.amount,
      provider_payment_id: payment.providerPaymentId,
      provider,
    }).eq("id", purchase.id));
    return res.json({ ok: true, status: "amount_mismatch", manualReview: true });
  }

  await grantPurchase(purchase, req.app.get("io"));
  await safe(supabase.from("purchase_requests").update({
    status: "approved",
    paid_amount: payment.amount,
    provider_payment_id: payment.providerPaymentId,
    provider,
    auto_matched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", purchase.id));
  await storeEvent(provider, payment, purchase, "matched");

  res.json({ ok: true, status: "matched", purchaseId: purchase.id });
}

router.post("/donationalerts/webhook", (req, res) => handlePayment(req, res, "donationalerts"));
router.post("/donatex/webhook", (req, res) => handlePayment(req, res, "donatex"));
// Generic endpoint useful for tests/manual provider integrations.
router.post("/webhook", (req, res) => handlePayment(req, res, String(req.body?.provider || "manual")));

module.exports = router;
