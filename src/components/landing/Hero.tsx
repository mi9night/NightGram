"use client";

// =============================================================================
//  Landing — Hero section
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
            <span className="text-sm text-white/80">Now in open beta</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 70, damping: 14 }}
            className="font-display font-extrabold leading-[1.05] tracking-tight"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
          >
            The Future of
            <br />
            <span className="text-gradient">Messaging &amp;</span>
            <br />
            <span className="text-gradient">Social Connection</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6 text-lg text-white/65 max-w-md mx-auto lg:mx-0"
          >
            NightGram is a dark neon glass social platform — a real-time feed,
            a glowing messenger, and a premium marketplace. One identity,
            synced everywhere.
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

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="mt-4 flex gap-3 justify-center lg:justify-start"
          >
            <a href="#" className="glass rounded-2xl px-4 py-2.5 inline-flex items-center gap-2 hover:border-neon-purple/50 transition group">
              <Apple size={20} className="group-hover:text-neon-purple transition" />
              <div className="text-left leading-tight">
                <div className="text-[9px] text-white/50">Download on the</div>
                <div className="text-sm font-semibold">App Store</div>
              </div>
            </a>
            <a href="#" className="glass rounded-2xl px-4 py-2.5 inline-flex items-center gap-2 hover:border-neon-purple/50 transition group">
              <Smartphone size={20} className="group-hover:text-neon-purple transition" />
              <div className="text-left leading-tight">
                <div className="text-[9px] text-white/50">GET IT ON</div>
                <div className="text-sm font-semibold">Google Play</div>
              </div>
            </a>
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
            <p className="mt-2 text-sm text-white/60">The night, reimagined.</p>
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
