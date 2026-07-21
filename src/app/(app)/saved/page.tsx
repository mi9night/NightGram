"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, Trash2, Image as ImageIcon, MessageSquare } from "lucide-react";
import { getSavedItems, removeSavedItem, type SavedItem } from "@/lib/saved";
import { MediaViewer, type MediaViewerItem } from "@/components/shared/MediaViewer";

export default function SavedPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [viewer, setViewer] = useState<{ items: MediaViewerItem[]; index: number } | null>(null);

  useEffect(() => {
    const load = () => setItems(getSavedItems());
    load();
    window.addEventListener("nightgram:saved-items", load);
    return () => window.removeEventListener("nightgram:saved-items", load);
  }, []);

  const mediaItems: MediaViewerItem[] = items
    .filter((item) => item.mediaUrl)
    .map((item) => ({ id: item.id, type: item.mediaType ?? "image", url: item.mediaUrl! }));

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <h1 className="font-display font-bold text-2xl flex items-center gap-2">
          <Bookmark size={22} className="text-neon-purple" /> Избранное
        </h1>
        <p className="text-sm text-white/45">Сохранённые сообщения, фото, видео и заметки</p>
      </motion.div>

      {items.length === 0 ? (
        <div className="text-center py-20 text-white/40">
          <Bookmark size={42} className="mx-auto mb-4 opacity-50" />
          <p>Пока ничего не сохранено</p>
          <p className="text-xs mt-1">Сохраняй сообщения и медиа из чатов — они появятся здесь.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {items.map((item, i) => {
              const mediaIndex = mediaItems.findIndex((m) => m.id === item.id);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ delay: Math.min(i * 0.035, 0.25) }}
                  className="glass-strong rounded-3xl p-4 flex gap-3"
                >
                  {item.mediaUrl ? (
                    <button
                      onClick={() => setViewer({ items: mediaItems, index: Math.max(mediaIndex, 0) })}
                      className="h-20 w-20 rounded-2xl overflow-hidden shrink-0 bg-white/5"
                    >
                      {item.mediaType === "video" ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video src={item.mediaUrl} className="h-full w-full object-cover" muted playsInline />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.mediaUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </button>
                  ) : (
                    <div className="h-12 w-12 rounded-2xl grid place-items-center glass shrink-0">
                      {item.type === "message" ? <MessageSquare size={18} className="text-neon-purple" /> : <ImageIcon size={18} className="text-neon-purple" />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{item.title}</div>
                    {item.text && <p className="text-sm text-white/65 mt-1 whitespace-pre-wrap break-words">{item.text}</p>}
                    <div className="text-[11px] text-white/35 mt-2">{new Date(item.createdAt).toLocaleString("ru-RU")}</div>
                  </div>
                  <button
                    onClick={() => setItems(removeSavedItem(item.id))}
                    className="grid h-9 w-9 place-items-center rounded-xl glass text-white/45 hover:text-red-400 transition shrink-0"
                    title="Удалить из избранного"
                  >
                    <Trash2 size={15} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <MediaViewer items={viewer?.items ?? []} initialIndex={viewer?.index ?? 0} open={Boolean(viewer)} onClose={() => setViewer(null)} />
    </div>
  );
}
