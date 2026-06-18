// Stripe webhook — fulfills purchases & subscriptions, then pushes via socket.
// Registered with the RAW body in server.js (before express.json()).
const { supabase } = require("../lib/supabase");

async function stripeWebhook(req, res) {
  const Stripe = require("stripe");
  const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
  if (!stripe) return res.status(500).end();

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const io = req.app.get("io");
  const { metadata } = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      if (metadata?.kind === "store_item") {
        // Grant the item to the user
        await supabase
          .from("user_items")
          .upsert({ user_id: metadata.userId, item_id: metadata.itemId }, { onConflict: "user_id,item_id" });
        io?.to(`user:${metadata.userId}`).emit("coins:update", null);
      }
      break;
    }
    case "invoice.paid": {
      // Recurring subscription payment → keep premium active
      if (metadata?.kind === "premium") {
        const until = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from("users")
          .update({ is_premium: true, premium_until: until })
          .eq("id", metadata.userId);
        io?.to(`user:${metadata.userId}`).emit("premium:update", true, until);
      }
      break;
    }
    case "customer.subscription.deleted": {
      if (metadata?.userId) {
        await supabase
          .from("users")
          .update({ is_premium: false, premium_until: new Date().toISOString() })
          .eq("id", metadata.userId);
        io?.to(`user:${metadata.userId}`).emit("premium:update", false, null);
      }
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
}

module.exports = { stripeWebhook };
