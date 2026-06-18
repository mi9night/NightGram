// Night Store routes — list items, buy with coins, Stripe checkout
const router = require("express").Router();
const { supabase } = require("../lib/supabase");
const Stripe = require("stripe");
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

// GET /api/store/items
router.get("/items", async (req, res) => {
  const { data: items, error } = await supabase.from("store_items").select("*");
  if (error) return res.status(500).json({ error: error.message });

  const { data: owned } = await supabase
    .from("user_items")
    .select("item_id")
    .eq("user_id", req.userId);
  const ownedSet = new Set((owned || []).map((o) => o.item_id));

  res.json(
    (items || []).map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      category: i.category,
      previewUrl: i.preview_url,
      priceCoins: i.price_coins,
      stripePriceId: i.stripe_price_id,
      rarity: i.rarity,
      owned: ownedSet.has(i.id),
    })),
  );
});

// POST /api/store/items/:id/buy  (NightCoins)
router.post("/items/:id/buy", async (req, res) => {
  const { id } = req.params;
  const { data: item } = await supabase.from("store_items").select("*").eq("id", id).single();
  if (!item) return res.status(404).json({ error: "Item not found" });

  const { data: user } = await supabase.from("users").select("night_coins").eq("id", req.userId).single();
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.night_coins < item.price_coins)
    return res.status(402).json({ error: "Not enough NightCoins" });

  // Atomic-ish debit + grant + ledger (use an RPC in production)
  const newBalance = user.night_coins - item.price_coins;
  await supabase.from("users").update({ night_coins: newBalance }).eq("id", req.userId);
  await supabase.from("user_items").insert({ user_id: req.userId, item_id: id }).upsert({}, { onConflict: "user_id,item_id" });
  await supabase.from("user_items").upsert({ user_id: req.userId, item_id: id }, { onConflict: "user_id,item_id" });
  await supabase.from("coin_transactions").insert({
    user_id: req.userId, delta: -item.price_coins, reason: "purchase", reference_id: id,
  });

  res.json({ balance: newBalance, owned: true });
});

// POST /api/store/items/:id/checkout  (Stripe — real money items)
router.post("/items/:id/checkout", async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe not configured" });
  const { id } = req.params;
  const { data: item } = await supabase.from("store_items").select("*").eq("id", id).single();
  if (!item || !item.stripe_price_id) return res.status(400).json({ error: "Not a Stripe item" });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: item.stripe_price_id, quantity: 1 }],
    success_url: `${process.env.APP_WEBHOOK_RETURN_URL}?purchased=${id}`,
    cancel_url: `${process.env.APP_WEBHOOK_RETURN_URL}?canceled=1`,
    metadata: { userId: req.userId, itemId: id, kind: "store_item" },
  });
  res.json({ url: session.url });
});

module.exports = { storeRouter: router };
