"use client";

// =============================================================================
//  Landing — alternating feature preview sections (Feed / Messenger / Store)
// =============================================================================

import { motion } from "framer-motion";
import {
  Infinity as InfinityIcon,
  MessageSquare,
  ShoppingBag,
  Eye,
  Heart,
  Bookmark,
  Send,
  Search,
  Paperclip,
  Smile,
  Crown,
} from "lucide-react";
import { ScrollReveal } from "@/components/shared/ScrollReveal";
import { CoinsBadge } from "@/components/shared/Badges";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: InfinityIcon,
    title: "Бесконечная лента",
    desc: "Вертикальный скролл с ленивой загрузкой, скелетонами и плавными анимациями. Посты, каналы, фото, видео и текст — всё в одной уникальной ленте NightGram.",
    tag: "Лента",
    color: "var(--accent-main)",
  },
  {
    icon: MessageSquare,
    title: "Мессенджер реал-тайм",
    desc: "Сообщения в реальном времени: ответы, реакции, файлы, стикеры и папки. Синхронизация между вебом и мобильным приложением.",
    tag: "Мессенджер",
    color: "#22d3ee",
  },
  {
    icon: ShoppingBag,
    title: "Магазин",
    desc: "Премиум-маркетплейс: темы, цветовые пакеты, рамки, glow-эффекты и бейджи. Покупай за NightCoins или напрямую.",
    tag: "Маркетплейс",
    color: "var(--accent-tertiary)",
  },
];

export function FeaturePreviews() {
  return (
    <section className="relative px-6 py-24 max-w-6xl mx-auto">
      <ScrollReveal className="text-center mb-16">
        <h2 className="font-display font-bold text-4xl md:text-5xl tracking-tight">
          Одна платформа. <span className="text-gradient">Три мира.</span>
        </h2>
        <p className="mt-4 text-white/60 max-w-xl mx-auto">
          Каждая часть NightGram построена из тёмного неонового стекла —
          связано в реальном времени и неповторимо.
        </p>
      </ScrollReveal>

      <div className="space-y-24">
        {/* FEED PREVIEW */}
        <ScrollReveal>
          <FeatureLayout reverse={false} icon={features[0]}>
            <FeedPreviewCard />
          </FeatureLayout>
        </ScrollReveal>

        {/* MESSENGER PREVIEW */}
        <ScrollReveal>
          <FeatureLayout reverse icon={features[1]}>
            <MessengerPreviewCard />
          </FeatureLayout>
        </ScrollReveal>

        {/* STORE PREVIEW */}
        <ScrollReveal>
          <FeatureLayout reverse={false} icon={features[2]}>
            <StorePreviewCard />
          </FeatureLayout>
        </ScrollReveal>
      </div>
    </section>
  );
}

function FeatureLayout({
  icon,
  children,
  reverse,
}: {
  icon: (typeof features)[number];
  children: React.ReactNode;
  reverse?: boolean;
}) {
  const Icon = icon.icon;
  return (
    <div
      className={`grid lg:grid-cols-2 gap-12 items-center ${
        reverse ? "lg:[direction:rtl]" : ""
      }`}
    >
      <div className="lg:[direction:ltr]">
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="inline-flex items-center gap-2 rounded-full glass px-4 py-2 mb-5"
        >
          <Icon size={16} style={{ color: icon.color }} />
          <span className="text-sm font-medium text-white/80">{icon.tag}</span>
        </motion.div>
        <h3 className="font-display font-bold text-3xl md:text-4xl mb-4">
          {icon.title}
        </h3>
        <p className="text-white/65 text-lg leading-relaxed">{icon.desc}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {["Лента постов", "Реал-тайм", "Glow-реакции"].map((txt, i) => (
            <span
              key={txt}
              className="rounded-lg px-3 py-1 text-xs glass text-white/70"
            >
              {["Лента постов", "Реал-тайм", "Glow-реакции"][(i + (reverse ? 1 : 0)) % 3]}
            </span>
          ))}
        </div>
      </div>
      <div className="lg:[direction:ltr]">{children}</div>
    </div>
  );
}

function FeedPreviewCard() {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      className="gradient-border rounded-4xl glass-strong p-5 max-w-sm mx-auto shadow-glow-lg"
    >
      <div className="flex items-center gap-3 mb-4">
        {/* Empty avatar (no specific user) */}
        <GlowAvatar src={null} alt="Профиль" size={44} glow="purple" frame="aurora" />
        <div>
          <div className="font-semibold" style={{ color: "var(--accent-main)" }}>@nightgram</div>
          <div className="text-xs text-white/40">2 мин назад</div>
        </div>
        <div className="ml-auto inline-flex items-center gap-1 text-xs text-white/50">
          <Eye size={12} /> 12.4K
        </div>
      </div>
      <motion.div
        className="rounded-2xl h-56 mb-4 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,var(--accent-main),var(--accent-tertiary),var(--accent-secondary))" }}
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 8, repeat: Infinity }}
      />
      <div className="flex items-center gap-5 text-white/80">
        <Heart className="fill-neon-pink text-neon-pink" size={20} />
        <MessageSquare size={20} />
        <Send size={20} />
        <Bookmark className="ml-auto text-neon-purple" size={20} />
      </div>
    </motion.div>
  );
}

function MessengerPreviewCard() {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      className="gradient-border rounded-4xl glass-strong p-4 max-w-sm mx-auto shadow-glow-lg"
    >
      <div className="flex items-center gap-3 pb-3 border-b border-white/5">
        <GlowAvatar src={null} alt="Профиль" size={40} glow="cyan" online />
        <div className="flex-1">
          <div className="font-semibold" style={{ color: "#22d3ee" }}>@user</div>
          <div className="text-xs text-green-400">в сети</div>
        </div>
      </div>
      <div className="space-y-2.5 py-4">
        <Bubble side="left">Привет! Видел новые обновления? 🔥</Bubble>
        <Bubble side="right">Да! Aurora тема просто космос</Bubble>
        <Bubble side="left" react="🔥">Беру за NightCoins прямо сейчас</Bubble>
      </div>
      <div className="flex items-center gap-2 rounded-full glass px-3 py-2">
        <Paperclip size={16} className="text-white/50" />
        <span className="flex-1 text-sm text-white/40">Сообщение…</span>
        <Smile size={16} className="text-white/50" />
        <div className="h-7 w-7 grid place-items-center rounded-full btn-glow">
          <Send size={13} />
        </div>
      </div>
    </motion.div>
  );
}

function Bubble({
  side,
  children,
  react,
}: {
  side: "left" | "right";
  children: React.ReactNode;
  react?: string;
}) {
  const right = side === "right";
  return (
    <div className={`flex ${right ? "justify-end" : "justify-start"}`}>
      <div className="relative max-w-[75%]">
        <div
          className={`px-3.5 py-2 rounded-2xl text-sm ${
            right
              ? "bg-gradient-to-br from-neon-purple to-neon-indigo text-white rounded-br-md"
              : "glass text-white/90 rounded-bl-md"
          }`}
        >
          {children}
        </div>
        {react && (
          <span className="absolute -bottom-2 right-2 text-xs rounded-full bg-midnight-800 px-1.5">
            {react}
          </span>
        )}
      </div>
    </div>
  );
}

function StorePreviewCard() {
  const items = [
    { name: "Тема Aurora", coins: 800, grad: "linear-gradient(135deg,var(--accent-main),var(--accent-tertiary))", glow: "var(--accent-main)" },
    { name: "Розовый Glow", coins: 350, grad: "linear-gradient(135deg,var(--accent-tertiary),#f59e0b)", glow: "var(--accent-tertiary)" },
    { name: "Стикеры Кибер", coins: 450, grad: "linear-gradient(135deg,#22d3ee,var(--accent-secondary))", glow: "#22d3ee" },
  ];
  return (
    <div className="grid gap-3 max-w-sm mx-auto">
      {items.map((it, i) => (
        <motion.div
          key={it.name}
          whileHover={{ scale: 1.03, x: 4 }}
          className="gradient-border rounded-3xl glass-strong p-3 flex items-center gap-3"
        >
          <div
            className="h-14 w-14 rounded-2xl shrink-0"
            style={{ background: it.grad, boxShadow: `0 0 16px ${it.glow}66` }}
          />
          <div className="flex-1">
            <div className="font-semibold text-sm">{it.name}</div>
            <CoinsBadge amount={it.coins} className="mt-1 px-2 py-0.5 text-xs" />
          </div>
          <div className="h-8 w-8 grid place-items-center rounded-full glass text-white/60">
            <Crown size={14} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// Expose icon used by nav badge
export function FeatureStatRow() {
  return (
    <div className="flex gap-4">
      {["Реал-тайм", "Premium", "NightCoins"].map((s) => (
        <div key={s} className="flex items-center gap-2 glass rounded-xl px-3 py-2">
          <span className="text-xs text-white/60">{s}</span>
        </div>
      ))}
    </div>
  );
}
