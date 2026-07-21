"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, AlertCircle, Info, Sparkles } from "lucide-react";
import type { GlobalToastPayload, GlobalToastKind } from "@/lib/toast";

interface Toast extends Required<GlobalToastPayload> { id: number }

const ICON = {
  default: Sparkles,
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
} satisfies Record<GlobalToastKind, typeof Sparkles>;

const COLOR = {
  default: "var(--accent-main)",
  success: "#22c55e",
  error: "#ef4444",
  info: "#22d3ee",
} satisfies Record<GlobalToastKind, string>;

export function GlobalToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<GlobalToastPayload>).detail;
      if (!detail?.message) return;
      const toast: Toast = { id: Date.now() + Math.random(), message: detail.message, kind: detail.kind ?? "default" };
      setToasts((prev) => [...prev.slice(-2), toast]);
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 2800);
    }
    window.addEventListener("nightgram:toast", onToast);
    return () => window.removeEventListener("nightgram:toast", onToast);
  }, []);

  return (
    <div className="fixed bottom-5 left-1/2 z-[10080] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICON[toast.kind];
          const color = COLOR[toast.kind];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              className="pointer-events-auto flex items-center gap-2 rounded-full ng-solid px-4 py-2.5 text-sm text-white/85 shadow-glow-lg"
            >
              <Icon size={16} style={{ color }} />
              <span>{toast.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
