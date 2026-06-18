"use client";

// =============================================================================
//  BalanceDropdown — expandable panel showing NightCoins + Premium status
// =============================================================================

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Crown, ChevronDown, Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function BalanceDropdown() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      {/* Trigger — combined coins + premium pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full glass px-3 py-1.5 text-sm transition hover:brightness-125"
      >
        {/* Coins */}
        <span className="flex items-center gap-1.5 text-neon-gold font-semibold">
          <Sparkles size={14} className="fill-neon-gold text-neon-gold" />
          {user.nightCoins.toLocaleString("ru-RU")}
        </span>

        {/* Divider */}
        <span className="h-4 w-px bg-white/15" />

        {/* Premium */}
        {user.isPremium ? (
          <span className="flex items-center gap-1 font-semibold" style={{ color: "#fbbf24" }}>
            <Crown size={13} className="fill-[#fbbf24]" /> Premium
          </span>
        ) : (
          <span className="flex items-center gap-1 text-white/50 font-medium">
            <Crown size={13} /> Premium
          </span>
        )}

        <ChevronDown
          size={14}
          className={`text-white/40 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 z-[70] w-72 ng-solid rounded-2xl overflow-hidden shadow-glow-lg"
          >
            {/* Balance */}
            <div className="p-4 border-b ng-divider">
              <div className="text-xs text-white/45 mb-1">Твой баланс</div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-2xl text-neon-gold">
                  {user.nightCoins.toLocaleString("ru-RU")} ✦
                </span>
              </div>
              <Link
                href="/store/premium?tab=coins"
                onClick={() => setOpen(false)}
                className="mt-3 btn-glow w-full py-2 text-xs flex items-center justify-center gap-1.5"
              >
                <Plus size={13} /> Пополнить звёзды
              </Link>
            </div>

            {/* Premium status */}
            <div className="p-4 border-b ng-divider">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/45">Premium</span>
                {user.isPremium ? (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                    Активен
                  </span>
                ) : (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                    Не активен
                  </span>
                )}
              </div>
              {user.isPremium ? (
                <p className="text-xs text-white/50">Спасибо за поддержку! Все функции разблокированы.</p>
              ) : (
                <Link
                  href="/store/premium?tab=premium"
                  onClick={() => setOpen(false)}
                  className="block mt-2 rounded-xl p-3 text-center text-sm font-semibold transition hover:brightness-110"
                  style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#1a1206" }}
                >
                  <Crown size={14} className="inline mr-1" /> Купить Premium от 230₽
                </Link>
              )}
            </div>

            {/* Quick links */}
            <div className="p-2">
              <Link
                href="/store/premium"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-white/5 transition"
              >
                <span className="flex items-center gap-2 text-white/70">
                  <Sparkles size={14} /> Все способы оплаты
                </span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
