"use client";

// =============================================================================
//  Night Store — item card (glass, preview, rarity glow, buy action)
// =============================================================================

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Crown, Sparkles, Lock } from "lucide-react";
import type { StoreItem } from "@/types";
import { cn, formatCoins } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { redirectToCheckout } from "@/lib/stripe";

const RARITY = {
  common: { color: "#9ca3af", label: "Common", glow: "0 0 12px rgba(156,163,175,0.4)" },
  rare: { color: "#22d3ee", label: "Rare", glow: "0 0 16px rgba(34,211,238,0.5)" },
  epic: { color: "#a855f7", label: "Epic", glow: "0 0 18px rgba(168,85,247,0.6)" },
  legendary: { color: "#fbbf24", label: "Legendary", glow: "0 0 22px rgba(251,191,36,0.65)" },
};

const CATEGORY_GRADIENTS: Record<StoreItem["category"], string> = {
  theme: "linear-gradient(135deg,#a855f7,#ec4899)",
  color_pack: "linear-gradient(135deg,#fbbf24,#ec4899)",
  sticker_pack: "linear-gradient(135deg,#22d3ee,#6366f1)",
  frame: "linear-gradient(135deg,#a855f7,#6366f1)",
  glow_effect: "linear-gradient(135deg,#ec4899,#a855f7)",
  badge: "linear-gradient(135deg,#fbbf24,#a855f7)",
};

export function StoreCard({ item, index = 0 }: { item: StoreItem; index?: number }) {
  const { user, updateUser, isDemo } = useAuth();
  const [owned, setOwned] = useState(item.owned);
  const [buying, setBuying] = useState(false);
  const rarity = RARITY[item.rarity];

  const canAfford = (user?.nightCoins ?? 0) >= item.priceCoins;
  const isRealMoney = item.priceCoins === 0 && item.stripePriceId;

  async function buyWithCoins() {
    if (!canAfford || owned) return;
    setBuying(true);
    try {
      if (!isDemo) {
        const res = await api.buyWithCoins(item.id);
        updateUser({
          nightCoins: res.balance,
          ownedItems: [...(user?.ownedItems ?? []), item.id],
        });
      } else {
        updateUser({ nightCoins: (user?.nightCoins ?? 0) - item.priceCoins });
      }
      setOwned(true);
    } catch {
      /* ignore */
    } finally {
      setBuying(false);
    }
  }

  async function buyWithStripe() {
    setBuying(true);
    try {
      if (!isDemo) {
        const { url } = await api.createCheckoutSession(item.id);
        redirectToCheckout(url);
      } else {
        // demo: just grant
        setOwned(true);
      }
    } catch {
      /* ignore */
    } finally {
      setBuying(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), type: "spring", stiffness: 90, damping: 14 }}
      whileHover={{ y: -6, scale: 1.02 }}
      className="relative group"
    >
      <div
        className="relative gradient-border rounded-4xl glass-strong overflow-hidden h-full flex flex-col"
        style={{ boxShadow: rarity.glow }}
      >
        {/* Preview */}
        <div className="relative aspect-[4/3] overflow-hidden">
          <motion.div
            className="absolute inset-0"
            style={{ background: CATEGORY_GRADIENTS[item.category] }}
            animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
            transition={{ duration: 6, repeat: Infinity }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.previewUrl}
            alt={item.name}
            className="relative h-full w-full object-cover mix-blend-overlay opacity-80 group-hover:scale-110 transition-transform duration-500"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-midnight-950/80 to-transparent" />

          {/* rarity tag */}
          <span
            className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur-md"
            style={{ background: `${rarity.color}22`, color: rarity.color, border: `1px solid ${rarity.color}55` }}
          >
            {rarity.label}
          </span>

          {/* owned badge */}
          {owned && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-3 right-3 grid place-items-center h-8 w-8 rounded-full bg-green-500/20 border border-green-500/50"
            >
              <Check size={16} className="text-green-400" />
            </motion.div>
          )}

          {/* category icon */}
          <div className="absolute bottom-3 left-3 h-9 w-9 rounded-xl glass-strong grid place-items-center">
            <CategoryIcon category={item.category} />
          </div>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-display font-bold text-base">{item.name}</h3>
          <p className="text-xs text-white/50 mt-1 flex-1 line-clamp-2">{item.description}</p>

          {/* Price + buy */}
          <div className="mt-4 flex items-center justify-between gap-2">
            {isRealMoney ? (
              <>
                <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "#fbbf24" }}>
                  <Crown size={15} /> Premium
                </span>
                <button
                  onClick={buyWithStripe}
                  disabled={owned || buying}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-semibold transition",
                    owned ? "glass text-white/40" : "btn-glow",
                  )}
                  style={owned ? undefined : { background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}
                >
                  {owned ? "Куплено" : buying ? <Loader2 size={14} className="animate-spin" /> : "Купить"}
                </button>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-sm font-bold text-neon-gold">
                  <Sparkles size={14} className="fill-neon-gold" />
                  {formatCoins(item.priceCoins)} ✦
                </span>
                <button
                  onClick={buyWithCoins}
                  disabled={owned || buying || !canAfford}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-semibold transition",
                    owned
                      ? "glass text-white/40"
                      : canAfford
                        ? "btn-glow"
                        : "glass text-white/40 cursor-not-allowed",
                  )}
                >
                  {owned ? (
                    <Check size={14} />
                  ) : buying ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : !canAfford ? (
                    <span className="flex items-center gap-1"><Lock size={12} /> Мало</span>
                  ) : (
                    "Купить"
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CategoryIcon({ category }: { category: StoreItem["category"] }) {
  const icons: Record<string, string> = {
    theme: "🎨",
    color_pack: "🌈",
    sticker_pack: "✨",
    frame: "🖼️",
    glow_effect: "💫",
    badge: "👑",
  };
  return <span className="text-lg">{icons[category] ?? "🎁"}</span>;
}
