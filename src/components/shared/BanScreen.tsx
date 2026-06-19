"use client";

// =============================================================================
//  BanScreen — shown when a banned user tries to access the app
// =============================================================================

import { motion } from "framer-motion";
import Link from "next/link";
import { Ban, Clock, AlertCircle } from "lucide-react";

export function BanScreen({
  bannedBy,
  reason,
  expiresAt,
}: {
  bannedBy: string;
  reason: string;
  expiresAt: string | null;
}) {
  const isPermanent = !expiresAt;
  const endDate = expiresAt ? new Date(expiresAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 80, damping: 14 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="gradient-border rounded-4xl glass-strong p-8 text-center shadow-glow-lg">
          {/* Ban icon */}
          <div className="mx-auto h-20 w-20 rounded-full grid place-items-center mb-5" style={{ background: "rgba(239,68,68,0.12)" }}>
            <Ban size={40} className="text-red-400" />
          </div>

          <h1 className="font-display font-bold text-2xl text-red-400">Аккаунт заблокирован</h1>

          <div className="mt-5 space-y-3 text-left">
            <div className="rounded-xl glass p-3">
              <div className="text-xs text-white/40 mb-0.5">Кем заблокирован:</div>
              <div className="text-sm font-semibold">@{bannedBy}</div>
            </div>

            <div className="rounded-xl glass p-3">
              <div className="text-xs text-white/40 mb-0.5">Причина:</div>
              <div className="text-sm">{reason}</div>
            </div>

            <div className="rounded-xl glass p-3">
              <div className="text-xs text-white/40 mb-0.5">Срок:</div>
              <div className="text-sm flex items-center gap-1.5">
                <Clock size={14} className="text-white/40" />
                {isPermanent ? "Навсегда" : `До ${endDate}`}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 space-y-2">
            <Link href="/login" className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2" style={{ background: "rgba(239,68,68,0.8)" }}>
              Выйти из аккаунта
            </Link>
            <button className="btn-ghost w-full py-3 text-sm flex items-center justify-center gap-2">
              <AlertCircle size={16} /> Написать тикет
            </button>
          </div>

          <p className="text-xs text-white/30 mt-4">
            Если считаешь, что бан выдан по ошибке — подай тикет на пересмотр.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
