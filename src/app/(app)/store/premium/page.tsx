"use client";

// =============================================================================
//  NightGram Web — Premium & NightCoins purchase page
// =============================================================================

import { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Sparkles, TrendingDown, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PaymentModal, type PaymentItem } from "@/components/store/PaymentModal";
import { cn } from "@/lib/utils";

// ---- Premium plans ----
const PREMIUM_PLANS: {
  id: string;
  duration: string;
  price: number;
  perMonth: number;
  discount: number;
  best?: boolean;
}[] = [
  { id: "1month", duration: "1 месяц", price: 230, perMonth: 230, discount: 0 },
  { id: "1year", duration: "1 год", price: 1390, perMonth: 116, discount: 54, best: true },
  { id: "2year", duration: "2 года", price: 2490, perMonth: 104, discount: 58 },
];

// ---- NightCoins packs ----
// 100 coins = 120₽ → 1 coin ≈ 1.2₽. Bigger packs = cheaper.
const COIN_PACKS: {
  coins: number;
  price: number;
  discount: number;
  best?: boolean;
}[] = [
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

export default function PremiumPage() {
  const { user } = useAuth();
  const [paymentItem, setPaymentItem] = useState<PaymentItem | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [tab, setTab] = useState<"premium" | "coins">("premium");

  const ngId = user ? String(user.ngId).padStart(8, "0") : "00000000";
  const displayId = user?.customId ? `@${user.customId}` : `#${ngId}`;

  function buyPremium(plan: (typeof PREMIUM_PLANS)[number]) {
    setPaymentItem({
      title: `Premium — ${plan.duration}`,
      subtitle: "Подписка NightGram",
      price: plan.price,
    });
    setPaymentOpen(true);
  }

  function buyCoins(pack: (typeof COIN_PACKS)[number]) {
    setPaymentItem({
      title: `${pack.coins} NightCoins`,
      subtitle: "Покупка звёзд",
      price: pack.price,
    });
    setPaymentOpen(true);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12">
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <TabButton active={tab === "premium"} onClick={() => setTab("premium")} icon={Crown} label="Premium" />
        <TabButton active={tab === "coins"} onClick={() => setTab("coins")} icon={Sparkles} label="NightCoins" />
      </div>

      {/* Premium plans */}
      {tab === "premium" && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Status */}
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

          {/* Plans */}
          {PREMIUM_PLANS.map((plan) => (
            <motion.div
              key={plan.id}
              whileHover={{ scale: 1.01 }}
              className={cn(
                "relative rounded-3xl p-5 flex items-center gap-4 transition",
                plan.best ? "gradient-border glass-strong" : "glass",
              )}
            >
              {plan.best && (
                <span className="absolute -top-2.5 right-5 rounded-full px-3 py-0.5 text-[10px] font-bold" style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#1a1206" }}>
                  ВЫГОДНО
                </span>
              )}

              <div className="h-12 w-12 rounded-2xl grid place-items-center shrink-0" style={{ background: "rgba(251,191,36,0.12)" }}>
                <Crown size={22} style={{ color: "#fbbf24" }} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-lg">{plan.duration}</div>
                <div className="text-xs text-white/50 mt-0.5">
                  {plan.perMonth}₽ / мес
                  {plan.discount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-green-400">
                      <TrendingDown size={11} /> −{plan.discount}%
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-display font-bold text-xl" style={{ color: "#fbbf24" }}>{plan.price}₽</div>
                {plan.discount > 0 && (
                  <div className="text-[11px] text-white/35 line-through">
                    {Math.round(plan.perMonth * 12 * (plan.id === "2year" ? 2 : 1))}₽
                  </div>
                )}
              </div>

              <button
                onClick={() => buyPremium(plan)}
                className="btn-glow px-5 py-2.5 text-sm shrink-0"
                style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}
              >
                Купить
              </button>
            </motion.div>
          ))}

          {/* Benefits */}
          <div className="rounded-3xl glass p-5 mt-6">
            <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
              <Crown size={16} style={{ color: "#fbbf24" }} /> Что входит в Premium:
            </h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                "Все темы и цветовые пакеты",
                "Анимированные рамки аватара",
                "Glow-эффекты для ника и постов",
                "15 цветов имени",
                "2× NightCoins при покупках",
                "Эксклюзивный бейдж Premium",
                "Приоритетная загрузка ленты",
                "Ранний доступ к новым фичам",
              ].map((b) => (
                <div key={b} className="flex items-center gap-2 text-xs text-white/70">
                  <Check size={14} className="text-green-400 shrink-0" /> {b}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* NightCoins packs */}
      {tab === "coins" && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <p className="text-sm text-white/50 ml-1 mb-2">
            NightCoins — внутренняя валюта для покупок в Night Store. Больше звёзд — выгоднее курс.
          </p>

          {COIN_PACKS.map((pack) => (
            <motion.div
              key={pack.coins}
              whileHover={{ scale: 1.01 }}
              className={cn(
                "relative rounded-2xl p-4 flex items-center gap-4 transition",
                pack.best ? "gradient-border glass-strong" : "glass",
              )}
            >
              {pack.best && (
                <span className="absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{ background: "linear-gradient(135deg,#a855f7,#8b5cf6)", color: "#fff" }}>
                  ХИТ
                </span>
              )}

              <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(251,191,36,0.1)" }}>
                <Sparkles size={20} className="fill-neon-gold text-neon-gold" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-bold text-base">{pack.coins.toLocaleString("ru-RU")} ✦</div>
                {pack.discount > 0 && (
                  <div className="text-xs text-green-400 flex items-center gap-1 mt-0.5">
                    <TrendingDown size={11} /> Выгода {pack.discount}% vs базовой цены
                  </div>
                )}
              </div>

              <div className="text-right shrink-0">
                <div className="font-display font-bold text-lg" style={{ color: "#fbbf24" }}>{pack.price}₽</div>
              </div>

              <button
                onClick={() => buyCoins(pack)}
                className="btn-glow px-4 py-2 text-sm shrink-0"
              >
                Купить
              </button>
            </motion.div>
          ))}
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
        "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition",
        active
          ? "btn-glow"
          : "glass text-white/55 hover:text-white",
      )}
    >
      <Icon size={16} /> {label}
    </button>
  );
}
