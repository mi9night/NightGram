"use client";

// =============================================================================
//  BalanceDropdown — expandable panel with coins + premium
//  Notification bell sits ON TOP (higher z-index)
// =============================================================================

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Crown, ChevronDown, Plus, Clock, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export function BalanceDropdown() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeBoosts, setActiveBoosts] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open || !user?.isPremium) return;
    let active = true;
    api.getMyChannelBoosts()
      .then((boosts) => {
        if (active) setActiveBoosts(boosts.length);
      })
      .catch(() => active && setActiveBoosts(0));
    return () => { active = false; };
  }, [open, user?.isPremium]);

  if (!user) return null;

  // Format premium end date
  const premiumEnd = user.premiumUntil ? new Date(user.premiumUntil) : null;
  const premiumEndStr = premiumEnd
    ? premiumEnd.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const freeBoosts = user.boostBalance ?? 0;
  const totalBoosts = freeBoosts + activeBoosts;

  return (
    <div className="relative" ref={ref}>
      {/* Trigger — combined coins + premium pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full glass px-3 py-1.5 text-sm transition hover:brightness-125"
      >
        <span className="flex items-center gap-1.5 text-neon-gold font-semibold">
          <Sparkles size={14} className="fill-neon-gold text-neon-gold" />
          {(user.nightCoins ?? 0).toLocaleString("ru-RU")}
        </span>

        <span className="h-4 w-px bg-white/15" />

        {user.isPremium ? (
          <span className="flex items-center gap-1 font-semibold" style={{ color: "#fbbf24" }}>
            <Crown size={13} className="fill-[#fbbf24]" /> Premium
          </span>
        ) : (
          <span className="flex items-center gap-1 text-white/50 font-medium">
            <Crown size={13} /> Premium
          </span>
        )}

        <ChevronDown size={14} className={cn("text-white/40 transition", open ? "rotate-180" : "")} />
      </button>

      {/* Dropdown — notification bell on top */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 z-[60] w-72 ng-solid rounded-2xl shadow-glow-lg"
          >
            {/* Balance */}
            <div className="p-4 border-b ng-divider">
              <div className="text-xs text-white/45 mb-1">Твой баланс</div>
              <span className="font-display font-bold text-2xl text-neon-gold">
                {(user.nightCoins ?? 0).toLocaleString("ru-RU")} ✦
              </span>
              <Link
                href="/store/premium?tab=coins"
                onClick={() => setOpen(false)}
                className="mt-3 btn-glow w-full py-2 text-xs flex items-center justify-center gap-1.5"
              >
                <Plus size={13} /> Пополнить звёзды
              </Link>
            </div>

            {/* Premium — always shows status + date + buy button */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/45">Premium</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={
                    user.isPremium
                      ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24" }
                      : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
                  }
                >
                  {user.isPremium ? "Активен" : "Не активен"}
                </span>
              </div>

              {user.isPremium && premiumEndStr ? (
                <div className="mb-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-white/40" />
                    <span className="text-[11px] text-white/50">До {premiumEndStr}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl glass px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[11px] text-white/55">
                      <Zap size={12} className="text-neon-gold" /> Бусты
                    </span>
                    <span className="text-[11px] font-semibold text-neon-gold">
                      {freeBoosts} свободно / {totalBoosts} всего
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-white/50 mb-3">Подписка не активирована</p>
              )}

              {/* Buy/extend button — always visible */}
              <Link
                href="/store/premium?tab=premium"
                onClick={() => setOpen(false)}
                className="block rounded-xl p-3 text-center text-sm font-semibold transition hover:brightness-110"
                style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#1a1206" }}
              >
                <Crown size={14} className="inline mr-1" />
                {user.isPremium ? "Продлить Premium" : "Купить Premium"}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
