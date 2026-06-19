"use client";

// =============================================================================
//  PostMenu — fullscreen modal for post/comment actions
//  Delete (if owner/admin) with confirmation + Report with categories
// =============================================================================

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal, Trash2, Flag, X, AlertTriangle, Check, Send } from "lucide-react";
import { cn } from "@/lib/utils";

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
}: {
  isOwner: boolean;
  isAdmin: boolean;
  itemType?: string;
  onDelete?: () => void;
  onReport?: (category: string, reason: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("closed");
  const [reportCategory, setReportCategory] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");

  function submitReport() {
    if (reportCategory && onReport) {
      onReport(reportCategory, reportText.trim());
    }
    setMode("closed");
    setReportCategory(null);
    setReportText("");
  }

  function confirmDelete() {
    if (onDelete) onDelete();
    setMode("closed");
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setMode("menu")}
        className="grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition shrink-0"
      >
        <MoreHorizontal size={16} />
      </button>

      <AnimatePresence>
        {mode !== "closed" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMode("closed")} />

            {/* Modal */}
            <motion.div
              initial={{ y: "100%", opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: "100%", opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="relative z-10 w-full sm:max-w-md ng-solid rounded-t-4xl sm:rounded-4xl shadow-glow-lg max-h-[85vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b ng-divider bg-[rgb(var(--glass-r)_var(--glass-g)_var(--glass-b))]">
                <h3 className="font-display font-bold text-sm">
                  {mode === "menu" && `Действия с ${itemType}ом`}
                  {mode === "delete" && "Удаление"}
                  {mode === "report" && "Жалоба"}
                </h3>
                <button onClick={() => setMode("closed")} className="grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition">
                  <X size={16} />
                </button>
              </div>

              {/* ===== MENU MODE ===== */}
              {mode === "menu" && (
                <div className="p-3 space-y-2">
                  {(isOwner || isAdmin) && onDelete && (
                    <button
                      onClick={() => setMode("delete")}
                      className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm text-red-400 hover:bg-red-500/10 transition glass"
                    >
                      <div className="h-9 w-9 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(239,68,68,0.12)" }}>
                        <Trash2 size={17} />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold">Удалить {itemType}</div>
                        <div className="text-xs text-white/40">Действие нельзя отменить</div>
                      </div>
                    </button>
                  )}

                  <button
                    onClick={() => setMode("report")}
                    className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm text-white/70 hover:bg-white/5 transition glass"
                  >
                    <div className="h-9 w-9 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(168,85,247,0.12)" }}>
                      <Flag size={17} className="text-neon-purple" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">Пожаловаться</div>
                      <div className="text-xs text-white/40">Сообщить о нарушении правил</div>
                    </div>
                  </button>

                  {!isOwner && !isAdmin && !onDelete && (
                    <p className="text-center text-xs text-white/30 py-2">Доступно только: пожаловаться</p>
                  )}
                </div>
              )}

              {/* ===== DELETE CONFIRMATION ===== */}
              {mode === "delete" && (
                <div className="p-6 text-center">
                  <div className="mx-auto h-16 w-16 rounded-full grid place-items-center mb-4" style={{ background: "rgba(239,68,68,0.12)" }}>
                    <AlertTriangle size={28} className="text-red-400" />
                  </div>
                  <h3 className="font-display font-bold text-lg mb-2">Точно удалить {itemType}?</h3>
                  <p className="text-sm text-white/50 mb-6">
                    Это действие <b className="text-red-400">нельзя отменить</b>. {itemType === "пост" ? "Пост" : "Комментарий"} будет удалён навсегда вместе с реакциями.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setMode("menu")} className="btn-ghost flex-1 py-3 text-sm">
                      Отмена
                    </button>
                    <button onClick={confirmDelete} className="flex-1 py-3 text-sm font-semibold rounded-xl text-white transition hover:brightness-110"
                      style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
                      <Trash2 size={15} className="inline mr-1" /> Удалить
                    </button>
                  </div>
                </div>
              )}

              {/* ===== REPORT ===== */}
              {mode === "report" && (
                <div className="p-4">
                  {!reportCategory ? (
                    <>
                      <p className="text-xs text-white/55 mb-3 ml-1">Выбери причину жалобы:</p>
                      <div className="space-y-1.5">
                        {REPORT_CATEGORIES.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setReportCategory(c.id)}
                            className="w-full text-left rounded-xl px-3 py-3 glass hover:brightness-125 transition"
                          >
                            <div className="font-semibold text-sm">{c.label}</div>
                            <div className="text-xs text-white/40 mt-0.5">{c.desc}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-3">
                        <button onClick={() => setReportCategory(null)} className="text-xs text-white/50 hover:text-white">
                          ← Назад
                        </button>
                        <span className="text-xs text-white/40">|</span>
                        <span className="text-xs font-semibold text-neon-purple">
                          {REPORT_CATEGORIES.find((c) => c.id === reportCategory)?.label}
                        </span>
                      </div>

                      <label className="text-xs text-white/55 mb-1.5 block ml-1">Дополнительное описание (необязательно):</label>
                      <textarea
                        value={reportText}
                        onChange={(e) => setReportText(e.target.value)}
                        maxLength={500}
                        rows={4}
                        placeholder="Опиши подробнее, что именно нарушил автор…"
                        className="w-full rounded-xl glass px-3 py-2.5 text-sm outline-none resize-none focus:border-neon-purple/40 mb-3"
                      />
                      <div className="text-right text-[10px] text-white/30 mb-3">{reportText.length}/500</div>

                      <button onClick={submitReport} className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2">
                        <Send size={15} /> Отправить жалобу
                      </button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
