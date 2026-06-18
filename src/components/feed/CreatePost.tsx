"use client";

// =============================================================================
//  CreatePost — floating button + modal to create a text/image post
// =============================================================================

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { uploadMedia } from "@/lib/supabase";

export function CreatePost({ onPosted }: { onPosted: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of files.slice(0, 4)) {
        const url = await uploadMedia(f, "posts");
        urls.push(url);
      }
      setMediaUrls((prev) => [...prev, ...urls]);
    } catch {
      // fallback to object URL
      const urls = files.map((f) => URL.createObjectURL(f));
      setMediaUrls((prev) => [...prev, ...urls]);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit() {
    if (!text.trim() && mediaUrls.length === 0) return;
    setPosting(true);
    try {
      await api.createPost({
        text: text.trim() || undefined,
        media: mediaUrls.map((url) => ({ type: "image" as const, url })),
        tags: [],
      });
      setText("");
      setMediaUrls([]);
      setOpen(false);
      onPosted();
    } catch {
      /* keep modal open on error */
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      {/* Floating create button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 h-14 w-14 rounded-full btn-glow grid place-items-center shadow-glow-lg"
        title="Создать пост"
      >
        <Plus size={24} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center p-4"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !posting && setOpen(false)} />

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="relative z-10 w-full max-w-lg ng-solid rounded-4xl p-6 shadow-glow-lg"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-lg flex items-center gap-2">
                  <Sparkles size={18} className="text-neon-purple" /> Новый пост
                </h3>
                <button onClick={() => !posting && setOpen(false)} className="grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition">
                  <X size={16} />
                </button>
              </div>

              {/* Text area */}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="Что у тебя на уме? ✦"
                autoFocus
                className="w-full rounded-2xl glass px-4 py-3 text-sm outline-none resize-none focus:border-neon-purple/40 transition"
              />
              <div className="text-right text-[11px] text-white/30 mt-1">{text.length}/1000</div>

              {/* Media preview */}
              {mediaUrls.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {mediaUrls.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => setMediaUrls((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 grid place-items-center h-5 w-5 rounded-full bg-black/60 text-white/80 hover:text-red-400 transition"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 mt-4">
                <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={onPickImage} />
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading || mediaUrls.length >= 4}
                  className="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-40"
                >
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
                  {uploading ? "Загрузка…" : "Фото"}
                </button>
                <div className="flex-1" />
                <button
                  onClick={submit}
                  disabled={posting || (!text.trim() && mediaUrls.length === 0)}
                  className="btn-glow px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-40"
                >
                  {posting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  Опубликовать
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
