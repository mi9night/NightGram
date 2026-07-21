// Premium subscription routes — Stripe Checkout (monthly/yearly)
const router = require("express").Router();
const Stripe = require("stripe");
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

// POST /api/premium/checkout  { plan: 'monthly' | 'yearly' }
router.post("/checkout", async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe not configured" });
  const plan = req.body.plan === "monthly" ? "monthly" : "yearly";
  const priceId =
    plan === "monthly"
      ? process.env.STRIPE_PRICE_PREMIUM_MONTHLY
      : process.env.STRIPE_PRICE_PREMIUM_YEARLY;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.APP_WEBHOOK_RETURN_URL}?premium=1`,
    cancel_url: `${process.env.APP_WEBHOOK_RETURN_URL}?canceled=1`,
    metadata: { userId: req.userId, kind: "premium" },
  });
  res.json({ url: session.url });
});

module.exports = { premiumRouter: router };
