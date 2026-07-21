"use client";

// =============================================================================
//  NightGram Web — Music placeholder
//  Full music is temporarily closed while proper legal playback/import is built.
// =============================================================================

import { motion } from "framer-motion";
import { Music2, Radio, Search, Heart, ListMusic, Upload, Sparkles, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuroraBackground } from "@/components/shared/AuroraBackground";

const CATEGORIES: { title: string; desc: string; icon: LucideIcon; accent: string }[] = [
  {
    title: "Моя волна",
    desc: "Персональные рекомендации и ночной поток треков.",
    icon: Radio,
    accent: "#a855f7",
  },
  {
    title: "Поиск треков",
    desc: "Поиск по артистам, альбомам и плейлистам.",
    icon: Search,
    accent: "#22d3ee",
  },
  {
    title: "Любимые",
    desc: "Список любимых треков внутри NightGram.",
    icon: Heart,
    accent: "#ec4899",
  },
  {
    title: "Плейлисты",
    desc: "Свои подборки и импорт из файлов.",
    icon: ListMusic,
    accent: "#fbbf24",
  },
  {
    title: "Импорт",
    desc: "Безопасный импорт своих/разрешённых треков.",
    icon: Upload,
    accent: "#10b981",
  },
];

export default function MusicPage() {
  return (
    <div className="relative max-w-5xl mx-auto px-4 pb-16">
      <AuroraBackground intensity={0.3} className="absolute top-0 left-0 right-0 h-[42vh] -z-10" />

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-2 mb-5">
          <Lock size={15} className="text-neon-purple" />
          <span className="text-sm text-white/70">Раздел временно закрыт</span>
        </div>

        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl gradient-border glass-strong shadow-glow-lg">
          <Music2 size={34} className="text-neon-purple" />
        </div>

        <h1 className="font-display font-bold text-4xl md:text-5xl tracking-tight">
          Музыка <span className="text-gradient">скоро</span>
        </h1>
        <p className="mt-4 text-white/55 max-w-xl mx-auto text-sm md:text-base">
          Мы закрыли музыкальный раздел, чтобы не оставлять 30-секундные preview как основную функцию.
          Вернём музыку, когда будет нормальный легальный плеер, импорт и любимые треки.
        </p>
      </motion.div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES.map((category, i) => {
          const Icon = category.icon;
          return (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, type: "spring", stiffness: 90, damping: 16 }}
              whileHover={{ y: -4, scale: 1.015 }}
              className="relative glass-strong rounded-4xl p-5 overflow-visible"
            >
              <span
                className="absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: `${category.accent}1f`, color: category.accent, border: `1px solid ${category.accent}55` }}
              >
                Скоро
              </span>

              <div
                className="h-12 w-12 rounded-2xl grid place-items-center mb-4"
                style={{ background: `${category.accent}18`, boxShadow: `0 0 18px ${category.accent}22` }}
              >
                <Icon size={22} style={{ color: category.accent }} />
              </div>

              <h3 className="font-display font-bold text-lg">{category.title}</h3>
              <p className="text-sm text-white/50 mt-2 leading-relaxed">{category.desc}</p>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="mt-6 glass rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center gap-4"
      >
        <div className="h-11 w-11 rounded-2xl grid place-items-center shrink-0" style={{ background: "rgb(var(--accent-main-rgb) / 0.15)" }}>
          <Sparkles size={20} className="text-neon-purple" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">Что будет дальше?</div>
          <div className="text-xs text-white/45 mt-1">
            Сначала сделаем импорт своих/разрешённых треков и нормальные любимые. Потом можно подключать официальные источники.
          </div>
        </div>
      </motion.div>
    </div>
  );
}
