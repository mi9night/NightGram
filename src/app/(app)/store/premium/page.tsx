"use client";

// =============================================================================
//  NightGram Web — Premium & NightCoins purchase page
// =============================================================================

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Crown, Sparkles, TrendingDown, Check, Palette, Image, Zap, Star, Shield, Award, Gift, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PaymentModal, type PaymentItem } from "@/components/store/PaymentModal";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { GlowAvatar } from "@/components/shared/GlowAvatar";

// ---- Premium plans ----
interface PremiumPlan { id: string; duration: string; price: number; perMonth: number; discount: number; months: number; fullPrice?: number; best?: boolean }
const PREMIUM_PLANS: PremiumPlan[] = [
  { id: "1month", duration: "1 месяц", price: 230, perMonth: 230, discount: 0, months: 1 },
  { id: "1year", duration: "1 год", price: 1390, perMonth: 116, discount: 54, months: 12, fullPrice: 3000, best: true },
  { id: "2year", duration: "2 года", price: 2490, perMonth: 104, discount: 55, months: 24, fullPrice: 5500 },
];

// ---- NightCoins packs ----
interface CoinPack { coins: number; price: number; discount: number; best?: boolean }
const COIN_PACKS: CoinPack[] = [
  { coins: 50, price: 70, discount: 0 },
  { coins: 75, price: 100, discount: 5 },
  { coins: 100, price: 120, discount: 0 },
  { coins: 250, price: 280, discount: 7 },
  { coins: 500, price: 520, discount: 13 },
  { coins: 750, price: 750, discount: 17 },
  { coins: 1000, price: 960, discount: 20 },
  { coins: 2500, price: 2200, discount: 27, best: true },
  { coins: 5000, price: 4100, discount: 32 },
  { coins: 10000, price: 7500, discount: 38 },
  { coins: 25000, price: 16500, discount: 45 },
];

// ---- Premium benefits (large cards) ----
const BENEFITS: { icon: LucideIcon; title: string; desc: string; color: string }[] = [
  { icon: Palette, title: "Все темы", desc: "15 уникальных тем оформления — меняй внешний вид всего сайта под себя.", color: "#a855f7" },
  { icon: Image, title: "Анимированные рамки", desc: "Эксклюзивные анимированные рамки для твоего аватара в профиле и ленте.", color: "#ec4899" },
  { icon: Sparkles, title: "Glow-эффекты", desc: "Свечение ника, постов и профиля. Выделяйся среди других пользователей.", color: "#8b5cf6" },
  { icon: Star, title: "30 цветов имени", desc: "Выбирай из готовой премиальной палитры — от лунного белого до cyber-mint.", color: "#fbbf24" },
  { icon: Zap, title: "2× NightCoins", desc: "Получай вдвое больше звёзд при каждой покупке в магазине.", color: "#22d3ee" },
  { icon: Crown, title: "Бейдж Premium", desc: "Особый значок короны рядом с твоим ником — все увидят твой статус.", color: "#f59e0b" },
  { icon: Shield, title: "Увеличенные файлы", desc: "Загружай файлы до 250 МБ вместо стандартных 50 МБ в постах и сообщениях.", color: "#10b981" },
  { icon: Gift, title: "Ранний доступ", desc: "Первым получай новые функции, темы и эксклюзивные дропы.", color: "#6366f1" },
];

export default function PremiumPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] grid place-items-center"><div className="h-10 w-10 rounded-full border-2 border-neon-purple/30 border-t-neon-purple animate-spin" /></div>}>
      <PremiumPageContent />
    </Suspense>
  );
}

function PremiumPageContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "coins" ? "coins" : "premium";
  const [tab, setTab] = useState<"premium" | "coins">(initialTab);
  const [paymentItem, setPaymentItem] = useState<PaymentItem | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [giftMode, setGiftMode] = useState<"self" | "friend">("self");
  const [giftQuery, setGiftQuery] = useState("");
  const [giftResults, setGiftResults] = useState<Record<string, unknown>[]>([]);
  const [giftRecipient, setGiftRecipient] = useState<Record<string, unknown> | null>(null);

  const ngId = user ? String(user.ngId).padStart(8, "0") : "00000000";
  const displayId = user?.customId ? `@${user.customId}` : `#${ngId}`;
  const giftTargetName = giftRecipient ? String(giftRecipient.username ?? "") : "";
  const giftTargetId = giftRecipient ? String(giftRecipient.id ?? "") : undefined;
  const giftTargetNgId = giftRecipient ? Number(giftRecipient.ngId ?? giftRecipient.ng_id ?? 0) : undefined;

  useEffect(() => {
    if (giftMode !== "friend" || giftQuery.trim().length < 2) {
      setGiftResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api.searchUsers(giftQuery.trim()).then((data) => setGiftResults(data as Record<string, unknown>[])).catch(() => setGiftResults([]));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [giftMode, giftQuery]);

  function buildGiftFields() {
    return giftMode === "friend" && giftTargetId
      ? { giftRecipientId: giftTargetId, giftRecipientName: giftTargetName, giftRecipientNgId: giftTargetNgId }
      : {};
  }

  function buyPremium(plan: PremiumPlan) {
    if (giftMode === "friend" && !giftTargetId) return;
    setPaymentItem({ title: `Premium — ${plan.duration}`, subtitle: giftMode === "friend" ? "Подарок Premium" : "Подписка NightGram", price: plan.price, itemType: "premium", ...buildGiftFields() });
    setPaymentOpen(true);
  }

  function buyCoins(pack: CoinPack) {
    if (giftMode === "friend" && !giftTargetId) return;
    setPaymentItem({ title: `${pack.coins} NightCoins`, subtitle: giftMode === "friend" ? "Подарок NightCoins" : "Покупка звёзд", price: pack.price, itemType: "coins", ...buildGiftFields() });
    setPaymentOpen(true);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 pb-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-3"
          style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)" }}>
          <Crown size={16} className="text-neon-gold" />
          <span className="text-sm font-semibold" style={{ color: "#fbbf24" }}>NightGram Premium</span>
        </div>
        <h1 className="font-display font-bold text-3xl">Поддержи проект и получи больше</h1>
        <p className="text-white/50 text-sm mt-2 max-w-md mx-auto">
          Выбери подписку или звёзды — все способы оплаты принимают карты РФ и зарубежные
        </p>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 justify-center">
        <TabButton active={tab === "premium"} onClick={() => setTab("premium")} icon={Crown} label="Premium" />
        <TabButton active={tab === "coins"} onClick={() => setTab("coins")} icon={Sparkles} label="NightCoins" />
      </div>

      <div className="mb-6 rounded-3xl glass-strong p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/75">
          <Gift size={16} className="text-neon-gold" /> Кому покупаем?
        </div>
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setGiftMode("self"); setGiftRecipient(null); }} className={giftMode === "self" ? "btn-glow py-2.5 text-sm" : "btn-ghost py-2.5 text-sm"}>Себе</button>
            <button onClick={() => setGiftMode("friend")} className={giftMode === "friend" ? "btn-glow py-2.5 text-sm" : "btn-ghost py-2.5 text-sm"}>Другу</button>
          </div>
          {giftMode === "self" ? (
            <div className="rounded-2xl glass px-3 py-2 text-sm text-white/60">Покупка будет активирована на твоём аккаунте {displayId}</div>
          ) : (
            <div className="relative">
              {giftRecipient ? (
                <div className="flex items-center gap-3 rounded-2xl glass px-3 py-2">
                  <GlowAvatar src={(giftRecipient.avatarUrl as string) ?? (giftRecipient.avatar_url as string) ?? null} alt={giftTargetName} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white/80 truncate">@{giftTargetName}</div>
                    <div className="text-[11px] text-white/35">#{String(giftTargetNgId || "").padStart(8, "0")}</div>
                  </div>
                  <button onClick={() => { setGiftRecipient(null); setGiftQuery(""); }} className="grid h-8 w-8 place-items-center rounded-xl glass text-white/45 hover:text-white"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                  <input value={giftQuery} onChange={(e) => setGiftQuery(e.target.value)} placeholder="Найти пользователя для подарка…" className="ng-input py-2.5 pl-8 text-sm" />
                  {giftResults.length > 0 && (
                    <div className="ng-select-scroll absolute left-0 right-0 top-12 z-30 max-h-56 overflow-y-auto rounded-3xl border border-neon-purple/30 bg-[#090512] p-1.5 pr-3 shadow-[0_0_34px_rgba(168,85,247,0.28)]">
                      {giftResults.map((u) => (
                        <button key={String(u.id)} onClick={() => { setGiftRecipient(u); setGiftQuery(String(u.username ?? "")); setGiftResults([]); }} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm text-white/70 hover:bg-white/8 hover:text-white">
                          <GlowAvatar src={(u.avatarUrl as string) ?? (u.avatar_url as string) ?? null} alt={String(u.username ?? "")} size={28} />
                          <span className="min-w-0 flex-1 truncate">@{String(u.username ?? "")}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        {giftMode === "friend" && !giftRecipient && <div className="mt-2 text-[11px] text-amber-200/80">Выбери получателя, чтобы купить подарок.</div>}
      </div>

      {/* ===== PREMIUM ===== */}
      {tab === "premium" && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          {user?.isPremium && (
            <div className="rounded-2xl glass-strong p-4 flex items-center gap-3" style={{ boxShadow: "0 0 20px rgba(251,191,36,0.2)" }}>
              <div className="h-10 w-10 rounded-xl grid place-items-center" style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>
                <Crown size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm" style={{ color: "#fbbf24" }}>Premium активирован</div>
                <div className="text-xs text-white/50">Спасибо за поддержку NightGram!</div>
              </div>
            </div>
          )}

          {/* Plans — 3 large cards */}
          <div className="grid md:grid-cols-3 gap-4">
            {PREMIUM_PLANS.map((plan) => (
              <motion.div
                key={plan.id}
                whileHover={{ y: -4 }}
                className={cn(
                  "relative rounded-3xl p-5 flex flex-col items-center text-center transition overflow-visible",
                  plan.best ? "gradient-border glass-strong" : "glass",
                )}
                style={plan.best ? { boxShadow: "0 0 30px rgba(251,191,36,0.15)" } : undefined}
              >
                {plan.best && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-0.5 text-[10px] font-bold whitespace-nowrap"
                    style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#1a1206" }}>
                    🔥 ВЫГОДНО
                  </span>
                )}

                <div className="h-14 w-14 rounded-2xl grid place-items-center mb-3" style={{ background: "rgba(251,191,36,0.12)" }}>
                  <Crown size={26} style={{ color: "#fbbf24" }} />
                </div>

                <div className="font-display font-bold text-lg">{plan.duration}</div>

                <div className="mt-2 mb-1">
                  <span className="font-display font-bold text-3xl" style={{ color: "#fbbf24" }}>{plan.price}</span>
                  <span className="text-lg text-white/50">₽</span>
                </div>

                <div className="text-xs text-white/50">
                  {plan.perMonth}₽ / мес
                </div>

                {plan.discount > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80" }}>
                    <TrendingDown size={11} /> Выгода −{plan.discount}%
                  </div>
                )}

                {plan.discount > 0 && plan.fullPrice && (
                  <div className="text-[11px] text-white/30 mt-1 line-through">
                    {plan.fullPrice}₽
                  </div>
                )}

                <button
                  onClick={() => buyPremium(plan)}
                  disabled={giftMode === "friend" && !giftRecipient}
                  className="btn-glow w-full mt-4 py-2.5 text-sm disabled:opacity-45"
                  style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}
                >
                  {giftMode === "friend" ? "Подарить" : "Купить"}
                </button>
              </motion.div>
            ))}
          </div>

          {/* Benefits — large individual cards */}
          <div className="mt-8">
            <h3 className="font-display font-bold text-xl mb-4 text-center">Что входит в Premium</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {BENEFITS.map((b, i) => {
                const Icon = b.icon;
                return (
                  <motion.div
                    key={b.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ y: -3 }}
                    className="glass rounded-2xl p-4 flex flex-col items-center text-center gap-2 transition"
                  >
                    <div className="h-12 w-12 rounded-2xl grid place-items-center shrink-0"
                      style={{ background: `${b.color}1a`, boxShadow: `0 0 16px ${b.color}22` }}>
                      <Icon size={22} style={{ color: b.color }} />
                    </div>
                    <div className="font-semibold text-sm">{b.title}</div>
                    <div className="text-[11px] text-white/50 leading-relaxed">{b.desc}</div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ===== NIGHTCOINS ===== */}
      {tab === "coins" && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Current balance */}
          {user && (
            <div className="rounded-2xl glass-strong p-4 flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl grid place-items-center" style={{ background: "rgba(251,191,36,0.1)" }}>
                <Sparkles size={20} className="fill-neon-gold text-neon-gold" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-white/45">Твой баланс</div>
                <div className="font-display font-bold text-xl text-neon-gold">{user.nightCoins.toLocaleString("ru-RU")} ✦</div>
              </div>
            </div>
          )}

          <p className="text-sm text-white/50 ml-1 mb-2">
            NightCoins — внутренняя валюта для покупок в магазине. Больше звёзд — выгоднее курс.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {COIN_PACKS.map((pack) => (
              <motion.div
                key={pack.coins}
                whileHover={{ y: -3 }}
                className={cn(
                  "relative rounded-2xl p-4 flex flex-col items-center text-center transition overflow-visible",
                  pack.best ? "gradient-border glass-strong" : "glass",
                )}
              >
                {pack.best && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-bold whitespace-nowrap"
                    style={{ background: "linear-gradient(135deg,#a855f7,#8b5cf6)", color: "#fff" }}>
                    ⭐ ХИТ
                  </span>
                )}

                <div className="h-11 w-11 rounded-xl grid place-items-center mb-2" style={{ background: "rgba(251,191,36,0.1)" }}>
                  <Sparkles size={20} className="fill-neon-gold text-neon-gold" />
                </div>

                <div className="font-bold text-lg">{pack.coins.toLocaleString("ru-RU")} ✦</div>

                {pack.discount > 0 && (
                  <div className="text-[11px] mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80" }}>
                    <TrendingDown size={10} /> −{pack.discount}%
                  </div>
                )}

                <div className="mt-2">
                  <span className="font-display font-bold text-xl" style={{ color: "#fbbf24" }}>{pack.price}</span>
                  <span className="text-sm text-white/50">₽</span>
                </div>

                <button
                  onClick={() => buyCoins(pack)}
                  disabled={giftMode === "friend" && !giftRecipient}
                  className="btn-glow w-full mt-3 py-2 text-sm disabled:opacity-45"
                >
                  {giftMode === "friend" ? "Подарить" : "Купить"}
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      <PaymentModal
        open={paymentOpen}
        item={paymentItem}
        ngId={displayId}
        onClose={() => setPaymentOpen(false)}
      />
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition",
        active ? "btn-glow" : "glass text-white/55 hover:text-white",
      )}
    >
      <Icon size={16} /> {label}
    </button>
  );
}
