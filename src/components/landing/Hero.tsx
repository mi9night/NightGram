"use client";

// =============================================================================
//  Landing — Hero section (Russian)
// =============================================================================

import { motion } from "framer-motion";
import Link from "next/link";
import { Apple, Smartphone, LogIn, UserPlus, ChevronDown } from "lucide-react";
import { AuroraBackground } from "@/components/shared/AuroraBackground";
import { NightGramWordmark } from "@/components/shared/NightGramLogo";
import { PhoneMockup } from "./PhoneMockup";

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-12">
      <AuroraBackground intensity={1.3} />

      <div className="relative z-10 max-w-6xl w-full grid lg:grid-cols-2 gap-12 items-center">
        {/* Left — copy */}
        <div className="text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
            className="inline-flex items-center gap-2 rounded-full glass px-4 py-2 mb-6"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-purple opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-neon-purple" />
            </span>
            <span className="text-sm text-white/80">Открытая бета</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 70, damping: 14 }}
            className="font-display font-extrabold leading-[1.05] tracking-tight"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
          >
            Будущее
            <br />
            <span className="text-gradient">социальных</span>
            <br />
            <span className="text-gradient">сетей</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6 text-lg text-white/65 max-w-md mx-auto lg:mx-0"
          >
            NightGram — это тёмная неоновая платформа с лентой постов,
            мессенджером в реальном времени и премиум-маркетплейсом.
            Один аккаунт — синхронизация на всех устройствах.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-9 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
          >
            <Link href="/register" className="btn-glow px-6 py-3.5 inline-flex items-center justify-center gap-2">
              <UserPlus size={18} /> Регистрация
            </Link>
            <Link href="/login" className="btn-ghost px-6 py-3.5 inline-flex items-center justify-center gap-2">
              <LogIn size={18} /> Войти
            </Link>
          </motion.div>

          {/* App Store / Google Play */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="mt-4 flex gap-3 justify-center lg:justify-start"
          >
            <div className="relative">
              <span className="absolute -top-2 -right-2 z-10 rounded-full bg-neon-purple text-[9px] font-bold px-2 py-0.5 shadow-glow">Скоро</span>
              <div className="glass rounded-2xl px-4 py-2.5 inline-flex items-center gap-2 cursor-default opacity-80">
                <Apple size={20} className="text-white/60" />
                <div className="text-left leading-tight">
                  <div className="text-[9px] text-white/50">Скачать в</div>
                  <div className="text-sm font-semibold">App Store</div>
                </div>
              </div>
            </div>
            <div className="relative">
              <span className="absolute -top-2 -right-2 z-10 rounded-full bg-neon-purple text-[9px] font-bold px-2 py-0.5 shadow-glow">Скоро</span>
              <div className="glass rounded-2xl px-4 py-2.5 inline-flex items-center gap-2 cursor-default opacity-80">
                <Smartphone size={20} className="text-white/60" />
                <div className="text-left leading-tight">
                  <div className="text-[9px] text-white/50">Скачать в</div>
                  <div className="text-sm font-semibold">Google Play</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right — glass logo card + phone */}
        <div className="relative flex flex-col items-center gap-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 80, damping: 12 }}
            className="gradient-border p-6 rounded-4xl glass-strong"
          >
            <NightGramWordmark size={48} />
            <p className="mt-2 text-sm text-white/60">Ночь, переосмысленная.</p>
          </motion.div>

          <PhoneMockup />
        </div>
      </div>

      {/* scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40"
      >
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>
          <ChevronDown size={28} />
        </motion.div>
      </motion.div>
    </section>
  );
}
