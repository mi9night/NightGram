"use client";

// =============================================================================
//  NightGram Web — Music page with REAL tracks
//  Search via iTunes API, categories in Saved (Spotify/SC/VK)
// =============================================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipForward, SkipBack, Search, Heart, Radio,
  Sparkles, ListMusic, Shuffle, Repeat, X, Loader2, Music2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { searchTracks, getTrendingTracks, type RealTrack } from "@/lib/musicApi";
import { cn } from "@/lib/utils";

type Tab = "wave" | "recommendations" | "search" | "saved";
type Platform = "all" | "spotify" | "soundcloud" | "vk";

const PLATFORM_CONFIG: Record<Platform, { label: string; icon: string; color: string }> = {
  all: { label: "Все", icon: "🎵", color: "#a855f7" },
  spotify: { label: "Spotify", icon: "🟢", color: "#1DB954" },
  soundcloud: { label: "SoundCloud", icon: "🟠", color: "#FF5500" },
  vk: { label: "VK Музыка", icon: "🔵", color: "#0077FF" },
};

export default function MusicPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("wave");
  const [currentTrack, setCurrentTrack] = useState<RealTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [queue, setQueue] = useState<RealTrack[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [savedPlatform, setSavedPlatform] = useState<Platform>("all");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RealTrack[]>([]);
  const [searching, setSearching] = useState(false);

  // Recommendations state
  const [recommended, setRecommended] = useState<RealTrack[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
    }
    return () => { if (audioRef.current) audioRef.current.pause(); };
  }, []);

  // Play / pause
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    audioRef.current.src = currentTrack.preview;
    audioRef.current.volume = volume;
    if (playing) {
      audioRef.current.play().catch(() => setPlaying(false));
    } else {
      audioRef.current.pause();
    }
  }, [currentTrack, playing]);

  // Progress
  useEffect(() => {
    if (playing && currentTrack) {
      intervalRef.current = setInterval(() => {
        if (audioRef.current) {
          const dur = audioRef.current.duration || currentTrack.duration;
          setProgress((audioRef.current.currentTime / dur) * 100);
          if (audioRef.current.currentTime >= dur - 0.5) {
            nextTrack();
          }
        }
      }, 500);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, currentTrack]);

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Load recommendations on mount
  useEffect(() => {
    if (tab === "recommendations" && recommended.length === 0) {
      loadRecommendations();
    }
  }, [tab]);

  // Debounced search
  useEffect(() => {
    if (tab !== "search" || !searchQuery.trim()) return;
    const t = setTimeout(() => doSearch(searchQuery), 600);
    return () => clearTimeout(t);
  }, [searchQuery, tab]);

  const loadRecommendations = useCallback(async () => {
    setLoadingRecs(true);
    const tracks = await getTrendingTracks();
    setRecommended(tracks);
    setLoadingRecs(false);
  }, []);

  const doSearch = useCallback(async (query: string) => {
    setSearching(true);
    const results = await searchTracks(query);
    setSearchResults(results);
    setSearching(false);
  }, []);

  function playTrack(track: RealTrack, list?: RealTrack[]) {
    if (list) setQueue(list);
    if (currentTrack?.id === track.id) {
      setPlaying((v) => !v);
    } else {
      setCurrentTrack(track);
      setProgress(0);
      setPlaying(true);
    }
  }

  function nextTrack() {
    if (!currentTrack || queue.length === 0) return;
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const nextIdx = shuffle ? Math.floor(Math.random() * queue.length) : (idx + 1) % queue.length;
    setCurrentTrack(queue[nextIdx]);
    setProgress(0);
    setPlaying(true);
  }

  function prevTrack() {
    if (!currentTrack || queue.length === 0) return;
    const idx = queue.findIndex((t) => t.id === currentTrack.id);
    const prevIdx = (idx - 1 + queue.length) % queue.length;
    setCurrentTrack(queue[prevIdx]);
    setProgress(0);
    setPlaying(true);
  }

  function toggleLike(id: string) {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function fmt(sec: number) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioRef.current || !currentTrack) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * audioRef.current.duration;
  }

  const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "wave", label: "Моя волна", icon: Radio },
    { id: "recommendations", label: "Рекомендации", icon: Sparkles },
    { id: "search", label: "Поиск", icon: Search },
    { id: "saved", label: "Сохранёнки", icon: Heart },
  ];

  // All liked tracks
  const allTracks = [...recommended, ...searchResults, ...queue];
  const savedTracks = allTracks.filter((t) => liked.has(t.id));

  return (
    <div className="max-w-3xl mx-auto px-4 pb-32">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <h1 className="font-display font-bold text-2xl flex items-center gap-2">
          <ListMusic size={22} className="text-neon-purple" /> Музыка
        </h1>
        <p className="text-sm text-white/45">Слушай треки прямо в NightGram</p>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm whitespace-nowrap transition",
                tab === t.id ? "bg-neon-purple/20 text-white border border-neon-purple/40 shadow-glow" : "glass text-white/55 hover:text-white")}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      {tab === "search" && (
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Введи название трека или исполнителя…"
            className="w-full rounded-xl glass pl-9 pr-9 py-2.5 text-sm outline-none focus:border-neon-purple/40" />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); setSearchResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
              <X size={15} />
            </button>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} transition={{ duration: 0.2 }} className="space-y-2">
          {/* ===== МОЯ ВОЛНА ===== */}
          {tab === "wave" && (
            <>
              <WaveBanner playing={playing} onToggle={() => {
                if (recommended.length === 0) { loadRecommendations(); }
                if (currentTrack) { setPlaying((v) => !v); }
                else if (recommended.length > 0) { playTrack(recommended[0], recommended); }
                else { setTimeout(() => recommended.length > 0 && playTrack(recommended[0], recommended), 1000); }
              }} />
              {loadingRecs ? (
                <div className="text-center py-8"><Loader2 size={20} className="animate-spin mx-auto text-white/40" /></div>
              ) : (
                recommended.slice(0, 10).map((track, i) => (
                  <TrackRow key={track.id} track={track} currentTrack={currentTrack} playing={playing}
                    liked={liked.has(track.id)} onPlay={() => playTrack(track, recommended.slice(0, 10))}
                    onLike={() => toggleLike(track.id)} fmt={fmt} delay={i * 0.04} />
                ))
              )}
            </>
          )}

          {/* ===== РЕКОМЕНДАЦИИ ===== */}
          {tab === "recommendations" && (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-white/45 ml-1">Подобрано специально для тебя ✦</p>
                <button onClick={loadRecommendations} className="text-xs text-neon-purple hover:underline flex items-center gap-1">
                  <Sparkles size={12} /> Обновить
                </button>
              </div>
              {loadingRecs ? (
                <div className="text-center py-8"><Loader2 size={20} className="animate-spin mx-auto text-white/40" /></div>
              ) : recommended.length === 0 ? (
                <EmptyState icon={Sparkles} text="Не удалось загрузить рекомендации" />
              ) : (
                recommended.map((track, i) => (
                  <TrackRow key={track.id} track={track} currentTrack={currentTrack} playing={playing}
                    liked={liked.has(track.id)} onPlay={() => playTrack(track, recommended)}
                    onLike={() => toggleLike(track.id)} fmt={fmt} delay={i * 0.03} />
                ))
              )}
            </>
          )}

          {/* ===== ПОИСК ===== */}
          {tab === "search" && (
            <>
              {searching && (
                <div className="text-center py-8"><Loader2 size={20} className="animate-spin mx-auto text-white/40" /></div>
              )}
              {!searching && !searchQuery && (
                <EmptyState icon={Search} text="Введи название трека для поиска" />
              )}
              {!searching && searchQuery && searchResults.length === 0 && (
                <EmptyState icon={Search} text="Ничего не найдено" />
              )}
              {!searching && searchResults.map((track, i) => (
                <TrackRow key={track.id} track={track} currentTrack={currentTrack} playing={playing}
                  liked={liked.has(track.id)} onPlay={() => playTrack(track, searchResults)}
                  onLike={() => toggleLike(track.id)} fmt={fmt} delay={i * 0.03} />
              ))}
            </>
          )}

          {/* ===== СОХРАНЁНКИ ===== */}
          {tab === "saved" && (
            <>
              {/* Platform categories */}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-3">
                {(["all", "spotify", "soundcloud", "vk"] as Platform[]).map((p) => {
                  const cfg = PLATFORM_CONFIG[p];
                  const count = p === "all" ? savedTracks.length : 0;
                  return (
                    <button key={p} onClick={() => setSavedPlatform(p)}
                      className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs whitespace-nowrap transition",
                        savedPlatform === p ? "border" : "glass text-white/55",
                      )}
                      style={savedPlatform === p ? { background: `${cfg.color}15`, borderColor: `${cfg.color}40`, color: cfg.color } : {}}>
                      <span>{cfg.icon}</span> {cfg.label}
                    </button>
                  );
                })}
              </div>

              {savedTracks.length === 0 ? (
                <EmptyState icon={Heart} text="Нет сохранённых треков. Нажми ♥ на треке!" />
              ) : savedPlatform !== "all" ? (
                <div className="glass rounded-2xl p-6 text-center">
                  <div className="text-3xl mb-3">{PLATFORM_CONFIG[savedPlatform].icon}</div>
                  <p className="text-sm text-white/60 mb-2">
                    {PLATFORM_CONFIG[savedPlatform].label} сохранёнки
                  </p>
                  <p className="text-xs text-white/40">
                    Подключи {PLATFORM_CONFIG[savedPlatform].label} в настройках, чтобы импортировать твою библиотеку
                  </p>
                  <button onClick={() => window.location.href = "/settings"}
                    className="btn-ghost mt-3 px-4 py-2 text-xs">
                    Подключить
                  </button>
                </div>
              ) : (
                savedTracks.map((track, i) => (
                  <TrackRow key={track.id} track={track} currentTrack={currentTrack} playing={playing}
                    liked={true} onPlay={() => playTrack(track, savedTracks)}
                    onLike={() => toggleLike(track.id)} fmt={fmt} delay={i * 0.03} />
                ))
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Player bar */}
      <AnimatePresence>
        {currentTrack && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }} className="fixed bottom-16 md:bottom-4 left-4 right-4 z-40">
            <div className="max-w-2xl mx-auto ng-solid rounded-2xl p-3 shadow-glow-lg">
              <div className="flex items-center gap-3">
                {/* Cover */}
                {currentTrack.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentTrack.cover} alt="" className="h-10 w-10 rounded-lg shrink-0 object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-lg shrink-0 grid place-items-center" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
                    <Music2 size={18} className="text-white" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{currentTrack.title}</div>
                  <div className="text-xs text-white/45 truncate">{currentTrack.artist}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setShuffle((v) => !v)}
                    className={cn("grid place-items-center h-8 w-8 rounded-lg transition", shuffle ? "text-neon-purple bg-neon-purple/10" : "text-white/50 hover:text-white")}>
                    <Shuffle size={15} />
                  </button>
                  <button onClick={prevTrack} className="grid place-items-center h-8 w-8 rounded-lg text-white/60 hover:text-white transition">
                    <SkipBack size={16} className="fill-current" />
                  </button>
                  <button onClick={() => setPlaying((v) => !v)} className="grid place-items-center h-10 w-10 rounded-full btn-glow">
                    {playing ? <Pause size={18} className="fill-white" /> : <Play size={18} className="fill-white ml-0.5" />}
                  </button>
                  <button onClick={nextTrack} className="grid place-items-center h-8 w-8 rounded-lg text-white/60 hover:text-white transition">
                    <SkipForward size={16} className="fill-current" />
                  </button>
                  <button onClick={() => setRepeat((v) => !v)}
                    className={cn("grid place-items-center h-8 w-8 rounded-lg transition", repeat ? "text-neon-purple bg-neon-purple/10" : "text-white/50 hover:text-white")}>
                    <Repeat size={15} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-white/35 tabular-nums w-8">
                  {audioRef.current ? fmt(audioRef.current.currentTime) : "0:00"}
                </span>
                <div className="flex-1 h-1 rounded-full bg-white/10 cursor-pointer" onClick={seek}>
                  <div className="h-full rounded-full"
                    style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--accent-main), var(--accent-secondary))" }} />
                </div>
                <span className="text-[10px] text-white/35 tabular-nums w-8">{fmt(currentTrack.duration)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==== Track Row component ====
function TrackRow({ track, currentTrack, playing, liked, onPlay, onLike, fmt, delay }: {
  track: RealTrack;
  currentTrack: RealTrack | null;
  playing: boolean;
  liked: boolean;
  onPlay: () => void;
  onLike: () => void;
  fmt: (sec: number) => string;
  delay: number;
}) {
  const isCurrent = currentTrack?.id === track.id;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(delay, 0.3) }}
      className={cn("flex items-center gap-3 rounded-xl p-2.5 transition cursor-pointer", isCurrent ? "glass-strong" : "hover:bg-white/5")}
      onClick={onPlay}>
      <div className="relative h-11 w-11 rounded-lg overflow-hidden shrink-0">
        {track.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full grid place-items-center" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
            <Music2 size={18} className="text-white" />
          </div>
        )}
        {isCurrent && playing && (
          <div className="absolute inset-0 grid place-items-center bg-black/50">
            <div className="flex items-end gap-0.5 h-4">
              {[0, 1, 2, 3].map((b) => (
                <motion.span key={b} className="w-0.5 bg-white rounded-full"
                  animate={{ height: ["30%", "100%", "50%", "80%", "30%"] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: b * 0.15 }} style={{ height: "40%" }} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn("text-sm font-medium truncate", isCurrent && "text-neon-purple")}>{track.title}</div>
        <div className="text-xs text-white/45 truncate">{track.artist}</div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onLike(); }}
        className={cn("shrink-0 transition", liked ? "text-neon-pink" : "text-white/40 hover:text-white")}>
        <Heart size={16} className={liked ? "fill-current" : ""} />
      </button>
      <span className="text-xs text-white/35 shrink-0 tabular-nums">{fmt(track.duration)}</span>
    </motion.div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="text-center py-12 text-white/40">
      <Icon size={32} className="mx-auto mb-3 opacity-50" />
      <p>{text}</p>
    </div>
  );
}

// ==== Wave Banner (VK style) ====
function WaveBanner({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="relative overflow-visible rounded-4xl mb-4" style={{ minHeight: 200 }}>
      <motion.div className="absolute inset-0"
        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7, #ec4899, #f59e0b, #6366f1)", backgroundSize: "300% 300%" }}
        animate={{ backgroundPosition: ["0% 50%", "50% 0%", "100% 50%", "50% 100%", "0% 50%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }} />
      <motion.div className="absolute top-4 left-4 h-20 w-20 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.3), transparent 70%)" }}
        animate={{ y: [0, -15, 0], x: [0, 10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute bottom-4 right-8 h-24 w-24 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.2), transparent 70%)" }}
        animate={{ y: [0, 20, 0], x: [0, -15, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
      {playing && (
        <div className="absolute inset-0 flex items-end justify-center gap-1 opacity-30 pb-8">
          {Array.from({ length: 24 }).map((_, i) => (
            <motion.div key={i} className="w-2 bg-white rounded-t-full"
              animate={{ height: ["10%", `${30 + Math.random() * 70}%`, "10%"] }}
              transition={{ duration: 0.5 + Math.random() * 0.5, repeat: Infinity, delay: i * 0.05 }} />
          ))}
        </div>
      )}
      <div className="relative z-10 flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 200 }}>
        <motion.div animate={playing ? { rotate: 360 } : {}}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-md grid place-items-center mb-4">
          <Radio size={32} className="text-white" />
        </motion.div>
        <h2 className="font-display font-bold text-2xl text-white drop-shadow-lg">Моя волна</h2>
        <p className="text-white/80 text-sm mt-1 drop-shadow">Бесконечный поток музыки на основе твоих вкусов</p>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onToggle}
          className="mt-5 h-14 w-14 rounded-full bg-white grid place-items-center shadow-2xl">
          {playing ? <Pause size={26} className="fill-purple-600 text-purple-600" /> : <Play size={26} className="fill-purple-600 text-purple-600 ml-1" />}
        </motion.button>
      </div>
    </motion.div>
  );
}
