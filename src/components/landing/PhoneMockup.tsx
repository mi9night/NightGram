"use client";

// =============================================================================
//  PhoneMockup — animated device frame showing a looping NightGram UI preview.
// =============================================================================

import { motion } from "framer-motion";
import { Heart, MessageCircle, Send, Bookmark, Sparkles } from "lucide-react";
import { NightGramLogo } from "@/components/shared/NightGramLogo";

export function PhoneMockup() {
  return (
    <div className="relative mx-auto" style={{ width: 300, height: 620 }}>
      {/* glow behind device */}
      <div
        className="absolute inset-0 rounded-[3rem] blur-2xl opacity-60"
        style={{ background: "linear-gradient(135deg,var(--accent-main),var(--accent-tertiary),var(--accent-secondary))" }}
        aria-hidden
      />

      {/* device frame */}
      <motion.div
        className="relative h-full w-full rounded-[3rem] border-[10px] border-midnight-950 bg-midnight-950 shadow-glow-lg overflow-hidden"
        animate={{ y: [0, -14, 0], rotate: [-0.5, 0.5, -0.5] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* notch */}
        <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-midnight-950" />

        {/* screen */}
        <div className="relative h-full w-full overflow-hidden rounded-[2.3rem]">
          {/* status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[10px] text-white/70">
            <span>23:59</span>
            <NightGramLogo size={16} animated={false} withGlow={false} />
            <span>100%</span>
          </div>

          {/* top nav */}
          <div className="flex items-center justify-between px-4 py-2">
            <span className="font-display font-bold text-sm text-gradient">NightGram</span>
            <div className="flex gap-2">
              <div className="h-5 w-5 rounded-full bg-neon-purple/30" />
              <div className="h-5 w-5 rounded-full bg-neon-pink/30" />
            </div>
          </div>

          {/* animated feed cards */}
          <div className="px-3 space-y-3">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="rounded-2xl glass p-2.5"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 1.2, duration: 0.5, repeat: Infinity, repeatDelay: 2.4, repeatType: "reverse" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="h-7 w-7 rounded-full"
                    style={{
                      background: ["#a855f7", "#22d3ee", "#ec4899"][i],
                      boxShadow: `0 0 8px ${["#a855f7", "#22d3ee", "#ec4899"][i]}`,
                    }}
                  />
                  <div className="flex-1">
                    <div className="h-2 w-16 rounded-full bg-white/30" />
                  </div>
                </div>
                <motion.div
                  className="h-28 rounded-xl"
                  style={{
                    background: [
                      "linear-gradient(135deg,#a855f7,#ec4899)",
                      "linear-gradient(135deg,#22d3ee,#6366f1)",
                      "linear-gradient(135deg,#fbbf24,#ec4899)",
                    ][i],
                  }}
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
                />
                <div className="flex items-center justify-between pt-2">
                  <div className="flex gap-3 text-white/80">
                    <Heart size={14} className="fill-neon-pink text-neon-pink" />
                    <MessageCircle size={14} />
                    <Send size={14} />
                  </div>
                  <Bookmark size={14} className="text-neon-purple" />
                </div>
              </motion.div>
            ))}
          </div>

          {/* bottom tab bar */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-around bg-midnight-950/80 backdrop-blur-xl py-3 border-t border-white/5">
            {[
              { Icon: Heart, color: "text-neon-pink", fill: true },
              { Icon: MessageCircle, color: "text-white/40", fill: false },
              { Icon: Sparkles, color: "text-neon-purple", fill: true },
              { Icon: Send, color: "text-white/40", fill: false },
            ].map(({ Icon, color, fill }, i) => (
              <div key={i} className={color}>
                <Icon size={18} className={fill ? "fill-current" : ""} />
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
