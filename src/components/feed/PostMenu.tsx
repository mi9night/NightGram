"use client";

// =============================================================================
//  PostMenu — 3-dot dropdown for posts (delete if owner/admin, report)
// =============================================================================

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal, Trash2, Flag, X } from "lucide-react";
import { cn } from "@/lib/utils";

const REPORT_CATEGORIES = [
  { id: "spam", label: "Спам" },
  { id: "scam", label: "Мошенничество" },
  { id: "harassment", label: "Травля / оскорбления" },
  { id: "nsfw", label: "Контент 18+" },
  { id: "violence", label: "Призыв к насилию" },
  { id: "copyright", label: "Нарушение авторских прав" },
  { id: "other", label: "Другое" },
];

export function PostMenu({
  isOwner,
  isAdmin,
  onDelete,
  onReport,
}: {
  isOwner: boolean;
  isAdmin: boolean;
  onDelete?: () => void;
  onReport?: (category: string, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reportMode, setReportMode] = useState(false);
  const [reportCategory, setReportCategory] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function submitReport() {
    if (reportCategory && onReport) {
      onReport(reportCategory, reportText.trim());
    }
    setOpen(false);
    setReportMode(false);
    setReportCategory(null);
    setReportText("");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition"
      >
        <MoreHorizontal size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-9 right-0 z-[70] w-56 ng-solid rounded-2xl shadow-glow-lg"
          >
            {!reportMode ? (
              <div className="p-1.5">
                {(isOwner || isAdmin) && onDelete && (
                  <button
                    onClick={() => { onDelete(); setOpen(false); }}
                    className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 size={15} /> Удалить пост
                  </button>
                )}
                <button
                  onClick={() => setReportMode(true)}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 transition"
                >
                  <Flag size={15} /> Пожаловаться
                </button>
              </div>
            ) : (
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-white/70">Категория жалобы:</span>
                  <button onClick={() => { setReportMode(false); setReportCategory(null); }} className="text-white/40 hover:text-white">
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-1 mb-3">
                  {REPORT_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setReportCategory(c.id)}
                      className={cn(
                        "w-full text-left rounded-lg px-2.5 py-1.5 text-xs transition",
                        reportCategory === c.id ? "bg-neon-purple/15 text-white" : "text-white/60 hover:bg-white/5",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {reportCategory && (
                  <>
                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      maxLength={300}
                      rows={2}
                      placeholder="Опишите подробнее…"
                      className="w-full rounded-lg glass px-3 py-2 text-xs outline-none resize-none focus:border-neon-purple/40 mb-2"
                    />
                    <button
                      onClick={submitReport}
                      className="btn-glow w-full py-2 text-xs"
                    >
                      Отправить жалобу
                    </button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
