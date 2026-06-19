"use client";

// =============================================================================
//  NightGram Web — Music page (media player like VK)
//  Tabs: Моя волна · Рекомендации · Поиск · Сохранёнки
// =============================================================================

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipForward, SkipBack, Search, Heart, Radio,
  Sparkles, ListMusic, Shuffle, Repeat, X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ---- Mock tracks ----
const TRACKS = [
  { id: "t1", title: "Midnight Drive", artist: "Neon Pulse", duration: 15, cover: "linear-gradient(135deg,#a855f7,#ec4899)", audio: "https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg" },
  { id: "t2", title: "Aurora", artist: "Lumen", duration: 91, cover: "linear-gradient(135deg,#22d3ee,#6366f1)", audio: "https://commondatastorage.googleapis.com/codeskulptor-assets/week3-POP-remix.ogg" },
  { id: "t3", title: "Nightcall", artist: "Vex", duration: 68, cover: "linear-gradient(135deg,#fbbf24,#f59e0b)", audio: "https://commondatastorage.googleapis.com/codeskulptor-assets/Action_RPG.ogg" },
  { id: "t4", title: "Starlight", artist: "Nova Aurora", duration: 15, cover: "linear-gradient(135deg,#ec4899,#8b5cf6)", audio: "https://commondatastorage.googleapis.com/codeskulptor-assets/Evillaugh.ogg" },
  { id: "t5", title: "Echoes", artist: "Synthwave Co", duration: 94, cover: "linear-gradient(135deg,#6366f1,#a855f7)", audio: "https://commondatastorage.googleapis.com/codeskulptor-assets/OzzyLizardKing.ogg" },
  { id: "t6", title: "Velvet Sky", artist: "Ember Vale", duration: 83, cover: "linear-gradient(135deg,#10b981,#06b6d4)", audio: "https://commondatastorage.googleapis.com/codeskulptor-assets/sky_and_sand.ogg" },
  { id: "t7", title: "Lost in Neon", artist: "Kestrel", duration: 95, cover: "linear-gradient(135deg,#f97316,#ef4444)", audio: "https://commondatastorage.googleapis.com/codeskulptor-assets/Jump.ogg" },
  { id: "t8", title: "Dreamscape", artist: "Midnight Crew", duration: 110, cover: "linear-gradient(135deg,#8b5cf6,#3b82f6)", audio: "https://commondatastorage.googleapis.com/codeskulptor-assets/pypilot.ogg" },
];

type Tab = "wave" | "recommendations" | "search" | "saved";

export default function MusicPage() {
  const [tab, setTab] = useState<Tab>("wave");
  const [currentTrack, setCurrentTrack] = useState<typeof TRACKS[0] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = 0.7;
    }
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  // Play/pause real audio when track changes
  useEffect(() => {
    if (!audioRef.current) return;
    if (playing && currentTrack?.audio) {
      audioRef.current.src = currentTrack.audio;
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [playing, currentTrack]);

  useEffect(() => {
    if (playing && currentTrack) {
      intervalRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= currentTrack.duration) {
            if (repeat) return 0;
            const idx = TRACKS.findIndex((t) => t.id === currentTrack.id);
            const nextIdx = shuffle ? Math.floor(Math.random() * TRACKS.length) : (idx + 1) % TRACKS.length;
            setCurrentTrack(TRACKS[nextIdx]);
            return 0;
          }
          return p + 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, currentTrack, repeat, shuffle]);

  function playTrack(track: typeof TRACKS[0]) {
    if (currentTrack?.id === track.id) {
      setPlaying((v) => !v);
    } else {
      setCurrentTrack(track);
      setProgress(0);
      setPlaying(true);
    }
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

  const filteredTracks = searchQuery
    ? TRACKS.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.artist.toLowerCase().includes(searchQuery.toLowerCase()))
    : TRACKS;

  const savedTracks = TRACKS.filter((t) => liked.has(t.id));

  const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "wave", label: "Моя волна", icon: Radio },
    { id: "recommendations", label: "Рекомендации", icon: Sparkles },
    { id: "search", label: "Поиск", icon: Search },
    { id: "saved", label: "Сохранёнки", icon: Heart },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 pb-32">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <h1 className="font-display font-bold text-2xl flex items-center gap-2">
          <ListMusic size={22} className="text-neon-purple" /> Музыка
        </h1>
        <p className="text-sm text-white/45">Слушай треки прямо в NightGram</p>
      </motion.div>

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

      {tab === "search" && (
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск треков и исполнителей…"
            className="w-full rounded-xl glass pl-9 pr-9 py-2.5 text-sm outline-none focus:border-neon-purple/40" />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
              <X size={15} />
            </button>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} transition={{ duration: 0.2 }} className="space-y-2">
          {/* ===== МОЯ ВОЛНА — большая анимированная плашка ===== */}
          {tab === "wave" && (
            <WaveBanner playing={playing} onToggle={() => currentTrack ? setPlaying((v) => !v) : playTrack(TRACKS[0])} />
          )}

          {tab === "recommendations" && (
            <p className="text-sm text-white/45 mb-3 ml-1">Подобрано специально для тебя ✦</p>
          )}

          {tab === "saved" && savedTracks.length === 0 && (
            <div className="text-center py-12 text-white/40">
              <Heart size={32} className="mx-auto mb-3" />
              <p>Нет сохранённых треков</p>
              <p className="text-xs mt-1">Нажми ♥ на треке, чтобы сохранить</p>
            </div>
          )}

          {tab === "search" && filteredTracks.length === 0 && (
            <div className="text-center py-12 text-white/40">
              <Search size={32} className="mx-auto mb-3" />
              <p>Ничего не найдено</p>
            </div>
          )}

          {(tab === "wave" || tab === "recommendations" ? TRACKS : tab === "saved" ? savedTracks : filteredTracks).map((track, i) => {
            const isCurrent = currentTrack?.id === track.id;
            const isLiked = liked.has(track.id);
            return (
              <motion.div key={track.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}
                className={cn("flex items-center gap-3 rounded-xl p-2.5 transition cursor-pointer", isCurrent ? "glass-strong" : "hover:bg-white/5")}
                onClick={() => playTrack(track)}>
                <div className="relative h-11 w-11 rounded-lg overflow-hidden shrink-0" style={{ background: track.cover }}>
                  {isCurrent && playing ? (
                    <div className="absolute inset-0 grid place-items-center bg-black/40">
                      <div className="flex items-end gap-0.5 h-4">
                        {[0, 1, 2, 3].map((b) => (
                          <motion.span key={b} className="w-0.5 bg-white rounded-full"
                            animate={{ height: ["30%", "100%", "50%", "80%", "30%"] }}
                            transition={{ duration: 0.8, repeat: Infinity, delay: b * 0.15 }}
                            style={{ height: "40%" }} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 grid place-items-center bg-black/0 hover:bg-black/40 transition">
                      <Play size={16} className="text-white opacity-0 group-hover:opacity-100 fill-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-sm font-medium truncate", isCurrent && "text-neon-purple")}>{track.title}</div>
                  <div className="text-xs text-white/45 truncate">{track.artist}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); toggleLike(track.id); }}
                  className={cn("shrink-0 transition", isLiked ? "text-neon-pink" : "text-white/40 hover:text-white")}>
                  <Heart size={16} className={isLiked ? "fill-current" : ""} />
                </button>
                <span className="text-xs text-white/35 shrink-0 tabular-nums">{fmt(track.duration)}</span>
              </motion.div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* Player bar */}
      <AnimatePresence>
        {currentTrack && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }} className="fixed bottom-16 md:bottom-4 left-4 right-4 z-40">
            <div className="max-w-2xl mx-auto ng-solid rounded-2xl p-3 shadow-glow-lg">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg shrink-0" style={{ background: currentTrack.cover }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{currentTrack.title}</div>
                  <div className="text-xs text-white/45 truncate">{currentTrack.artist}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setShuffle((v) => !v)}
                    className={cn("grid place-items-center h-8 w-8 rounded-lg transition", shuffle ? "text-neon-purple bg-neon-purple/10" : "text-white/50 hover:text-white")}>
                    <Shuffle size={15} />
                  </button>
                  <button onClick={() => {
                      const idx = TRACKS.findIndex((t) => t.id === currentTrack.id);
                      setCurrentTrack(TRACKS[(idx - 1 + TRACKS.length) % TRACKS.length]); setProgress(0);
                    }}
                    className="grid place-items-center h-8 w-8 rounded-lg text-white/60 hover:text-white transition">
                    <SkipBack size={16} className="fill-current" />
                  </button>
                  <button onClick={() => setPlaying((v) => !v)} className="grid place-items-center h-10 w-10 rounded-full btn-glow">
                    {playing ? <Pause size={18} className="fill-white" /> : <Play size={18} className="fill-white ml-0.5" />}
                  </button>
                  <button onClick={() => {
                      const idx = TRACKS.findIndex((t) => t.id === currentTrack.id);
                      const nextIdx = shuffle ? Math.floor(Math.random() * TRACKS.length) : (idx + 1) % TRACKS.length;
                      setCurrentTrack(TRACKS[nextIdx]); setProgress(0);
                    }}
                    className="grid place-items-center h-8 w-8 rounded-lg text-white/60 hover:text-white transition">
                    <SkipForward size={16} className="fill-current" />
                  </button>
                  <button onClick={() => setRepeat((v) => !v)}
                    className={cn("grid place-items-center h-8 w-8 rounded-lg transition", repeat ? "text-neon-purple bg-neon-purple/10" : "text-white/50 hover:text-white")}>
                    <Repeat size={15} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-white/35 tabular-nums w-8">{fmt(progress)}</span>
                <div className="flex-1 h-1 rounded-full bg-white/10 cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    setProgress(Math.floor(pct * currentTrack.duration));
                  }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${(progress / currentTrack.duration) * 100}%`, background: "linear-gradient(90deg, var(--accent-main), var(--accent-secondary))" }} />
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

// =============================================================================
//  WaveBanner — большая анимированная плашка "Моя волна" (как в VK)
// =============================================================================

function WaveBanner({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
      className="relative overflow-visible rounded-4xl mb-4"
      style={{ minHeight: 200 }}
    >
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7, #ec4899, #f59e0b, #6366f1)",
          backgroundSize: "300% 300%",
        }}
        animate={{
          backgroundPosition: ["0% 50%", "50% 0%", "100% 50%", "50% 100%", "0% 50%"],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />

      {/* Floating orbs */}
      <motion.div
        className="absolute top-4 left-4 h-20 w-20 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.3), transparent 70%)" }}
        animate={{ y: [0, -15, 0], x: [0, 10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-4 right-8 h-24 w-24 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.2), transparent 70%)" }}
        animate={{ y: [0, 20, 0], x: [0, -15, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/2 left-1/3 h-16 w-16 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.15), transparent 70%)" }}
        animate={{ y: [0, 25, 0], x: [0, 20, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Equalizer bars overlay (when playing) */}
      {playing && (
        <div className="absolute inset-0 flex items-end justify-center gap-1 opacity-30 pb-8">
          {Array.from({ length: 24 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-2 bg-white rounded-t-full"
              animate={{ height: ["10%", `${30 + Math.random() * 70}%`, "10%"] }}
              transition={{ duration: 0.5 + Math.random() * 0.5, repeat: Infinity, delay: i * 0.05 }}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 200 }}>
        <motion.div
          animate={playing ? { rotate: 360 } : {}}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-md grid place-items-center mb-4"
        >
          <Radio size={32} className="text-white" />
        </motion.div>

        <h2 className="font-display font-bold text-2xl text-white drop-shadow-lg">Моя волна</h2>
        <p className="text-white/80 text-sm mt-1 drop-shadow">Бесконечный поток музыки на основе твоих вкусов</p>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggle}
          className="mt-5 h-14 w-14 rounded-full bg-white grid place-items-center shadow-2xl"
        >
          {playing ? (
            <Pause size={26} className="fill-purple-600 text-purple-600" />
          ) : (
            <Play size={26} className="fill-purple-600 text-purple-600 ml-1" />
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
