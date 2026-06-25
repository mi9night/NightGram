"use client";

// =============================================================================
//  PremiumRequiredModal — shown when a non-premium user tries to use a
//  premium-only feature (e.g. uploading a custom banner).
// =============================================================================

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Crown, X } from "lucide-react";

export function PremiumRequiredModal({
  open,
  onClose,
  feature,
}: {
  open: boolean;
  onClose: () => void;
  feature: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="relative z-10 w-full max-w-sm ng-solid rounded-4xl p-6 text-center shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition"
            >
              <X size={16} />
            </button>

            <motion.div
              initial={{ rotate: -8, scale: 0.9 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 180, damping: 14 }}
              className="mx-auto mb-4 grid h-16 w-16 place-items-center"
            >
              <Crown size={44} style={{ color: "#fbbf24", fill: "rgba(251,191,36,0.22)", filter: "drop-shadow(0 0 18px rgba(251,191,36,0.55))" }} />
            </motion.div>

            <h3 className="font-display font-bold text-xl">Нужен Premium</h3>
            <p className="text-white/55 text-sm mt-2">
              {feature} доступна только с подпиской NightGram Premium.
              Оформи подписку, чтобы разблокировать все возможности.
            </p>

            <Link
              href="/store/premium"
              onClick={onClose}
              className="mt-5 btn-glow w-full py-3 inline-flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}
            >
              <Crown size={18} /> Купить Premium
            </Link>

            <p className="text-[11px] text-white/30 mt-3">
              от 230₽ в месяц
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
