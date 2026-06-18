"use client";

// =============================================================================
//  CreatePost — rectangular button in feed + modal to create posts
//  Limits: max 10 media files, 50 MB total, 280 chars text (Twitter-style)
// =============================================================================

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Image as ImageIcon, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { uploadMedia } from "@/lib/supabase";

const MAX_MEDIA = 10;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_TEXT = 280; // Twitter-style

export function CreatePost({ onPosted }: { onPosted: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [mediaSizes, setMediaSizes] = useState<number[]>([]);
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const totalSize = mediaSizes.reduce((a, b) => a + b, 0);
  const remainingSize = MAX_TOTAL_SIZE - totalSize;

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);

    // Check limits
    const slotsLeft = MAX_MEDIA - mediaUrls.length;
    if (slotsLeft <= 0) {
      setError(`Максимум ${MAX_MEDIA} файлов`);
      return;
    }

    const toUpload = files.slice(0, slotsLeft);
    let batchTotal = 0;
    for (const f of toUpload) batchTotal += f.size;

    if (totalSize + batchTotal > MAX_TOTAL_SIZE) {
      setError(`Превышен лимит 50 МБ. Доступно: ${(remainingSize / 1024 / 1024).toFixed(1)} МБ`);
      return;
    }

    setUploading(true);
    try {
      const urls: string[] = [];
      const sizes: number[] = [];
      for (const f of toUpload) {
        const url = await uploadMedia(f, "posts");
        urls.push(url);
        sizes.push(f.size);
      }
      setMediaUrls((prev) => [...prev, ...urls]);
      setMediaSizes((prev) => [...prev, ...sizes]);
    } catch {
      const urls = toUpload.map((f) => URL.createObjectURL(f));
      const sizes = toUpload.map((f) => f.size);
      setMediaUrls((prev) => [...prev, ...urls]);
      setMediaSizes((prev) => [...prev, ...sizes]);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function removeMedia(idx: number) {
    setMediaUrls((prev) => prev.filter((_, i) => i !== idx));
    setMediaSizes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!text.trim() && mediaUrls.length === 0) return;
    setPosting(true);
    setError(null);
    try {
      await api.createPost({
        text: text.trim() || undefined,
        media: mediaUrls.map((url) => ({ type: "image" as const, url })),
        tags: [],
      });
      setText("");
      setMediaUrls([]);
      setMediaSizes([]);
      setOpen(false);
      onPosted();
    } catch {
      setError("Не удалось опубликовать. Попробуй ещё раз.");
    } finally {
      setPosting(false);
    }
  }

  const charsLeft = MAX_TEXT - text.length;

  return (
    <>
      {/* Rectangular create button — full width */}
      <button
        onClick={() => setOpen(true)}
        className="w-full btn-glow rounded-2xl py-3.5 flex items-center justify-center gap-2 text-sm font-semibold"
      >
        <Plus size={18} /> Создать пост
      </button>

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

              {error && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-300">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              {/* Text area */}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
                maxLength={MAX_TEXT}
                rows={4}
                placeholder="Что у тебя на уме? ✦"
                autoFocus
                className="w-full rounded-2xl glass px-4 py-3 text-sm outline-none resize-none focus:border-neon-purple/40 transition"
              />
              <div className={`text-right text-[11px] mt-1 ${charsLeft < 20 ? "text-red-400" : "text-white/30"}`}>
                {text.length}/{MAX_TEXT}
              </div>

              {/* Media preview */}
              {mediaUrls.length > 0 && (
                <div className="grid grid-cols-5 gap-2 mt-3">
                  {mediaUrls.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => removeMedia(i)}
                        className="absolute top-1 right-1 grid place-items-center h-5 w-5 rounded-full bg-black/60 text-white/80 hover:text-red-400 transition"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Media info */}
              <div className="flex items-center gap-3 mt-3 text-[11px] text-white/35">
                <span>{mediaUrls.length}/{MAX_MEDIA} файлов</span>
                <span>·</span>
                <span>{(totalSize / 1024 / 1024).toFixed(1)} / 50 МБ</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-4">
                <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={onPickImage} />
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading || mediaUrls.length >= MAX_MEDIA}
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
