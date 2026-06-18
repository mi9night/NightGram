"use client";

// =============================================================================
//  PaymentModal — выбор способа оплаты + копирование ID пользователя
// =============================================================================

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CreditCard, Wallet, Copy, Check, AlertCircle, ExternalLink } from "lucide-react";

export interface PaymentItem {
  title: string;
  subtitle: string;
  price: number;
}

export function PaymentModal({
  open,
  item,
  ngId,
  onClose,
}: {
  open: boolean;
  item: PaymentItem | null;
  ngId: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyId() {
    navigator.clipboard.writeText(ngId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AnimatePresence>
      {open && item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] grid place-items-center p-4"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-6 shadow-glow-lg"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition"
            >
              <X size={16} />
            </button>

            {/* Item summary */}
            <div className="text-center mb-5">
              <h3 className="font-display font-bold text-xl">Подтверждение покупки</h3>
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5">
                <div className="text-left">
                  <div className="font-semibold text-sm">{item.title}</div>
                  <div className="text-xs text-white/45">{item.subtitle}</div>
                </div>
                <div className="text-lg font-bold text-neon-gold">{item.price}₽</div>
              </div>
            </div>

            {/* ID copy section */}
            <div className="mb-5">
              <div className="flex items-center gap-2 rounded-xl p-3 mb-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <span className="text-xs text-red-300">
                  Укажите ваш ID в комментарии к оплате, иначе покупка будет проигнорирована!
                </span>
              </div>

              <label className="text-xs text-white/50 mb-1.5 ml-1 block">Ваш ID:</label>
              <button
                onClick={copyId}
                className="w-full flex items-center justify-between rounded-xl glass px-4 py-3 transition hover:brightness-125"
              >
                <span className="font-mono font-bold text-sm" style={{ color: "var(--accent-main)" }}>
                  {ngId}
                </span>
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="flex items-center gap-1 text-xs text-green-400 font-semibold"
                    >
                      <Check size={14} /> Скопировано!
                    </motion.span>
                  ) : (
                    <motion.span
                      key="copy"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="flex items-center gap-1 text-xs text-white/50"
                    >
                      <Copy size={14} /> Копировать
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>

            {/* Payment methods */}
            <div className="space-y-3">
              <p className="text-xs text-white/50 ml-1">Выберите способ оплаты:</p>

              {/* DonationAlerts */}
              <a
                href="https://dalink.to/mi9night"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl glass-strong p-4 transition hover:scale-[1.02] hover:border-neon-gold/40"
              >
                <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(251,191,36,0.12)" }}>
                  <CreditCard size={18} style={{ color: "#fbbf24" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">DonationAlerts</div>
                  <div className="text-xs text-white/45">Зарубежные + карты РФ</div>
                </div>
                <ExternalLink size={16} className="text-white/40" />
              </a>

              {/* Donatex */}
              <a
                href="https://donatex.gg/donate/mi9night"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl glass-strong p-4 transition hover:scale-[1.02] hover:border-neon-purple/40"
              >
                <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(168,85,247,0.12)" }}>
                  <Wallet size={18} className="text-neon-purple" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">Donatex</div>
                  <div className="text-xs text-white/45">Карты РФ (запасной)</div>
                </div>
                <ExternalLink size={16} className="text-white/40" />
              </a>
            </div>

            <p className="text-center text-[11px] text-white/30 mt-4">
              После оплаты с чеком и указанным ID — Premium/звёзды активируются в течение 24 часов
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
