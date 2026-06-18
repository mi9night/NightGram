"use client";

// =============================================================================
//  NightGram logo — animated SVG mark used across the whole app.
// =============================================================================

import { motion } from "framer-motion";

export function NightGramLogo({
  size = 40,
  withGlow = true,
  animated = true,
}: {
  size?: number;
  withGlow?: boolean;
  animated?: boolean;
}) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={animated ? { rotate: -8, opacity: 0 } : false}
      animate={animated ? { rotate: 0, opacity: 1 } : undefined}
      transition={{ type: "spring", stiffness: 120, damping: 12 }}
      style={withGlow ? { filter: "drop-shadow(0 0 8px rgb(var(--accent-main-rgb) / 0.7))" } : undefined}
    >
      <defs>
        <linearGradient id="ng-grad" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="45%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id="ng-grad2" x1="64" y1="0" x2="0" y2="64">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      {/* crescent moon = "Night" */}
      <motion.path
        d="M44 12a20 20 0 1 0 8 26 16 16 0 1 1-8-26z"
        fill="url(#ng-grad)"
        animate={animated ? { opacity: [0.85, 1, 0.85] } : undefined}
        transition={{ duration: 4, repeat: Infinity }}
      />
      {/* gram / signal arc */}
      <motion.path
        d="M16 48c4-14 14-24 32-28"
        stroke="url(#ng-grad2)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
        animate={animated ? { pathLength: [0, 1], opacity: [0.3, 1] } : undefined}
        transition={{ duration: 2.5, repeat: Infinity, repeatType: "reverse" }}
      />
      <circle cx="44" cy="18" r="3.5" fill="#fff" />
    </motion.svg>
  );
}

export function NightGramWordmark({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <NightGramLogo size={size} />
      <span
        className="font-display font-bold tracking-tight text-gradient"
        style={{ fontSize: size * 0.5 }}
      >
        NightGram
      </span>
    </div>
  );
}
