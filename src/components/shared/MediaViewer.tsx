"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MediaViewerItem {
  id: string;
  type: "image" | "video";
  url: string;
  thumbnailUrl?: string;
}

export function MediaViewer({
  items,
  initialIndex = 0,
  open,
  onClose,
}: {
  items: MediaViewerItem[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}) {
  const safeItems = useMemo(() => items.filter((i) => i.url), [items]);
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(initialIndex, 0), Math.max(safeItems.length - 1, 0)));
  }, [initialIndex, open, safeItems.length]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (safeItems.length <= 1) return;
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + safeItems.length) % safeItems.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % safeItems.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open, safeItems.length]);

  const current = safeItems[index];
  if (!current) return null;

  const prev = () => setIndex((i) => (i - 1 + safeItems.length) % safeItems.length);
  const next = () => setIndex((i) => (i + 1) % safeItems.length);

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10050] grid place-items-center bg-black/72 p-3 backdrop-blur-md"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 250, damping: 26 }}
            className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-4xl ng-solid shadow-glow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b ng-divider px-4 py-3">
              <div className="min-w-0 text-sm text-white/65">
                Медиа {safeItems.length > 1 ? `${index + 1} / ${safeItems.length}` : ""}
              </div>
              <button
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-xl glass text-white/60 hover:text-white"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative grid min-h-0 flex-1 place-items-center p-3 md:p-5">
              {safeItems.length > 1 && (
                <button
                  onClick={prev}
                  className="absolute left-3 z-20 grid h-10 w-10 place-items-center rounded-full glass text-white/75 transition hover:scale-105 hover:text-white md:left-5"
                  aria-label="Назад"
                >
                  <ChevronLeft size={22} />
                </button>
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id + index}
                  initial={{ opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.985 }}
                  transition={{ duration: 0.16 }}
                  className="grid w-full place-items-center"
                >
                  {current.type === "video" ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      src={current.url}
                      poster={current.thumbnailUrl}
                      controls
                      autoPlay
                      playsInline
                      className="max-h-[68vh] max-w-full rounded-3xl object-contain bg-black"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={current.url}
                      alt=""
                      className="max-h-[68vh] max-w-full rounded-3xl object-contain select-none"
                      draggable={false}
                    />
                  )}
                </motion.div>
              </AnimatePresence>

              {safeItems.length > 1 && (
                <button
                  onClick={next}
                  className="absolute right-3 z-20 grid h-10 w-10 place-items-center rounded-full glass text-white/75 transition hover:scale-105 hover:text-white md:right-5"
                  aria-label="Вперёд"
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>

            {safeItems.length > 1 && (
              <div className="border-t ng-divider p-2">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {safeItems.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => setIndex(i)}
                      className={cn(
                        "relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border transition",
                        i === index ? "border-neon-purple shadow-glow scale-105" : "border-white/10 opacity-60 hover:opacity-100",
                      )}
                    >
                      {item.type === "video" ? (
                        <>
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                          <video src={item.url} poster={item.thumbnailUrl} className="h-full w-full object-cover" muted playsInline />
                          <span className="absolute inset-0 grid place-items-center bg-black/25"><Play size={14} className="fill-white" /></span>
                        </>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt="" className="h-full w-full object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
