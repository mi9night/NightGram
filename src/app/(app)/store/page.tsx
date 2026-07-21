"use client";

// =============================================================================
//  NightGram Web — Магазин (marketplace for items)
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Crown, ReceiptText, Flame, Clock3, PackageCheck } from "lucide-react";
import Link from "next/link";
import type { StoreCategory, StoreItem } from "@/types";
import { StoreCard } from "@/components/store/StoreCard";
import { AuroraBackground } from "@/components/shared/AuroraBackground";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type StoreFilter = StoreCategory | "all" | "drops";

const CATEGORIES: { id: StoreFilter; label: string; emoji: string }[] = [
  { id: "all", label: "Всё", emoji: "✨" },
  { id: "drops", label: "Drops", emoji: "🔥" },
  { id: "theme", label: "Темы", emoji: "🎨" },
  { id: "color_pack", label: "Цвета", emoji: "🌈" },
  { id: "frame", label: "Рамки", emoji: "🖼️" },
  { id: "glow_effect", label: "Glow", emoji: "💫" },
  { id: "sticker_pack", label: "Стикеры", emoji: "😺" },
  { id: "badge", label: "Бейджи", emoji: "👑" },
  { id: "nft", label: "NFT", emoji: "💠" },
];

const CATEGORY_LOGOS: Record<string, { glyph: string; bg: string; glow: string }> = {
  all: { glyph: "✦", bg: "linear-gradient(135deg,#a855f7,#ec4899,#22d3ee)", glow: "rgba(168,85,247,0.35)" },
  drops: { glyph: "◆", bg: "linear-gradient(135deg,#f97316,#fbbf24,#fb7185)", glow: "rgba(251,191,36,0.32)" },
  theme: { glyph: "◈", bg: "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)", glow: "rgba(168,85,247,0.32)" },
  color_pack: { glyph: "●", bg: "conic-gradient(from 120deg,#fbbf24,#ec4899,#22d3ee,#34d399,#fbbf24)", glow: "rgba(34,211,238,0.3)" },
  frame: { glyph: "◇", bg: "linear-gradient(135deg,#0b0716,#a855f7,#22d3ee)", glow: "rgba(168,85,247,0.32)" },
  glow_effect: { glyph: "✺", bg: "radial-gradient(circle,#fff 0 10%,#ec4899 24%,#a855f7 58%,#090512 100%)", glow: "rgba(236,72,153,0.35)" },
  sticker_pack: { glyph: "✿", bg: "linear-gradient(135deg,#22d3ee,#6366f1,#a855f7)", glow: "rgba(34,211,238,0.3)" },
  badge: { glyph: "♛", bg: "linear-gradient(135deg,#fbbf24,#a855f7,#ec4899)", glow: "rgba(251,191,36,0.34)" },
  nft: { glyph: "⬡", bg: "linear-gradient(135deg,#00f5d4,#a855f7,#fbbf24)", glow: "rgba(0,245,212,0.32)" },
};

function StoreCategoryLogo({ id, active = false }: { id: StoreFilter; active?: boolean }) {
  const logo = CATEGORY_LOGOS[id] ?? CATEGORY_LOGOS.all;
  return (
    <span
      className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[12px] font-black text-white"
      style={{ background: logo.bg, boxShadow: active ? `0 0 16px ${logo.glow}` : `0 0 10px ${logo.glow}` }}
    >
      {logo.glyph}
    </span>
  );
}

export default function StorePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [transactions, setTransactions] = useState<{ id: string; delta: number; reason: string; referenceId?: string | null; createdAt: string }[]>([]);
  const [category, setCategory] = useState<StoreFilter>("all");
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.getStoreItems().catch(() => []),
      api.getCoinTransactions().catch(() => []),
    ]).then(([data, ledger]) => {
      if (!active) return;
      const owned = new Set(user?.ownedItems ?? []);
      setItems((data || []).map((d) => ({ ...d, owned: d.owned || owned.has(d.id), applied: Boolean(d.applied) })));
      setTransactions(ledger);
      setLoading(false);
    });
    return () => { active = false; };
  }, [user?.ownedItems]);

  const dropItems = useMemo(() => items.filter((item) => Boolean(item.dropStartsAt || item.dropEndsAt || item.stockTotal)), [items]);
  const liveDrops = useMemo(() => dropItems.filter((item) => {
    const starts = item.dropStartsAt ? new Date(item.dropStartsAt).getTime() : null;
    const ends = item.dropEndsAt ? new Date(item.dropEndsAt).getTime() : null;
    const soldOut = item.stockTotal !== null && item.stockTotal !== undefined && (item.stockSold ?? 0) >= item.stockTotal;
    return !soldOut && (!starts || starts <= nowTick) && (!ends || ends >= nowTick);
  }), [dropItems, nowTick]);
  const featuredDrop = liveDrops[0] ?? dropItems.find((item) => item.dropStartsAt && new Date(item.dropStartsAt).getTime() > nowTick) ?? null;

  const filtered = useMemo(
    () => category === "all" ? items : category === "drops" ? dropItems : items.filter((i) => i.category === category),
    [items, dropItems, category],
  );

  function handleApplied(item: StoreItem, applied: boolean) {
    const family = (item.effectType === "nft" || item.effectType === "profile_background" || item.category === "nft") ? ["nft", "profile_background"] : [item.effectType || item.category];
    setItems((prev) => prev.map((entry) => {
      const entryKey = entry.effectType || entry.category;
      if (entry.id === item.id) return { ...entry, ...item, owned: true, applied };
      if (applied && (entry.category === item.category || family.includes(entryKey) || (family.includes("nft") && entry.category === "nft"))) return { ...entry, applied: false };
      return entry;
    }));
  }

  return (
    <div className="relative max-w-6xl mx-auto px-4">
      <AuroraBackground intensity={0.32} className="absolute top-0 left-0 right-0 h-[42vh] -z-10" />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="font-display font-bold text-3xl flex items-center gap-2">
          Магазин <Sparkles size={22} className="text-neon-purple" />
        </h1>
        <p className="text-sm text-white/45">Прокачай свой профиль</p>
      </motion.div>

      {featuredDrop && (
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="mb-6 relative overflow-hidden rounded-4xl glass-strong p-5 md:p-6 shadow-glow-lg"
        >
          <div className="absolute inset-0 opacity-80" style={{ background: "radial-gradient(circle at 12% 20%, rgba(251,191,36,0.22), transparent 38%), radial-gradient(circle at 92% 78%, rgba(168,85,247,0.22), transparent 42%)" }} />
          <div className="relative grid gap-5 md:grid-cols-[1fr_260px] md:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">
                <Flame size={14} /> Featured Night Drop
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-white">{featuredDrop.name}</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/58">{featuredDrop.description || "Лимитированная коллекция NightGram: успей забрать до окончания drop-а."}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => setCategory("drops")} className="btn-glow px-4 py-2.5 text-sm">Смотреть Drops</button>
                <div className="rounded-2xl glass px-3 py-2 text-sm text-white/70">
                  <Clock3 size={14} className="mr-1 inline text-neon-gold" /> <DropCountdown item={featuredDrop} now={nowTick} />
                </div>
                {featuredDrop.stockTotal !== null && featuredDrop.stockTotal !== undefined && (
                  <div className="rounded-2xl glass px-3 py-2 text-sm text-white/70">
                    <PackageCheck size={14} className="mr-1 inline text-neon-purple" /> {featuredDrop.stockSold ?? 0}/{featuredDrop.stockTotal}
                  </div>
                )}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-3xl bg-black/35 aspect-[4/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={featuredDrop.previewUrl} alt={featuredDrop.name} className="h-full w-full object-cover mix-blend-screen opacity-85" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-neon-purple to-neon-gold" style={{ width: `${featuredDrop.stockTotal ? Math.min(100, ((featuredDrop.stockSold ?? 0) / Math.max(1, featuredDrop.stockTotal)) * 100) : 38}%` }} />
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Quick links to Premium / Coins */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <Link href="/store/premium?tab=premium" className="group relative overflow-visible rounded-2xl glass-strong p-4 flex items-center gap-3 transition hover:scale-[1.02]">
          <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>
            <Crown size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm" style={{ color: "#fbbf24" }}>Premium от 230₽</div>
            <div className="text-xs text-white/45">Темы, рамки, glow и многое другое</div>
          </div>
        </Link>
        <Link href="/store/premium?tab=coins" className="group relative overflow-visible rounded-2xl glass-strong p-4 flex items-center gap-3 transition hover:scale-[1.02]">
          <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(251,191,36,0.12)" }}>
            <Sparkles size={20} className="fill-neon-gold text-neon-gold" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm text-neon-gold">NightCoins от 70₽</div>
            <div className="text-xs text-white/45">Внутренняя валюта для покупок</div>
          </div>
        </Link>
      </div>

      {transactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-3xl glass-strong p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <ReceiptText size={16} className="text-neon-purple" /> Журнал NightCoins
            </div>
            <span className="text-[11px] text-white/35">последние операции</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {transactions.slice(0, 4).map((tx) => (
              <div key={tx.id} className="rounded-2xl glass px-3 py-2">
                <div className={cn("text-sm font-bold", tx.delta >= 0 ? "text-emerald-300" : "text-neon-gold")}>{tx.delta >= 0 ? "+" : ""}{tx.delta} ✦</div>
                <div className="text-xs text-white/45 truncate">{tx.reason === "purchase" ? "Покупка в магазине" : tx.reason}</div>
                <div className="text-[10px] text-white/30">{new Date(tx.createdAt).toLocaleDateString("ru-RU")}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

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
            <StoreCategoryLogo id={c.id} active={category === c.id} /> {c.label}
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
        <>
          <AnimatePresence mode="wait">
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.985 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
            >
              {filtered.map((item, i) => (
                <StoreCard key={item.id} item={item} index={i} onApplied={handleApplied} />
              ))}
            </motion.div>
          </AnimatePresence>

          <motion.div
            key={`${category}-market-end`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 py-12 text-center"
          >
            <div className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-neon-purple/25 bg-white/[0.04] shadow-glow">
              <motion.div
                className="absolute -inset-4"
                style={{ background: "conic-gradient(from 0deg,#a855f7,#ec4899,#22d3ee,#fbbf24,#a855f7)" }}
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              />
              <div className="absolute inset-[3px] rounded-[1rem] bg-[#070311]/88 backdrop-blur-sm" />
              <Sparkles size={22} className="relative z-10 text-neon-purple" />
            </div>
            <p className="font-medium text-white/62">Ты дошёл до конца маркета ✦</p>
            <p className="max-w-md text-sm text-white/40">
              Новые темы, NFT, рамки и drops будут появляться здесь — заглядывай позже.
            </p>
          </motion.div>
        </>
      )}
    </div>
  );
}
function DropCountdown({ item, now }: { item: StoreItem; now: number }) {
  const starts = item.dropStartsAt ? new Date(item.dropStartsAt).getTime() : null;
  const ends = item.dropEndsAt ? new Date(item.dropEndsAt).getTime() : null;
  const target = starts && starts > now ? starts : ends;
  if (!target) return <>Limited Drop</>;
  const diff = target - now;
  if (diff <= 0) return starts && starts > now ? <>Стартует</> : <>Завершён</>;
  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const label = starts && starts > now ? "до старта" : "до конца";
  return <>{label}: {days > 0 ? `${days}д ` : ""}{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</>;
}
