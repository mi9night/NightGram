"use client";

// =============================================================================
//  Small reusable badges: Premium, NightCoins, Username color.
// =============================================================================

import { Sparkles, Crown } from "lucide-react";
import { cn, formatCoins } from "@/lib/utils";

export function PremiumBadge({ small }: { small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
        small ? "text-xs" : "",
      )}
      style={{
        background: "rgba(251,191,36,0.12)",
        border: "1px solid rgba(251,191,36,0.45)",
        color: "#fbbf24",
      }}
    >
      <Crown size={14} className="fill-[#fbbf24]" /> Premium
    </span>
  );
}

/**
 * PremiumCrownIcon — standalone crown badge with glow, used next to the
 * display name in the profile. Sized to match the CoinsBadge.
 */
export function PremiumCrownIcon() {
  return (
    <span
      className="group relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap self-center cursor-default"
      style={{
        background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
        color: "#1a1206",
        boxShadow: "0 0 12px rgba(251,191,36,0.55)",
      }}
    >
      <Crown size={14} className="fill-[#1a1206]" /> Premium
      {/* Tooltip — anchored right to stay within card */}
      <div className="pointer-events-none absolute top-full right-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity z-50 w-48">
        <div className="ng-solid rounded-xl p-3 text-xs text-white/85 shadow-glow-lg">
          <div className="font-semibold mb-1 flex items-center gap-1.5" style={{ color: "#fbbf24" }}>
            <Crown size={12} className="fill-[#fbbf24]" /> Premium
          </div>
          Подписка на нашем сайте, даёт уникальные возможности.
        </div>
      </div>
    </span>
  );
}

export function CoinsBadge({ amount, className }: { amount: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-neon-gold",
        className,
      )}
      style={{
        background: "rgba(251,191,36,0.08)",
        border: "1px solid rgba(251,191,36,0.3)",
      }}
    >
      <Sparkles size={14} className="fill-neon-gold text-neon-gold" />
      {formatCoins(amount)}
    </span>
  );
}

export function ColoredUsername({
  username,
  color,
  glow = true,
  className,
}: {
  username: string;
  color?: string;
  glow?: boolean;
  className?: string;
}) {
  const c = color ?? "#a855f7";
  return (
    <span
      className={cn("font-semibold", className)}
      style={{ color: c, textShadow: glow ? `0 0 10px ${c}88` : undefined }}
    >
      @{username}
    </span>
  );
}
