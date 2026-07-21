"use client";

// =============================================================================
//  PostMenu — anchored action popup + separate confirm/report modals
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal, Trash2, Flag, X, AlertTriangle, Send, Pin, PinOff } from "lucide-react";

const REPORT_CATEGORIES = [
  { id: "spam", label: "Спам", desc: "Повторяющаяся реклама, массовая рассылка" },
  { id: "scam", label: "Мошенничество", desc: "Обман, фишинг, подозрительные ссылки" },
  { id: "harassment", label: "Травля / оскорбления", desc: "Целенаправленные оскорбления, буллинг" },
  { id: "nsfw", label: "Контент 18+", desc: "Непристойный или сексуальный контент" },
  { id: "violence", label: "Призыв к насилию", desc: "Угрозы, призывы к причинению вреда" },
  { id: "copyright", label: "Авторские права", desc: "Нарушение авторских прав" },
  { id: "other", label: "Другое", desc: "Другое нарушение правил" },
];

type Mode = "closed" | "menu" | "delete" | "report";

export function PostMenu({
  isOwner,
  isAdmin,
  itemType = "пост",
  onDelete,
  onReport,
  onPin,
  pinned = false,
}: {
  isOwner: boolean;
  isAdmin: boolean;
  itemType?: string;
  onDelete?: () => void;
  onReport?: (category: string, reason: string) => void;
  onPin?: () => void;
  pinned?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("closed");
  const [reportCategory, setReportCategory] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (mode === "menu" && !triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMode("closed");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [mode]);

  function submitReport() {
    if (reportCategory && onReport) onReport(reportCategory, reportText.trim());
    setMode("closed");
    setReportCategory(null);
    setReportText("");
  }

  function confirmDelete() {
    onDelete?.();
    setMode("closed");
  }

  return (
    <div className="relative z-[80]">
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setMenuPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
          setMode((m) => (m === "menu" ? "closed" : "menu"));
        }}
        className="grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition shrink-0"
        aria-label="Действия"
      >
        <MoreHorizontal size={16} />
      </button>

      {/* Anchored small menu near three dots — portaled to body so it stays above other posts */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {mode === "menu" && menuPos && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="fixed z-[10000] w-64 ng-solid rounded-2xl p-2 shadow-glow-lg"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              {(isOwner || isAdmin) && onPin && (
                <button
                  onClick={() => { onPin(); setMode("closed"); }}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/5 transition"
                >
                  {pinned ? <PinOff size={16} className="text-neon-purple" /> : <Pin size={16} className="text-neon-purple" />}
                  <span>{pinned ? "Открепить" : "Закрепить"} {itemType}</span>
                </button>
              )}
              {(isOwner || isAdmin) && onDelete && (
                <button
                  onClick={() => setMode("delete")}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition"
                >
                  <Trash2 size={16} />
                  <span>Удалить {itemType}</span>
                </button>
              )}
              <button
                onClick={() => setMode("report")}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/5 transition"
              >
                <Flag size={16} className="text-neon-purple" />
                <span>Пожаловаться</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Separate delete confirmation modal */}
      <AnimatePresence>
        {mode === "delete" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMode("closed")} />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              className="relative z-10 w-full max-w-sm ng-solid rounded-4xl p-6 text-center shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <button onClick={() => setMode("closed")} className="absolute top-4 right-4 grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition">
                <X size={16} />
              </button>
              <div className="mx-auto h-16 w-16 rounded-full grid place-items-center mb-4" style={{ background: "rgba(239,68,68,0.12)" }}>
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">Точно удалить {itemType}?</h3>
              <p className="text-sm text-white/50 mb-6">
                Это действие нельзя отменить. {itemType.charAt(0).toUpperCase() + itemType.slice(1)} будет удалён навсегда.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setMode("closed")} className="btn-ghost flex-1 py-3 text-sm">Отмена</button>
                <button onClick={confirmDelete} className="flex-1 py-3 text-sm font-semibold rounded-xl text-white transition hover:brightness-110" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)" }}>
                  <Trash2 size={15} className="inline mr-1" /> Удалить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Separate report modal */}
      <AnimatePresence>
        {mode === "report" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMode("closed")} />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[85vh] overflow-y-auto"
            >
              <button onClick={() => setMode("closed")} className="absolute top-4 right-4 grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition">
                <X size={16} />
              </button>
              <h3 className="font-display font-bold text-lg mb-4">Жалоба</h3>
              {!reportCategory ? (
                <>
                  <p className="text-xs text-white/55 mb-3">Выбери причину:</p>
                  <div className="space-y-1.5">
                    {REPORT_CATEGORIES.map((c) => (
                      <button key={c.id} onClick={() => setReportCategory(c.id)} className="w-full text-left rounded-xl px-3 py-3 glass hover:brightness-125 transition">
                        <div className="font-semibold text-sm">{c.label}</div>
                        <div className="text-xs text-white/40 mt-0.5">{c.desc}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => setReportCategory(null)} className="text-xs text-white/50 hover:text-white mb-3">← Назад</button>
                  <textarea
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    maxLength={500}
                    rows={4}
                    placeholder="Опиши подробнее, если нужно…"
                    className="w-full rounded-xl glass px-3 py-2.5 text-sm outline-none resize-none focus:border-neon-purple/40 mb-3"
                  />
                  <button onClick={submitReport} className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2">
                    <Send size={15} /> Отправить жалобу
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
