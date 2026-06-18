"use client";

// =============================================================================
//  AuroraBackground — animated floating gradient orbs behind any section.
// =============================================================================

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function AuroraBackground({
  className,
  intensity = 1,
}: {
  className?: string;
  intensity?: number;
}) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      <motion.div
        className="absolute -top-32 -left-24 rounded-full"
        style={{
          width: 420 * intensity,
          height: 420 * intensity,
          background:
            "radial-gradient(circle, rgba(168,85,247,0.45), transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ x: [0, 60, -20, 0], y: [0, 40, -30, 0], scale: [1, 1.15, 0.95, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-32 rounded-full"
        style={{
          width: 380 * intensity,
          height: 380 * intensity,
          background:
            "radial-gradient(circle, rgba(236,72,153,0.4), transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ x: [0, -50, 30, 0], y: [0, -40, 20, 0], scale: [1, 0.9, 1.2, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-40 left-1/4 rounded-full"
        style={{
          width: 460 * intensity,
          height: 460 * intensity,
          background:
            "radial-gradient(circle, rgba(99,102,241,0.4), transparent 70%)",
          filter: "blur(70px)",
        }}
        animate={{ x: [0, 40, -40, 0], y: [0, -30, 30, 0], scale: [1, 1.1, 0.9, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
