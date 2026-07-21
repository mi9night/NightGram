"use client";

// =============================================================================
//  PaymentModal — выбор способа оплаты + копирование ID + отправка заявки
// =============================================================================

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CreditCard, Wallet, Copy, Check, AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export interface PaymentItem {
  title: string;
  subtitle: string;
  price: number;
  itemType: "premium" | "coins";
  giftRecipientId?: string;
  giftRecipientName?: string;
  giftRecipientNgId?: number;
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
  const [requestSent, setRequestSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [paymentComment, setPaymentComment] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item || requestSent || sending) return;
    setSending(true);
    api.createPurchaseRequest({ itemType: item.itemType, itemName: item.title, price: item.price, giftRecipientId: item.giftRecipientId })
      .then((res) => {
        setPaymentComment(res.paymentComment ?? `${res.paymentCode ?? ""} ${ngId} ${item.title} ${item.price}₽`.trim());
        setRequestSent(true);
      })
      .catch(() => {
        setPaymentComment(`${ngId} ${item.title} ${item.price}₽`);
        setRequestSent(true);
      })
      .finally(() => setSending(false));
  }, [item, ngId, open, requestSent, sending]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setRequestSent(false);
      setPaymentComment(null);
      setSending(false);
    }
  }, [open]);

  function copyId() {
    if (!paymentComment) return;
    navigator.clipboard.writeText(paymentComment);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Create a purchase request when user clicks a payment method
  async function handlePaymentClick(href: string) {
    if (!item) return;
    if (!requestSent && !sending) {
      setSending(true);
      try {
        const res = await api.createPurchaseRequest({ itemType: item.itemType, itemName: item.title, price: item.price, giftRecipientId: item.giftRecipientId });
        setPaymentComment(res.paymentComment ?? `${res.paymentCode ?? ""} ${ngId} ${item.title} ${item.price}₽`.trim());
        setRequestSent(true);
      } catch {
        setPaymentComment(`${ngId} ${item.title} ${item.price}₽`);
        setRequestSent(true);
      } finally {
        setSending(false);
      }
    }
    window.open(href, "_blank");
  }

  return (
    <AnimatePresence>
      {open && item && (
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
            className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-6 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
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
                  {item.giftRecipientName && <div className="mt-0.5 text-[11px] text-neon-gold">Подарок для @{item.giftRecipientName}</div>}
                </div>
                <div className="text-lg font-bold text-neon-gold">{item.price}₽</div>
              </div>
            </div>

            {/* Request sent confirmation */}
            {requestSent && (
              <div className="mb-4 flex items-center gap-2 rounded-xl p-3" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                <Check size={16} className="text-green-400 shrink-0" />
                <span className="text-xs text-green-300">
                  Заявка создана. Если комментарий совпадёт с донатом, система попробует выдать покупку автоматически, но если этого не случится, то поддержка сама выдаст вам вашу покупку.
                </span>
              </div>
            )}

            {/* ID copy section */}
            <div className="mb-5">
              <div className="flex items-center gap-2 rounded-xl p-3 mb-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <span className="text-xs text-red-300">
                  Скопируй комментарий ниже и вставь его при оплате. Без него платёж может уйти на ручную проверку или быть проигнорирован.
                </span>
              </div>

              <label className="text-xs text-white/50 mb-1.5 ml-1 block">Комментарий к оплате:</label>
              <button
                onClick={copyId}
                disabled={!paymentComment}
                className="w-full flex items-center justify-between rounded-xl glass px-4 py-3 transition hover:brightness-125 disabled:opacity-60"
              >
                <span className="font-mono font-bold text-sm" style={{ color: "var(--accent-main)" }}>
                  {paymentComment || "Создаём код заявки…"}
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
              <button
                onClick={() => handlePaymentClick("https://www.donationalerts.com/r/mi9night")}
                className="w-full flex items-center gap-3 rounded-2xl glass-strong p-4 transition hover:scale-[1.02] hover:border-neon-gold/40"
              >
                <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(251,191,36,0.12)" }}>
                  {sending ? <Loader2 size={18} className="animate-spin" style={{ color: "#fbbf24" }} /> : <CreditCard size={18} style={{ color: "#fbbf24" }} />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-semibold text-sm">DonationAlerts</div>
                  <div className="text-xs text-white/45">Зарубежные + карты РФ</div>
                </div>
                <ExternalLink size={16} className="text-white/40" />
              </button>

              {/* Donatex */}
              <button
                onClick={() => handlePaymentClick("https://donatex.gg/donate/mi9night")}
                className="w-full flex items-center gap-3 rounded-2xl glass-strong p-4 transition hover:scale-[1.02] hover:border-neon-purple/40"
              >
                <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(168,85,247,0.12)" }}>
                  {sending ? <Loader2 size={18} className="animate-spin text-neon-purple" /> : <Wallet size={18} className="text-neon-purple" />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-semibold text-sm">Donatex</div>
                  <div className="text-xs text-white/45">Карты РФ (запасной)</div>
                </div>
                <ExternalLink size={16} className="text-white/40" />
              </button>
            </div>

            <p className="text-center text-[11px] text-white/30 mt-4">
              После оплаты с указанным комментарием покупка может активироваться автоматически. Без комментария — через поддержку/ручную проверку
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
