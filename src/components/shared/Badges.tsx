"use client";

// =============================================================================
//  Small reusable badges: Premium, NightCoins, Username color.
// =============================================================================

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const ref = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => setMounted(true), []);
  useLayoutEffect(() => {
    if (!hovered || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = 260;
    setPos({
      top: Math.min(rect.bottom + 10, window.innerHeight - 130),
      left: Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8),
    });
  }, [hovered]);

  return (
    <span
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      title="Подписка на сайте: темы, рамки, glow, бусты и ранний доступ."
      className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap self-center cursor-default"
      style={{
        background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
        color: "#1a1206",
        boxShadow: "0 0 12px rgba(251,191,36,0.55)",
      }}
    >
      <Crown size={14} className="fill-[#1a1206]" /> Premium
      {mounted && hovered && createPortal(
        <div
          className="pointer-events-none fixed z-[120500] w-64 rounded-2xl border border-white/10 bg-[#100a24]/96 p-3 text-left text-xs text-white/85 shadow-glow-lg backdrop-blur-xl whitespace-normal"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-neon-gold">
            <Crown size={12} className="fill-[#fbbf24]" /> Premium
          </div>
          <p className="text-[11px] leading-relaxed text-white/68 whitespace-normal break-words">
            Подписка NightGram: темы, рамки, glow-эффекты, бусты каналов, увеличенные лимиты и ранний доступ.
          </p>
        </div>,
        document.body,
      )}
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
