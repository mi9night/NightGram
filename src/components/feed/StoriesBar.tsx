"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X, ChevronLeft, ChevronRight, Loader2, Send, Heart, Users, Globe2, UserCheck, UsersRound } from "lucide-react";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { api } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";
import { pushGlobalToast } from "@/lib/toast";
import { useAuth } from "@/context/AuthContext";
import { CustomSelect } from "@/components/shared/CustomSelect";

type StoryVisibility = "public" | "followers" | "circle";
interface StoryItem { id: string; mediaUrl: string; mediaType: "image" | "video"; text?: string; visibility?: StoryVisibility; circleId?: string | null; createdAt: string; expiresAt: string }
interface StoryGroup { author: Record<string, unknown>; stories: StoryItem[]; viewed?: boolean }

const LOCAL_KEY = "ng_local_stories";

export function StoriesBar() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [likesOpen, setLikesOpen] = useState(false);
  const [storyLikes, setStoryLikes] = useState<Record<string, unknown>[]>([]);
  const [likedStories, setLikedStories] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ file: File; url: string; type: "image" | "video"; text: string; visibility: StoryVisibility; circleId: string } | null>(null);
  const [circles, setCircles] = useState<Record<string, unknown>[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadStories() {
    if (typeof window !== "undefined") localStorage.removeItem(LOCAL_KEY);
    try {
      const remote = await api.getStories();

const safeGroups = Array.isArray(remote)
  ? remote.filter((item): item is StoryGroup => {
      if (!item || typeof item !== "object") return false;

      const group = item as Partial<StoryGroup>;
      return Array.isArray(group.stories);
    })
  : [];

setGroups(safeGroups);
    } catch {
      setGroups([]);
      // Do not spam users with a scary launch-time error if stories tables are not installed yet.
      // Publishing still shows a clear migration error below.
    }
  }

  useEffect(() => { loadStories(); }, []);

  function pick(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const firstCircle = circles[0] ? String(circles[0].id) : "";
    setDraft({ file, url, type: file.type.startsWith("video/") ? "video" : "image", text: "", visibility: "public", circleId: firstCircle });
    api.getCircles().then((data) => {
      const list = data as Record<string, unknown>[];
      setCircles(list);
      if (list[0]) setDraft((d) => d && !d.circleId ? { ...d, circleId: String(list[0].id) } : d);
    }).catch(() => setCircles([]));
  }

  async function publishDraft() {
    if (!draft || !user) return;
    setCreating(true);
    try {
      if (draft.visibility === "circle" && !draft.circleId) {
        pushGlobalToast("Выбери Private Circle для истории", "error");
        setCreating(false);
        return;
      }
      const url = await uploadMedia(draft.file, "posts");
      await api.createStory({ mediaUrl: url, mediaType: draft.type, text: draft.text, visibility: draft.visibility, circleId: draft.visibility === "circle" ? draft.circleId : undefined });
      await loadStories();
      pushGlobalToast("История опубликована на 24 часа", "success");
      setDraft(null);
    } catch {
      pushGlobalToast("История не опубликована: backend/Supabase не приняли сторис. Запусти миграции stories и story_visibility.", "error");
    } finally {
      setCreating(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const activeGroup = viewerIndex !== null ? groups[viewerIndex] : null;
  const activeStory = activeGroup?.stories[storyIndex];

  function next() {
    if (!activeGroup) return;
    if (storyIndex < activeGroup.stories.length - 1) setStoryIndex((i) => i + 1);
    else if (viewerIndex !== null && viewerIndex < groups.length - 1) { setViewerIndex(viewerIndex + 1); setStoryIndex(0); }
    else setViewerIndex(null);
  }
  function prev() {
    if (storyIndex > 0) setStoryIndex((i) => i - 1);
    else if (viewerIndex !== null && viewerIndex > 0) { setViewerIndex(viewerIndex - 1); setStoryIndex(0); }
  }

  useEffect(() => {
    setLikesOpen(false);
    setStoryLikes([]);
  }, [activeStory?.id]);

  async function likeActiveStory() {
    if (!activeStory) return;
    try {
      const res = await api.toggleStoryLike(activeStory.id);
      setLikedStories((prev) => {
        const next = new Set(prev);
        if (res.liked) next.add(activeStory.id);
        else next.delete(activeStory.id);
        return next;
      });
      pushGlobalToast(res.liked ? "Лайк истории" : "Лайк убран", "success");
    } catch {
      pushGlobalToast("Не удалось поставить лайк. Проверь миграцию story_likes.", "error");
    }
  }

  async function openStoryLikes() {
    if (!activeStory) return;
    setLikesOpen(true);
    api.getStoryLikes(activeStory.id).then((data) => setStoryLikes(data as Record<string, unknown>[])).catch(() => setStoryLikes([]));
  }

  return (
    <>
      <div className="glass-strong rounded-3xl p-3 overflow-hidden">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide">
          <button onClick={() => fileInput.current?.click()} className="shrink-0 flex flex-col items-center gap-1 text-xs text-white/55 hover:text-white transition">
            <span className="grid h-16 w-16 place-items-center rounded-full border border-dashed border-neon-purple/50 bg-neon-purple/10 text-neon-purple">
              {creating ? <Loader2 size={20} className="animate-spin" /> : <Plus size={22} />}
            </span>
            История
          </button>
          <input ref={fileInput} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => pick(e.currentTarget.files?.[0])} />

          {groups.map((group, i) => {
            const author = group.author || {};
            return (
              <button key={String(author.id ?? i)} onClick={() => { setViewerIndex(i); setStoryIndex(0); }} className="shrink-0 flex flex-col items-center gap-1 text-xs text-white/60 hover:text-white transition">
                <span className="rounded-full p-[2px] bg-gradient-to-br from-neon-purple via-neon-pink to-neon-gold shadow-glow">
                  <GlowAvatar src={(author.avatarUrl as string) ?? (author.avatar_url as string) ?? null} alt={String(author.username ?? "story")} size={62} />
                </span>
                <span className="max-w-[70px] truncate">@{String(author.username ?? "user")}</span>
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {draft && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10050] grid place-items-center overflow-y-auto bg-black/85 backdrop-blur-xl p-4 py-6 sm:py-8">
            <button onClick={() => setDraft(null)} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full glass text-white/70 hover:text-white"><X size={20} /></button>
            <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="w-full max-w-md ng-solid rounded-4xl p-4 shadow-glow-lg">
              <h3 className="font-display font-bold text-xl mb-3">Предпросмотр истории</h3>
              <div className="overflow-hidden rounded-3xl bg-black">
                {draft.type === "video" ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={draft.url} className="max-h-[60vh] w-full object-contain" controls />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.url} alt="" className="max-h-[60vh] w-full object-contain" />
                )}
              </div>
              <input value={draft.text} onChange={(e) => setDraft((d) => d && { ...d, text: e.target.value.slice(0, 160) })} placeholder="Подпись к истории…" className="mt-3 w-full rounded-2xl glass px-4 py-3 text-sm outline-none" />
              <div className="mt-3 rounded-2xl glass p-3">
                <div className="mb-2 text-xs text-white/45">Кто увидит историю</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["public", "Всем", Globe2],
                    ["followers", "Подписчикам", UserCheck],
                    ["circle", "Кругу", UsersRound],
                  ] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => setDraft((d) => d && { ...d, visibility: id })} className={draft.visibility === id ? "btn-glow px-2 py-2 text-xs" : "btn-ghost px-2 py-2 text-xs"}>
                      <Icon size={13} className="inline mr-1" /> {label}
                    </button>
                  ))}
                </div>
                {draft.visibility === "circle" && (
                  circles.length === 0 ? (
                    <div className="mt-2 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">Private Circles пока нет. Создай круг в Настройки → Социальное.</div>
                  ) : (
                    <CustomSelect
                      value={draft.circleId}
                      onChange={(value) => setDraft((d) => d && { ...d, circleId: value })}
                      className="mt-2"
                      buttonClassName="rounded-xl px-3 py-2 text-xs"
                      options={circles.map((circle) => ({ value: String(circle.id), label: String(circle.name) }))}
                    />
                  )
                )}
              </div>
              <button onClick={publishDraft} disabled={creating} className="btn-glow mt-3 w-full py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Опубликовать
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeGroup && activeStory && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10050] bg-black/90 backdrop-blur-xl grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
            <button onClick={() => setViewerIndex(null)} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full glass text-white/70 hover:text-white"><X size={20} /></button>
            <button onClick={prev} className="absolute left-4 grid h-11 w-11 place-items-center rounded-full glass text-white/70 hover:text-white"><ChevronLeft size={24} /></button>
            <button onClick={next} className="absolute right-4 grid h-11 w-11 place-items-center rounded-full glass text-white/70 hover:text-white"><ChevronRight size={24} /></button>
            <div className="w-full max-w-md">
              <div className="mb-3 flex gap-1">
                {activeGroup.stories.map((s, i) => <div key={s.id} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden"><div className="h-full bg-white" style={{ width: i <= storyIndex ? "100%" : "0%" }} /></div>)}
              </div>
              <div className="overflow-hidden rounded-4xl bg-black shadow-glow-lg">
                {activeStory.mediaType === "video" ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={activeStory.mediaUrl} className="max-h-[75vh] w-full object-contain" controls autoPlay />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeStory.mediaUrl} alt="" className="max-h-[75vh] w-full object-contain" />
                )}
              </div>
              {activeStory.text && <div className="mt-3 rounded-2xl glass p-3 text-sm text-white/80">{activeStory.text}</div>}
              <div className="mt-3 flex items-center justify-center gap-2">
                <button onClick={likeActiveStory} className={likedStories.has(activeStory.id) ? "btn-glow px-4 py-2 text-sm flex items-center gap-2" : "btn-ghost px-4 py-2 text-sm flex items-center gap-2"}>
                  <Heart size={15} className={likedStories.has(activeStory.id) ? "fill-current" : ""} /> Лайк
                </button>
                <button onClick={openStoryLikes} className="btn-ghost px-4 py-2 text-sm flex items-center gap-2">
                  <Users size={15} /> Кто лайкнул
                </button>
              </div>
            </div>

            <AnimatePresence>
              {likesOpen && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="absolute bottom-4 left-1/2 w-[min(92vw,360px)] -translate-x-1/2 rounded-3xl ng-solid p-4 shadow-glow-lg">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="font-semibold text-sm">Лайки истории</div>
                    <button onClick={() => setLikesOpen(false)} className="text-white/45 hover:text-white"><X size={16} /></button>
                  </div>
                  {storyLikes.length === 0 ? <div className="py-4 text-center text-xs text-white/40">Пока никто не лайкнул</div> : (
                    <div className="max-h-52 space-y-2 overflow-y-auto">
                      {storyLikes.map((u) => (
                        <div key={String(u.id)} className="flex items-center gap-2 rounded-2xl glass px-3 py-2">
                          <GlowAvatar src={(u.avatarUrl as string) ?? (u.avatar_url as string) ?? null} alt={String(u.username ?? "")} size={32} />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{String(u.displayName ?? u.display_name ?? u.username ?? "")}</div>
                            <div className="text-xs text-white/40">@{String(u.username ?? "")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
