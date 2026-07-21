"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, ChevronLeft, Pin, PinOff, Trash2, Image as ImageIcon, MessageSquare, Send } from "lucide-react";
import { getSavedItems, removeSavedItem, saveItem, type SavedItem } from "@/lib/saved";
import { MediaViewer, type MediaViewerItem } from "@/components/shared/MediaViewer";

export function SavedChatView({
  pinned,
  onTogglePinned,
  onBack,
}: {
  pinned: boolean;
  onTogglePinned: () => void;
  onBack: () => void;
}) {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [text, setText] = useState("");
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

  function sendNote(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    const next = saveItem({
      id: `saved-note:${Date.now()}`,
      type: "message",
      title: "",
      text: body,
      createdAt: new Date().toISOString(),
    });
    setItems(next);
    setText("");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-3 border-b border-white/5 glass-strong">
        <button onClick={onBack} className="md:hidden grid place-items-center h-9 w-9 rounded-lg glass">
          <ChevronLeft size={18} />
        </button>
        <div className="h-10 w-10 rounded-full grid place-items-center glass-strong shadow-glow">
          <Bookmark size={18} className="text-neon-purple" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Избранное</div>
          <div className="text-xs text-white/45">Личный чат для сохранённых сообщений и медиа</div>
        </div>
        <button
          onClick={onTogglePinned}
          className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-neon-purple transition"
          title={pinned ? "Открепить" : "Закрепить"}
        >
          {pinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {items.length === 0 ? (
          <div className="h-full grid place-items-center text-center text-white/40">
            <div>
              <Bookmark size={38} className="mx-auto mb-3 opacity-60" />
              <p className="text-sm">Пока ничего не сохранено</p>
              <p className="text-xs mt-1 max-w-xs">Нажми закладку у сообщения/медиа — оно появится здесь как в личном чате.</p>
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {[...items].reverse().map((item, i) => {
              const mediaIndex = mediaItems.findIndex((m) => m.id === item.id);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ delay: Math.min(i * 0.025, 0.2) }}
                  className="flex justify-end"
                >
                  <div className="relative max-w-[82%] rounded-2xl rounded-br-md glass px-3.5 py-2.5 group">
                    {item.mediaUrl && (
                      <button
                        onClick={() => setViewer({ items: mediaItems, index: Math.max(mediaIndex, 0) })}
                        className="block mb-2 overflow-hidden rounded-2xl bg-white/5"
                      >
                        {item.mediaType === "video" ? (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <video src={item.mediaUrl} className="max-h-64 w-full object-cover" muted playsInline />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.mediaUrl} alt="" loading="lazy" decoding="async" className="max-h-64 w-full object-cover" />
                        )}
                      </button>
                    )}
                    {item.title && (
                      <div className="flex items-center gap-1.5 text-[11px] text-neon-purple mb-1">
                        {item.type === "message" ? <MessageSquare size={11} /> : <ImageIcon size={11} />}
                        {item.title}
                      </div>
                    )}
                    {item.text && <div className="text-sm text-white/85 whitespace-pre-wrap break-words">{item.text}</div>}
                    <div className="mt-1 text-[10px] text-white/30">{new Date(item.createdAt).toLocaleString("ru-RU")}</div>
                    <button
                      onClick={() => setItems(removeSavedItem(item.id))}
                      className="absolute -left-9 top-2 grid h-7 w-7 place-items-center rounded-lg glass text-white/35 opacity-0 group-hover:opacity-100 hover:text-red-400 transition"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <form onSubmit={sendNote} className="p-3 border-t border-white/5 glass-strong flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Написать в Избранное…"
            className="w-full rounded-full glass px-4 py-2.5 pr-11 text-sm outline-none focus:border-neon-purple/40"
          />
          <button type="submit" disabled={!text.trim()} className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full btn-glow disabled:opacity-40">
            <Send size={14} />
          </button>
        </div>
      </form>

      <MediaViewer items={viewer?.items ?? []} initialIndex={viewer?.index ?? 0} open={Boolean(viewer)} onClose={() => setViewer(null)} />
    </div>
  );
}
