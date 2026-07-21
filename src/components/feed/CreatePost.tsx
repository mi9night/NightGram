"use client";

// =============================================================================
//  CreatePost — rectangular button in feed + modal to create posts
//  Limits: max 10 media files, 50 MB total, 280 chars text (Twitter-style)
// =============================================================================

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Image as ImageIcon, Loader2, Sparkles, AlertCircle, Globe2, UserCheck, UsersRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { uploadMediaDetailed, type UploadProgress } from "@/lib/upload";
import { CustomSelect } from "@/components/shared/CustomSelect";

const MAX_MEDIA = 10;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_TEXT = 280; // Twitter-style

type DraftMedia = { url: string; thumbnailUrl?: string; type: "image" | "video"; size: number; width?: number; height?: number; durationSec?: number };
type PostVisibility = "public" | "followers" | "circle";

export function CreatePost({ onPosted }: { onPosted: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mediaItems, setMediaItems] = useState<DraftMedia[]>([]);
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress & { fileName: string; index: number; totalFiles: number } | null>(null);
  const [preserveOriginal, setPreserveOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [circles, setCircles] = useState<Record<string, unknown>[]>([]);
  const [circleId, setCircleId] = useState<string>("");
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const totalSize = mediaItems.reduce((a, item) => a + item.size, 0);
  const remainingSize = MAX_TOTAL_SIZE - totalSize;

  useEffect(() => {
    if (!open) return;
    api.getCircles().then((data) => {
      const list = data as Record<string, unknown>[];
      setCircles(list);
      if (!circleId && list[0]) setCircleId(String(list[0].id));
    }).catch(() => setCircles([]));
  }, [circleId, open]);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);

    // Check limits
    const slotsLeft = MAX_MEDIA - mediaItems.length;
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

    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setUploading(true);
    try {
      const uploaded: DraftMedia[] = [];
      for (let index = 0; index < toUpload.length; index += 1) {
        const f = toUpload[index];
        const media = await uploadMediaDetailed(f, "posts", {
          preserveOriginal,
          signal: controller.signal,
          onProgress: (progress) => {
            const overallPercent = Math.round(((index + progress.percent / 100) / Math.max(1, toUpload.length)) * 100);
            setUploadProgress({ ...progress, percent: overallPercent, fileName: f.name, index: index + 1, totalFiles: toUpload.length });
          },
        });
        uploaded.push({
          url: media.url,
          thumbnailUrl: media.thumbnailUrl,
          size: media.uploadedSize,
          type: media.type === "video" ? "video" : "image",
          width: media.width,
          height: media.height,
          durationSec: media.durationSec,
        });
        setMediaItems((prev) => [...prev, uploaded[uploaded.length - 1]]);
      }
    } catch (uploadError) {
      const cancelled = uploadError instanceof DOMException && uploadError.name === "AbortError";
      setError(cancelled ? "Загрузка отменена. Уже загруженные файлы сохранены в посте." : uploadError instanceof Error ? uploadError.message : "Не удалось загрузить медиа");
    } finally {
      uploadAbortRef.current = null;
      setUploadProgress(null);
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function removeMedia(idx: number) {
    setMediaItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!text.trim() && mediaItems.length === 0) return;
    if (visibility === "circle" && !circleId) {
      setError("Создай или выбери Private Circle для приватного поста");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      await api.createPost({
        text: text.trim() || undefined,
        media: mediaItems.map((item) => ({
          type: item.type,
          url: item.url,
          thumbnailUrl: item.thumbnailUrl,
          width: item.width,
          height: item.height,
          durationSec: item.durationSec,
        })),
        tags: [],
        visibility,
        circleId: visibility === "circle" ? circleId : undefined,
      });
      setText("");
      setMediaItems([]);
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
            className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !posting && !uploading && setOpen(false)} />

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="relative z-10 w-full max-w-lg ng-solid rounded-4xl p-6 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-lg flex items-center gap-2">
                  <Sparkles size={18} className="text-neon-purple" /> Новый пост
                </h3>
                <button onClick={() => !posting && !uploading && setOpen(false)} className="grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition">
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

              <div className="mt-3 rounded-2xl glass p-3">
                <div className="mb-2 text-xs text-white/45">Кто увидит пост</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["public", "Всем", Globe2],
                    ["followers", "Подписчикам", UserCheck],
                    ["circle", "Кругу", UsersRound],
                  ] as const).map(([id, label, Icon]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setVisibility(id)}
                      className={visibility === id ? "btn-glow px-2 py-2 text-xs" : "btn-ghost px-2 py-2 text-xs"}
                    >
                      <Icon size={13} className="inline mr-1" /> {label}
                    </button>
                  ))}
                </div>
                {visibility === "circle" && (
                  circles.length === 0 ? (
                    <div className="mt-2 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">Private Circles пока нет. Создай круг в Настройки → Социальное.</div>
                  ) : (
                    <CustomSelect
                      value={circleId}
                      onChange={setCircleId}
                      className="mt-2"
                      buttonClassName="rounded-xl px-3 py-2 text-xs"
                      options={circles.map((circle) => ({ value: String(circle.id), label: String(circle.name) }))}
                    />
                  )
                )}
              </div>

              {/* Media preview */}
              {mediaItems.length > 0 && (
                <div className="grid grid-cols-5 gap-2 mt-3">
                  {mediaItems.map((item, i) => (
                    <div key={`${item.url}-${i}`} className="relative aspect-square rounded-xl overflow-hidden group">
                      {item.type === "video" ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video src={item.url} className="h-full w-full object-cover" muted playsInline />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      )}
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
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-white/35">
                <span>{mediaItems.length}/{MAX_MEDIA} файлов</span>
                <span>·</span>
                <span>{(totalSize / 1024 / 1024).toFixed(1)} / 50 МБ</span>
                <button
                  type="button"
                  onClick={() => setPreserveOriginal((value) => !value)}
                  disabled={uploading}
                  className={preserveOriginal ? "rounded-full border border-neon-purple/45 bg-neon-purple/15 px-2.5 py-1 text-neon-purple" : "rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/45 hover:text-white"}
                >
                  {preserveOriginal ? "Оригиналы" : "Сжимать фото"}
                </button>
              </div>

              {uploadProgress && (
                <div className="mt-3 rounded-2xl border border-neon-purple/20 bg-neon-purple/8 p-3">
                  <div className="flex items-center gap-3">
                    <Loader2 size={15} className={uploadProgress.phase === "waiting-network" ? "text-neon-purple" : "animate-spin text-neon-purple"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-white/70">
                        <span className="truncate">{uploadProgress.phase === "waiting-network" ? "Ожидание сети" : `Загрузка ${uploadProgress.index}/${uploadProgress.totalFiles}`}</span>
                        <span className="font-semibold text-neon-purple">{uploadProgress.percent}%</span>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-white/35">{uploadProgress.fileName}</div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
                        <div className="h-full rounded-full bg-neon-purple transition-[width]" style={{ width: `${uploadProgress.percent}%` }} />
                      </div>
                    </div>
                    <button type="button" onClick={() => uploadAbortRef.current?.abort()} className="grid h-8 w-8 place-items-center rounded-xl bg-white/5 text-white/45 hover:text-red-300" title="Отменить загрузку"><X size={14} /></button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 mt-4">
                <input ref={fileInput} type="file" accept="image/*,video/*" multiple className="hidden" onChange={onPickImage} />
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading || mediaItems.length >= MAX_MEDIA}
                  className="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-40"
                >
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
                  {uploading ? "Загрузка…" : "Фото/видео"}
                </button>
                <div className="flex-1" />
                <button
                  onClick={submit}
                  disabled={posting || (!text.trim() && mediaItems.length === 0)}
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
