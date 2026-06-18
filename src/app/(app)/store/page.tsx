"use client";

// =============================================================================
//  NightGram Web — Night Store (marketplace for items)
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Plus } from "lucide-react";
import Link from "next/link";
import type { StoreCategory, StoreItem } from "@/types";
import { StoreCard } from "@/components/store/StoreCard";
import { CoinsBadge } from "@/components/shared/Badges";
import { AuroraBackground } from "@/components/shared/AuroraBackground";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { cn, formatCoins } from "@/lib/utils";

const CATEGORIES: { id: StoreCategory | "all"; label: string; emoji: string }[] = [
  { id: "all", label: "Всё", emoji: "✨" },
  { id: "theme", label: "Темы", emoji: "🎨" },
  { id: "color_pack", label: "Цвета", emoji: "🌈" },
  { id: "frame", label: "Рамки", emoji: "🖼️" },
  { id: "glow_effect", label: "Glow", emoji: "💫" },
  { id: "sticker_pack", label: "Стикеры", emoji: "😺" },
  { id: "badge", label: "Бейджи", emoji: "👑" },
];

export default function StorePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [category, setCategory] = useState<StoreCategory | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getStoreItems().catch(() => []).then((data) => {
      if (!active) return;
      const owned = new Set(user?.ownedItems ?? []);
      setItems((data || []).map((d) => ({ ...d, owned: owned.has(d.id) })));
      setLoading(false);
    });
    return () => { active = false; };
  }, [user?.ownedItems]);

  const filtered = useMemo(
    () => (category === "all" ? items : items.filter((i) => i.category === category)),
    [items, category],
  );

  return (
    <div className="relative max-w-6xl mx-auto px-4">
      <AuroraBackground intensity={0.6} className="fixed top-0 left-0 right-0 h-[60vh] -z-10" />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="font-display font-bold text-3xl flex items-center gap-2">
            Night Store <Sparkles size={22} className="text-neon-purple" />
          </h1>
          <p className="text-sm text-white/45">Прокачай свой профиль</p>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <CoinsBadge amount={user.nightCoins} />
            <Link href="/store/premium?tab=coins" className="btn-ghost px-3 py-2 rounded-xl text-sm flex items-center gap-1.5">
              <Plus size={14} /> Пополнить
            </Link>
          </div>
        )}
      </motion.div>

      {/* Quick links to Premium / Coins */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <Link href="/store/premium?tab=premium" className="group relative overflow-hidden rounded-2xl glass-strong p-4 flex items-center gap-3 transition hover:scale-[1.02]">
          <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>
            <Sparkles size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm" style={{ color: "#fbbf24" }}>Premium от 230₽</div>
            <div className="text-xs text-white/45">Темы, рамки, glow и многое другое</div>
          </div>
        </Link>
        <Link href="/store/premium?tab=coins" className="group relative overflow-hidden rounded-2xl glass-strong p-4 flex items-center gap-3 transition hover:scale-[1.02]">
          <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(251,191,36,0.12)" }}>
            <Sparkles size={20} className="fill-neon-gold text-neon-gold" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm text-neon-gold">NightCoins от 70₽</div>
            <div className="text-xs text-white/45">Внутренняя валюта для покупок</div>
          </div>
        </Link>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm whitespace-nowrap transition",
              category === c.id
                ? "bg-neon-purple/20 text-white border border-neon-purple/40 shadow-glow"
                : "glass text-white/60 hover:text-white",
            )}
          >
            <span>{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="gradient-border rounded-4xl glass-strong p-4">
              <div className="skeleton aspect-[4/3] rounded-3xl mb-4" />
              <div className="skeleton h-4 w-24 rounded-full mb-2" />
              <div className="skeleton h-3 w-full rounded-full mb-1" />
              <div className="skeleton h-3 w-2/3 rounded-full mb-4" />
              <div className="skeleton h-9 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-white/40">
          <Sparkles size={32} className="mx-auto mb-3" />
          <p>Товары скоро появятся</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((item, i) => (
            <StoreCard key={item.id} item={item} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
