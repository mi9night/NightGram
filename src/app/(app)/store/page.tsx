"use client";

// =============================================================================
//  NightGram Web — Night Store (marketplace)
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Crown, Plus, ExternalLink, CreditCard, Wallet } from "lucide-react";
import type { StoreCategory, StoreItem } from "@/types";
import { StoreCard } from "@/components/store/StoreCard";
import { CoinsBadge, PremiumBadge } from "@/components/shared/Badges";
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
      setItems(data.map((d) => ({ ...d, owned: owned.has(d.id) })));
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
            <TopUpButton />
          </div>
        )}
      </motion.div>

      <PremiumBanner />

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mt-8 mb-5">
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

// =============================================================================
//  PremiumBanner — два способа поддержать проект
// =============================================================================

function PremiumBanner() {
  const { user, updateUser } = useAuth();

  if (user?.isPremium) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="gradient-border rounded-4xl glass-strong p-6 flex items-center gap-4"
        style={{ boxShadow: "0 0 24px rgba(251,191,36,0.3)" }}
      >
        <div className="h-14 w-14 rounded-2xl grid place-items-center shrink-0" style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>
          <Crown size={26} className="text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-bold text-lg flex items-center gap-2" style={{ color: "#fbbf24" }}>
            <Crown size={18} className="fill-[#fbbf24]" /> Активирован
          </h3>
          <p className="text-sm text-white/55">Все Premium-возможности разблокированы на всех устройствах.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PremiumBadge />

        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden gradient-border rounded-4xl glass-strong p-6 md:p-8"
      style={{ boxShadow: "0 0 30px rgba(251,191,36,0.25)" }}
    >
      <div className="relative z-10">
        {/* Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3"
               style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)" }}>
            <Crown size={14} className="text-neon-gold" />
            <span className="text-xs font-semibold" style={{ color: "#fbbf24" }}>Premium</span>
          </div>
          <h2 className="font-display font-bold text-2xl md:text-3xl">
            Поддержи NightGram <span style={{ color: "#fbbf24" }}>Premium</span>
          </h2>
          <p className="text-white/60 mt-2 text-sm max-w-md mx-auto">
            Эксклюзивные темы, рамки, glow-эффекты, 2× NightCoins и поддержка проекта. Выбери удобный способ оплаты:
          </p>
        </div>

        {/* Donation methods */}
        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {/* Method 1 — DonationAlerts (international + RF) */}
          <a
            href="https://dalink.to/mi9night"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative overflow-hidden rounded-2xl glass-strong p-5 transition hover:scale-[1.02] hover:border-neon-gold/40"
          >
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(251,191,36,0.12)" }}>
                <CreditCard size={20} style={{ color: "#fbbf24" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">DonationAlerts</div>
                <div className="text-xs text-white/45 mt-1">Зарубежные карты + карты РФ</div>
                <div className="text-[11px] text-white/35 mt-2 flex items-center gap-1">
                  <ExternalLink size={11} /> dalink.to/mi9night
                </div>
              </div>
            </div>
            <div className="mt-4 btn-glow w-full py-2.5 text-sm text-center" style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>
              Поддержать
            </div>
          </a>

          {/* Method 2 — Donatex (RF cards backup) */}
          <a
            href="https://donatex.gg/donate/mi9night"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative overflow-hidden rounded-2xl glass-strong p-5 transition hover:scale-[1.02] hover:border-neon-purple/40"
          >
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(168,85,247,0.12)" }}>
                <Wallet size={20} className="text-neon-purple" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">Donatex</div>
                <div className="text-xs text-white/45 mt-1">Карты РФ (если первый не работает)</div>
                <div className="text-[11px] text-white/35 mt-2 flex items-center gap-1">
                  <ExternalLink size={11} /> donatex.gg/donate/mi9night
                </div>
              </div>
            </div>
            <div className="mt-4 btn-ghost w-full py-2.5 text-sm text-center">
              Поддержать
            </div>
          </a>
        </div>

        {/* Note */}
        <p className="text-center text-[11px] text-white/35 mt-4 max-w-md mx-auto">
          После оплаты напишите в поддержку с чеком — мы активируем Premium вручную. В будущем оплата будет автоматической.
        </p>


      </div>
    </motion.div>
  );
}

// =============================================================================
//  TopUpButton — NightCoins purchase (links to donation)
// =============================================================================

function TopUpButton() {
  const { updateUser, user, isDemo } = useAuth();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const packs = [
    { coins: 500, price: "$0.99" },
    { coins: 1200, price: "$1.99", best: true },
    { coins: 2500, price: "$3.99" },
  ];

  async function topUp(coins: number) {
    if (isDemo) {
      updateUser({ nightCoins: (user?.nightCoins ?? 0) + coins });
      setOpen(false);
      return;
    }
    // Real: redirect to donation page
    window.open("https://dalink.to/mi9night", "_blank");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost px-3 py-2 rounded-xl text-sm flex items-center gap-1.5"
      >
        <Plus size={14} /> Пополнить
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute right-0 top-12 z-50 w-56 ng-solid rounded-2xl p-2 shadow-glow-lg"
          >
            {packs.map((p) => (
              <button
                key={p.coins}
                onClick={() => topUp(p.coins)}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-neon-purple/10 transition text-sm"
              >
                <span className="flex items-center gap-1.5 text-neon-gold font-semibold">
                  <Sparkles size={13} className="fill-neon-gold" /> {formatCoins(p.coins)}
                </span>
                <span className="text-white/70">{loading ? "…" : p.price}</span>
              </button>
            ))}
            <p className="text-[10px] text-white/35 text-center pt-2">Оплата через DonationAlerts / Donatex</p>
          </motion.div>
        </>
      )}
    </div>
  );
}
