// =============================================================================
//  NightGram Web — Stripe client helper
//  Stripe.js is loaded lazily; the real Checkout Session is created by the
//  backend (which holds the secret key) and the browser just redirects.
// =============================================================================

import { loadStripe, type Stripe } from "@stripe/stripe-js";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    if (!PUBLISHABLE_KEY) {
      stripePromise = Promise.resolve(null);
      return stripePromise;
    }
    stripePromise = loadStripe(PUBLISHABLE_KEY);
  }
  return stripePromise;
}

/**
 * The backend returns a hosted Checkout URL — the simplest, PCI-safe flow.
 * We just redirect the browser there. Webhooks (payments + subscriptions)
 * are handled server-side and instantly reflected via Socket.io.
 */
export async function redirectToCheckout(url: string): Promise<void> {
  if (typeof window === "undefined") return;
  window.location.href = url;
}
