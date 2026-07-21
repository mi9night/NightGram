"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Trash2, Pencil, ChevronLeft, Plus, X, Image as ImageIcon, Send, Shield, Search, Crown, UserCog, Sparkles, Users, Link2, BarChart3, Clock3, FileEdit, Ban, Flag, History, MessageCircle, Timer } from "lucide-react";
import { api } from "@/lib/api";
import type { Post } from "@/types";
import { PostCard } from "@/components/feed/PostCard";
import { uploadMedia } from "@/lib/upload";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { useAuth } from "@/context/AuthContext";
import { cn, formatCount } from "@/lib/utils";
import { pushGlobalToast } from "@/lib/toast";
import { CustomSelect } from "@/components/shared/CustomSelect";

const CHANNEL_BOOST_COLORS = [
  "#a855f7", "#ec4899", "#fbbf24", "#22d3ee", "#34d399", "#818cf8", "#fb7185", "#f97316",
  "#14b8a6", "#e879f9", "#c084fc", "#60a5fa", "#facc15", "#f472b6", "#ffffff",
  "#a78bfa", "#ff4ecd", "#8b5cf6", "#fde047", "#2dd4bf", "#ff7f50", "#cbd5e1", "#84cc16", "#bae6fd", "#d97706", "#00f5d4", "#ef4444", "#6ee7b7", "#c4b5fd", "#38bdf8", "#2563eb", "#9ca3af",
];

const CHANNEL_BOOST_FRAMES = [
  // Level 1 — one-color frames.
  "solid:#a855f7", "solid:#ec4899", "solid:#fbbf24", "solid:#22d3ee", "solid:#34d399", "solid:#fb7185", "solid:#60a5fa", "solid:#f97316",
  // Level 2 — two-color frames.
  "dual:#a855f7:#ec4899", "dual:#22d3ee:#a855f7", "dual:#fbbf24:#f97316", "dual:#34d399:#14b8a6", "dual:#60a5fa:#818cf8", "dual:#f472b6:#c084fc", "dual:#ffffff:#a855f7", "dual:#fb7185:#fbbf24",
  // Level 3 — animated/special frames.
  "rainbow", "gradient", "premium", "aurora", "prism", "cosmic", "fire", "ice",
];

const CHANNEL_UNLOCK_PER_LEVEL = 8;
const CHANNEL_SUGGESTED_TAGS = ["Новости", "Игры", "Музыка", "Мемы", "Арт", "NightGram", "Технологии", "Общение"];

const CHANNEL_COLOR_NAMES: Record<string, { label: string; emoji: string }> = {
  "#a855f7": { label: "Night", emoji: "🌃" },
  "#ec4899": { label: "Sakura", emoji: "🌸" },
  "#0ea5e9": { label: "Ocean", emoji: "🌊" },
  "#10b981": { label: "Forest", emoji: "🌲" },
  "#9ca3af": { label: "Graphite", emoji: "🖼️" },
  "#2563eb": { label: "Navy", emoji: "⚓" },
  "#ffffff": { label: "Moon", emoji: "🌙" },
  "#a78bfa": { label: "Violet", emoji: "💜" },
  "#ff4ecd": { label: "Neon", emoji: "💗" },
  "#fbbf24": { label: "Gold", emoji: "✨" },
  "#22d3ee": { label: "Cyan", emoji: "💎" },
  "#34d399": { label: "Emerald", emoji: "🍃" },
  "#14b8a6": { label: "Teal", emoji: "🫧" },
  "#fb7185": { label: "Rose", emoji: "🌹" },
  "#60a5fa": { label: "Sky", emoji: "🔵" },
  "#f97316": { label: "Sunset", emoji: "🌇" },
  "#8b5cf6": { label: "Ultra", emoji: "🔮" },
  "#f472b6": { label: "Pink", emoji: "🎀" },
  "#fde047": { label: "Lemon", emoji: "🍋" },
  "#2dd4bf": { label: "Teal", emoji: "🫧" },
  "#818cf8": { label: "Indigo", emoji: "🌀" },
  "#c084fc": { label: "Royal", emoji: "🔮" },
  "#facc15": { label: "Sun", emoji: "☀️" },
  "#ff7f50": { label: "Coral", emoji: "🪸" },
  "#cbd5e1": { label: "Silver", emoji: "🪙" },
  "#84cc16": { label: "Toxic", emoji: "☣️" },
  "#e879f9": { label: "Lavender", emoji: "🌸" },
  "#bae6fd": { label: "Ice", emoji: "❄️" },
  "#d97706": { label: "Copper", emoji: "🟠" },
  "#00f5d4": { label: "Cyber", emoji: "👾" },
  "#ef4444": { label: "Crimson", emoji: "🩸" },
  "#6ee7b7": { label: "Mint", emoji: "🌿" },
  "#c4b5fd": { label: "Peri", emoji: "🪻" },
  "#f8fafc": { label: "Moon", emoji: "🌙" },
};

function channelFrameMeta(id: string | null): { label: string; emoji: string; preview: string } {
  if (!id) return { label: "Убрать", emoji: "○", preview: "linear-gradient(90deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))" };
  if (id === "gradient") return { label: "Aurora", emoji: "🌌", preview: "linear-gradient(90deg,#a855f7,#ec4899,#22d3ee)" };
  if (id === "rainbow") return { label: "Rainbow", emoji: "🌈", preview: "linear-gradient(90deg,#ef4444,#f97316,#facc15,#22c55e,#06b6d4,#6366f1,#ec4899)" };
  if (id === "premium") return { label: "Gold Nova", emoji: "👑", preview: "linear-gradient(90deg,#fbbf24,#f59e0b,#fff7ad)" };
  if (id === "aurora") return { label: "Aurora Motion", emoji: "🌌", preview: "linear-gradient(90deg,#2dd4bf,#8b5cf6,#38bdf8,#34d399)" };
  if (id === "prism") return { label: "Prism", emoji: "💠", preview: "linear-gradient(90deg,#f472b6,#a78bfa,#22d3ee,#fde047)" };
  if (id === "cosmic") return { label: "Cosmic", emoji: "🪐", preview: "linear-gradient(90deg,#020617,#4c1d95,#ec4899,#38bdf8)" };
  if (id === "fire") return { label: "Fire", emoji: "🔥", preview: "linear-gradient(90deg,#ef4444,#f97316,#fbbf24,#fb7185)" };
  if (id === "ice") return { label: "Ice", emoji: "❄️", preview: "linear-gradient(90deg,#bae6fd,#60a5fa,#22d3ee,#f8fafc)" };
  if (id.startsWith("solid:")) {
    const color = id.slice("solid:".length);
    const meta = CHANNEL_COLOR_NAMES[color.toLowerCase()] ?? { label: "Mono", emoji: "●" };
    return { label: `${meta.label} Mono`, emoji: meta.emoji, preview: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 62%, white), ${color})` };
  }
  const parts = id.startsWith("dual:") ? id.split(":") : [];
  const a = parts[1] || "#a855f7";
  const b = parts[2] || "#ec4899";
  const key = `${a}:${b}`.toLowerCase();
  const names: Record<string, [string, string]> = {
    "#a855f7:#ec4899": ["Violet Rose", "💜"],
    "#22d3ee:#a855f7": ["Cyan Violet", "💎"],
    "#fbbf24:#f97316": ["Gold Flame", "🔥"],
    "#ffffff:#a855f7": ["Moon Violet", "🌙"],
    "#22d3ee:#34d399": ["Cyan Mint", "🫧"],
    "#e879f9:#818cf8": ["Lavender Sky", "🪻"],
    "#facc15:#ffffff": ["Sun Moon", "☀️"],
    "#22d3ee:#8b5cf6": ["Cyber Ice", "💎"],
    "#34d399:#14b8a6": ["Emerald", "🍃"],
    "#fb7185:#fbbf24": ["Sunset", "🌇"],
    "#111827:#a855f7": ["Void", "🖤"],
    "#f97316:#fbbf24": ["Amber", "🔶"],
    "#60a5fa:#818cf8": ["Skyline", "🔵"],
    "#f472b6:#c084fc": ["Sakura", "🌸"],
    "#f8fafc:#22d3ee": ["Ice Moon", "❄️"],
    "#ef4444:#fb7185": ["Blood", "🩸"],
    "#2dd4bf:#00f5d4": ["Cyber Mint", "👾"],
    "#cbd5e1:#94a3b8": ["Silver", "🪙"],
    "#84cc16:#34d399": ["Toxic", "☣️"],
  };
  const [label, emoji] = names[key] || ["Dual", "✦"];
  return { label, emoji, preview: `linear-gradient(90deg, ${a}, ${b})` };
}

interface ChannelRow {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  description: string;
  tags?: string[];
  subscribersCount: number;
  verified: boolean;
  ownerId?: string;
  hideSubscribers?: boolean;
  isPrivate?: boolean;
  chatEnabled?: boolean;
  commentsEnabled?: boolean;
  commentSlowModeSeconds?: number;
  chatConversationId?: string | null;
  boostColor?: string | null;
  boostGlow?: string | null;
  boostAvatarFrame?: string | null;
  boostedUntil?: string | null;
  activeBoosts?: number;
  boostLevel?: number;
  boostMeta?: {
    level: number;
    activeBoosts: number;
    needPerLevel: number;
    nextLevelBoosts: number;
    maxBoosts: number;
    storyLimit: number;
    unlockedColors: number;
    unlockedFrames: number;
    priority: boolean;
  };
  availableBoostColors?: string[];
  availableBoostFrames?: string[];
  myRole?: string | null;
  subscribed?: boolean;
}

export default function ChannelProfilePage() {
  const params = useParams<{ handle: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [channel, setChannel] = useState<ChannelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [channelAnalytics, setChannelAnalytics] = useState<Record<string, unknown> | null>(null);
  const [channelDrafts, setChannelDrafts] = useState<Post[]>([]);
  const [studioLoading, setStudioLoading] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [boostModalOpen, setBoostModalOpen] = useState(false);
  const [subscribersModalOpen, setSubscribersModalOpen] = useState(false);
  const [moderationModalOpen, setModerationModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api.getChannel(params.handle)
      .then((data) => {
        if (!active) return;
        const c = data as ChannelRow;
        setChannel(c);
        api.getChannelPosts(c.id).then((p) => active && setPosts(p)).catch(() => active && setPosts([]));
      })
      .catch(() => active && setChannel(null))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [params.handle]);

  useEffect(() => {
    if (!channel || !user) return;
    const siteAdminNow = ["admin", "owner", "co_owner", "moderator"].includes(user.role ?? "");
    const canPostNow = channel.ownerId === user.id || siteAdminNow || ["owner", "co_owner", "admin", "editor"].includes(channel.myRole ?? "");
    if (!canPostNow) return;
    let active = true;
    setStudioLoading(true);
    Promise.all([
      api.getChannelAnalytics(channel.id).catch(() => null),
      api.getChannelDrafts(channel.id).catch(() => []),
    ]).then(([analytics, drafts]) => {
      if (!active) return;
      setChannelAnalytics((analytics as Record<string, unknown> | null) ?? null);
      setChannelDrafts(drafts as Post[]);
    }).finally(() => active && setStudioLoading(false));
    return () => { active = false; };
  }, [channel, user]);

  if (loading) return <div className="min-h-[55vh] grid place-items-center"><Loader2 size={26} className="animate-spin text-neon-purple" /></div>;
  if (!channel) return <div className="max-w-xl mx-auto px-4 text-center py-20 text-white/45">Канал не найден</div>;

  const siteAdmin = ["admin", "owner", "co_owner", "moderator"].includes(user?.role ?? "");
  const canManage = channel.ownerId === user?.id || siteAdmin || ["owner", "co_owner", "admin"].includes(channel.myRole ?? "");
  const canPost = canManage || channel.myRole === "editor";
  const canManageRoles = channel.ownerId === user?.id || siteAdmin || channel.myRole === "co_owner";
  const canModerate = channel.ownerId === user?.id || siteAdmin || ["owner", "co_owner", "admin", "moderator"].includes(channel.myRole ?? "");

  async function toggleSub() {
    if (!channel) return;
    setProcessing(true);
    try {
      const res = await api.toggleChannelSubscription(channel.id);
      setChannel({ ...channel, subscribed: res.subscribed, subscribersCount: Math.max(0, channel.subscribersCount + (res.subscribed ? 1 : -1)) });
      pushGlobalToast(res.subscribed ? "Вы подписались на канал" : "Вы отписались от канала", "success");
    } catch { pushGlobalToast("Не удалось изменить подписку", "error"); }
    setProcessing(false);
  }

  async function openChannelChat() {
    if (!channel) return;
    setProcessing(true);
    try {
      const res = await api.joinChannelChat(channel.id);
      localStorage.setItem("ng_open_chat", res.conversationId);
      if (res.conversation) localStorage.setItem("ng_open_chat_payload", JSON.stringify(res.conversation));
      router.push("/messages");
    } catch {
      pushGlobalToast(channel.isPrivate ? "Для приватного канала нужна подписка или инвайт" : "Не удалось открыть чат канала", "error");
    }
    setProcessing(false);
  }

  async function copyChannelInvite() {
    if (!channel) return;
    setProcessing(true);
    try {
      const res = await api.createChannelInvite(channel.id);
      const url = `${window.location.origin}/invite/${res.code}`;
      await navigator.clipboard.writeText(url);
      pushGlobalToast("Инвайт канала скопирован", "success");
    } catch {
      pushGlobalToast("Не удалось создать инвайт", "error");
    }
    setProcessing(false);
  }

  async function publishDraft(postId: string) {
    if (!channel) return;
    setProcessing(true);
    try {
      const post = await api.publishChannelDraft(channel.id, postId);
      setChannelDrafts((prev) => prev.filter((draft) => draft.id !== postId));
      setPosts((prev) => [post, ...prev]);
      pushGlobalToast("Черновик опубликован", "success");
    } catch {
      pushGlobalToast("Не удалось опубликовать черновик", "error");
    }
    setProcessing(false);
  }

  async function deleteDraft(postId: string) {
    if (!channel) return;
    setProcessing(true);
    try {
      await api.deleteChannelDraft(channel.id, postId);
      setChannelDrafts((prev) => prev.filter((draft) => draft.id !== postId));
      pushGlobalToast("Черновик удалён", "success");
    } catch {
      pushGlobalToast("Не удалось удалить черновик", "error");
    }
    setProcessing(false);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">
      <button onClick={() => router.back()} className="mb-4 grid h-10 w-10 place-items-center rounded-xl glass text-white/60 hover:text-white">
        <ChevronLeft size={18} />
      </button>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="relative">
        <div className="h-44 md:h-60 rounded-4xl overflow-hidden relative">
          {channel.bannerUrl ? <img src={channel.bannerUrl} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full" style={{ background: "linear-gradient(120deg,var(--accent-main),var(--accent-tertiary),var(--accent-secondary))" }} />}
        </div>
        <div className="glass-strong rounded-4xl mx-2 md:mx-6 -mt-10 relative z-10 p-5 md:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              <div className="shrink-0">
                <GlowAvatar
                  src={channel.avatarUrl}
                  alt={channel.name}
                  size={96}
                  frame={channel.boostAvatarFrame ?? undefined}
                  glow={channel.boostGlow ?? undefined}
                  ringColor={channel.boostColor || "#ffffff"}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display font-bold text-3xl truncate" style={{ color: channel.boostColor || undefined, textShadow: channel.boostGlow ? `0 0 16px ${channel.boostColor || "#a855f7"}` : undefined }}>{channel.name}</h1>
                  {channel.verified && <Check size={18} className="text-neon-purple" />}
                </div>
                <button onClick={() => setSubscribersModalOpen(true)} className="text-sm text-white/45 hover:text-white transition">@{channel.handle} · {formatCount(channel.subscribersCount)} подписчиков</button>
                <p className="text-white/65 text-sm mt-3 max-w-2xl whitespace-pre-wrap">{channel.description}</p>
                {channel.tags && channel.tags.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{channel.tags.map((tag) => <span key={tag} className="rounded-full bg-neon-purple/10 px-2.5 py-1 text-xs text-neon-purple">#{tag}</span>)}</div>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap border-t border-white/5 pt-4 md:pl-[112px]">
              <button onClick={toggleSub} disabled={processing} className={channel.subscribed ? "btn-ghost px-5 py-2.5 text-sm" : "btn-glow px-5 py-2.5 text-sm"}>
                {processing ? "…" : channel.subscribed ? "Вы подписаны" : "Подписаться"}
              </button>
              {channel.chatEnabled !== false && <button onClick={openChannelChat} disabled={processing} className="btn-ghost px-4 py-2.5 text-sm">Чат канала</button>}
              {user && <button onClick={() => user.isPremium ? setBoostModalOpen(true) : router.push("/store/premium?tab=premium")} className="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2"><Sparkles size={15} /> Буст</button>}
              {canManage && <button onClick={copyChannelInvite} disabled={processing} className="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2"><Link2 size={15} /> Инвайт</button>}
              {canManage && <button onClick={() => setSettingsModalOpen(true)} className="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2"><Pencil size={15} /> Настройки</button>}
              {canModerate && <button onClick={() => setModerationModalOpen(true)} className="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2"><Shield size={15} /> Модерация</button>}
              {!canManage && <button onClick={async () => {
                const reason = window.prompt("Опишите причину жалобы на канал");
                if (!reason?.trim()) return;
                try { await api.createReport({ targetType: "channel", targetId: channel.id, category: "channel_report", reason: reason.trim() }); pushGlobalToast("Жалоба отправлена", "success"); }
                catch { pushGlobalToast("Не удалось отправить жалобу", "error"); }
              }} className="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2 text-red-200"><Flag size={15} /> Пожаловаться</button>}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="mt-6 glass rounded-3xl px-4 py-3">
        {(() => {
          const activeBoosts = channel.boostMeta?.activeBoosts ?? channel.activeBoosts ?? (channel.boostedUntil ? 1 : 0);
          const needPerLevel = channel.boostMeta?.needPerLevel ?? Math.max(1, Math.ceil(Math.max(1, channel.subscribersCount || 1) / 25));
          const level = channel.boostMeta?.level ?? Math.min(3, Math.floor(activeBoosts / needPerLevel));
          const currentLevelBoosts = level * needPerLevel;
          const nextLevelBoosts = channel.boostMeta?.nextLevelBoosts ?? Math.min(3 * needPerLevel, (level + 1) * needPerLevel);
          const progressToNext = level >= 3 ? 100 : ((activeBoosts - currentLevelBoosts) / Math.max(1, nextLevelBoosts - currentLevelBoosts)) * 100;
          const perks = [
            "Базовый канал",
            "8 цветов названия, 1 история в день, одноцветные рамки",
            "+8 цветов названия, 2 истории в день, двухцветные рамки",
            "+8 цветов названия, 3 истории в день, радужные/анимированные рамки и приоритет",
          ];
          return (
            <div className="flex flex-col gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={17} className="text-neon-gold" />
                  <span className="font-semibold text-sm">Буст канала · уровень {level}</span>
                  <span className="ml-auto text-[11px] text-white/35">{activeBoosts}/{level >= 3 ? 3 * needPerLevel : nextLevelBoosts} бустов</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-neon-purple to-neon-gold" style={{ width: `${Math.min(100, progressToNext)}%` }} />
                </div>
                <div className="mt-2 text-xs text-white/45">
                  Сейчас: {perks[level]} · следующий уровень: {level >= 3 ? "максимум достигнут" : perks[level + 1]}
                </div>
                <div className="mt-1 text-[11px] text-white/35">Чем больше подписчиков, тем больше бустов нужно: сейчас {needPerLevel} буст(ов) на уровень.</div>
              </div>
              {user && (
                <button onClick={() => user.isPremium ? setBoostModalOpen(true) : router.push("/store/premium?tab=premium")} className="btn-glow mt-2 w-full py-2.5 text-sm sm:w-auto sm:px-5">
                  Буст канала
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {canPost && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="rounded-4xl glass-strong p-4">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 size={17} className="text-neon-purple" />
              <div className="font-semibold text-sm">Студия канала</div>
              {studioLoading && <Loader2 size={13} className="animate-spin text-white/35" />}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Подписчики", value: channelAnalytics?.subscribers ?? channel.subscribersCount, Icon: Users },
                { label: "Посты", value: channelAnalytics?.posts ?? posts.length, Icon: FileEdit },
                { label: "Просмотры", value: channelAnalytics?.views ?? 0, Icon: BarChart3 },
                { label: "Engage", value: channelAnalytics?.engagement ?? 0, Icon: Sparkles },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="rounded-2xl glass px-3 py-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] text-white/35"><Icon size={11} /> {label}</div>
                  <div className="font-display text-lg font-bold text-white/85">{formatCount(Number(value ?? 0))}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-3xl glass p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-white/45">
                <span>Просмотры за 14 дней</span>
                <span>ER {String(channelAnalytics?.engagementRate ?? 0)}%</span>
              </div>
              <div className="flex h-28 items-end gap-1.5">
                {((channelAnalytics?.daily as Record<string, unknown>[] | undefined) ?? []).map((day) => {
                  const views = Number(day.views ?? 0);
                  const max = Math.max(1, ...(((channelAnalytics?.daily as Record<string, unknown>[] | undefined) ?? []).map((d) => Number(d.views ?? 0))));
                  return (
                    <div key={String(day.date)} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <motion.div
                        initial={{ height: 6 }}
                        animate={{ height: `${Math.max(8, (views / max) * 100)}%` }}
                        className="w-full rounded-t-xl bg-gradient-to-t from-neon-purple to-neon-gold"
                        style={{ opacity: views ? 0.95 : 0.2 }}
                      />
                      <span className="text-[9px] text-white/25">{String(day.label ?? "").slice(0, 2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {Array.isArray(channelAnalytics?.topPosts) && (channelAnalytics.topPosts as Record<string, unknown>[]).length > 0 && (
              <div className="mt-3 rounded-3xl glass p-3">
                <div className="mb-2 text-xs text-white/45">Лучшие посты</div>
                <div className="space-y-1.5">
                  {(channelAnalytics.topPosts as Record<string, unknown>[]).map((post, index) => (
                    <div key={String(post.id)} className="rounded-2xl bg-white/[0.03] px-3 py-2">
                      <div className="flex gap-2 text-xs">
                        <span className="text-neon-gold">#{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-white/70">{String(post.text ?? "Пост")}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-white/35">{formatCount(Number(post.views ?? 0))} просмотров · {formatCount(Number(post.engagement ?? 0))} engage</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-4xl glass-strong p-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 size={17} className="text-neon-gold" />
              <div className="font-semibold text-sm flex-1">Черновики и отложенные</div>
              <span className="text-[11px] text-white/35">{channelDrafts.length}</span>
            </div>
            {channelDrafts.length === 0 ? (
              <div className="rounded-3xl glass p-6 text-center text-xs text-white/40">Черновиков и отложенных постов пока нет</div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {channelDrafts.map((draft) => {
                  const status = String((draft as Post & { status?: string }).status ?? "draft");
                  const scheduledAt = String((draft as Post & { scheduledAt?: string }).scheduledAt ?? "");
                  return (
                    <div key={draft.id} className="rounded-2xl glass px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={status === "scheduled" ? "rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200" : "rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50"}>{status === "scheduled" ? "scheduled" : "draft"}</span>
                        <div className="min-w-0 flex-1 truncate text-sm text-white/75">{draft.text || "Медиа-пост"}</div>
                      </div>
                      {scheduledAt && <div className="mt-1 text-[11px] text-white/35">Запланировано: {new Date(scheduledAt).toLocaleString("ru-RU")}</div>}
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => publishDraft(draft.id)} disabled={processing} className="btn-ghost px-3 py-1.5 text-xs">Опубликовать</button>
                        <button onClick={() => deleteDraft(draft.id)} disabled={processing} className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300">Удалить</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 space-y-5">
        <div className="flex items-center gap-3">
          <h2 className="font-display font-bold text-xl flex-1">Посты канала</h2>
          {canPost && <button onClick={() => setPostModalOpen(true)} className="btn-glow px-4 py-2.5 text-sm flex items-center gap-2"><Plus size={15} /> Пост от канала</button>}
        </div>
        {posts.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center text-white/45">
            У канала пока нет постов.
          </div>
        ) : posts.map((post, i) => (
          <PostCard key={post.id} post={post} index={i} onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))} />
        ))}
      </div>

      <ChannelPostModal
        open={postModalOpen}
        channel={channel}
        onClose={() => setPostModalOpen(false)}
        onPosted={(post) => setPosts((prev) => [post, ...prev])}
        onDraft={(post) => setChannelDrafts((prev) => [post, ...prev])}
      />
      <ChannelSettingsModal
        open={settingsModalOpen}
        channel={channel}
        canManageRoles={canManageRoles}
        onClose={() => setSettingsModalOpen(false)}
        onUpdated={(patch) => setChannel((prev) => prev ? { ...prev, ...patch } : prev)}
        onRoles={() => { setSettingsModalOpen(false); setRolesModalOpen(true); }}
        onDelete={() => { setSettingsModalOpen(false); setDeleteModalOpen(true); }}
      />
      <DeleteChannelModal
        open={deleteModalOpen}
        channel={channel}
        onClose={() => setDeleteModalOpen(false)}
        onDeleted={() => router.replace("/channels")}
      />
      <ChannelRolesModal
        open={rolesModalOpen}
        channel={channel}
        onClose={() => setRolesModalOpen(false)}
        onOwnerTransferred={(ownerId) => setChannel((prev) => prev ? { ...prev, ownerId, myRole: prev.ownerId === user?.id ? "co_owner" : prev.myRole } : prev)}
      />
      <ChannelSubscribersModal
        open={subscribersModalOpen}
        channel={channel}
        canModerate={canModerate}
        onClose={() => setSubscribersModalOpen(false)}
      />
      <ChannelModerationModal
        open={moderationModalOpen}
        channel={channel}
        onClose={() => setModerationModalOpen(false)}
      />
      <BoostChannelModal
        open={boostModalOpen}
        channel={channel}
        onClose={() => setBoostModalOpen(false)}
        onBoosted={(patch) => setChannel((prev) => prev ? { ...prev, ...patch } : prev)}
      />
    </div>
  );
}

function ChannelPostModal({
  open,
  channel,
  onClose,
  onPosted,
  onDraft,
}: {
  open: boolean;
  channel: ChannelRow;
  onClose: () => void;
  onPosted: (post: Post) => void;
  onDraft?: (post: Post) => void;
}) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState<{ url: string; type: "image" | "video"; size: number }[]>([]);
  const [mode, setMode] = useState<"published" | "draft" | "scheduled">("published");
  const [scheduledAt, setScheduledAt] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const totalSize = media.reduce((sum, item) => sum + item.size, 0);
  const charsLeft = 280 - text.length;

  async function pick(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, 10 - media.length);
    if (list.length === 0) return;
    setError(null);
    const batchSize = list.reduce((sum, file) => sum + file.size, 0);
    if (media.length + list.length > 10) return setError("Максимум 10 файлов");
    if (totalSize + batchSize > 50 * 1024 * 1024) return setError("Лимит медиа — 50 МБ на пост");
    try {
      const uploaded = [] as { url: string; type: "image" | "video"; size: number }[];
      for (const file of list) {
        const url = await uploadMedia(file, "posts");
        uploaded.push({ url, size: file.size, type: file.type.startsWith("video/") ? "video" : "image" });
      }
      setMedia((prev) => [...prev, ...uploaded]);
    } catch {
      setError("Не удалось загрузить медиа");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function publish() {
    if (!text.trim() && media.length === 0) return;
    if (mode === "scheduled" && !scheduledAt) return setError("Выбери дату и время публикации");
    setPosting(true);
    setError(null);
    try {
      const post = await api.createPost({
        text: text.trim() || undefined,
        media: media.map(({ type, url }) => ({ type, url })),
        tags: [],
        authorChannelId: channel.id,
        status: mode,
        scheduledAt: mode === "scheduled" ? new Date(scheduledAt).toISOString() : null,
      });
      const normalized = { ...post, author: { kind: "channel" as const, channel: {
        id: channel.id,
        name: channel.name,
        handle: channel.handle,
        avatarUrl: channel.avatarUrl,
        description: channel.description,
        subscribersCount: channel.subscribersCount,
        verified: channel.verified,
      } } } as Post;
      if (mode === "published") onPosted(normalized);
      else onDraft?.(normalized);
      setText("");
      setMedia([]);
      setMode("published");
      setScheduledAt("");
      onClose();
      pushGlobalToast(mode === "published" ? "Пост канала опубликован" : mode === "draft" ? "Черновик сохранён" : "Пост запланирован", "success");
    } catch {
      setError(mode === "published" ? "Не удалось опубликовать пост от канала" : "Не удалось сохранить пост в студии");
    }
    setPosting(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-lg ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
            <h3 className="font-display font-bold text-xl mb-1">Пост от имени канала</h3>
            <p className="text-xs text-white/45 mb-4">@{channel.handle}</p>
            {error && <div className="mb-3 rounded-2xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">{error}</div>}
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 280))} rows={4} maxLength={280} placeholder="Что публикуем в канал?" className="w-full rounded-2xl glass px-4 py-3 text-sm outline-none resize-none focus:border-neon-purple/40" />
            <div className="mt-1 flex items-center justify-between text-[11px] text-white/35">
              <span>{media.length}/10 файлов · {(totalSize / 1024 / 1024).toFixed(1)} / 50 МБ</span>
              <span className={charsLeft < 25 ? "text-red-300" : ""}>{text.length}/280</span>
            </div>
            {media.length > 0 && <div className="grid grid-cols-5 gap-2 mt-3">{media.map((m, i) => <div key={m.url} className="relative aspect-square rounded-xl overflow-hidden bg-white/5">{m.type === "video" ? <video src={m.url} className="h-full w-full object-cover" muted playsInline /> : <img src={m.url} alt="" className="h-full w-full object-cover" />}<button onClick={() => setMedia((prev) => prev.filter((_, idx) => idx !== i))} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white"><X size={11}/></button></div>)}</div>}
            <div className="mt-3 rounded-2xl glass p-3">
              <div className="mb-2 text-xs text-white/45">Публикация</div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["published", "Сейчас", Send],
                  ["draft", "Черновик", FileEdit],
                  ["scheduled", "Отложить", Clock3],
                ] as const).map(([id, label, Icon]) => (
                  <button key={id} type="button" onClick={() => setMode(id)} className={mode === id ? "btn-glow px-2 py-2 text-xs" : "btn-ghost px-2 py-2 text-xs"}>
                    <Icon size={13} className="inline mr-1" /> {label}
                  </button>
                ))}
              </div>
              {mode === "scheduled" && <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="ng-input mt-2 py-2.5 text-xs" />}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input ref={fileInput} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
              <button onClick={() => fileInput.current?.click()} className="btn-ghost px-4 py-2.5 text-sm flex items-center gap-2"><ImageIcon size={15}/> Медиа</button>
              <div className="flex-1" />
              <button onClick={publish} disabled={posting || (!text.trim() && media.length === 0)} className="btn-glow px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">{posting ? <Loader2 size={15} className="animate-spin"/> : mode === "draft" ? <FileEdit size={15}/> : mode === "scheduled" ? <Clock3 size={15}/> : <Send size={15}/>} {mode === "draft" ? "Сохранить" : mode === "scheduled" ? "Запланировать" : "Опубликовать"}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


function ChannelSettingsModal({
  open,
  channel,
  canManageRoles,
  onClose,
  onUpdated,
  onRoles,
  onDelete,
}: {
  open: boolean;
  channel: ChannelRow;
  canManageRoles: boolean;
  onClose: () => void;
  onUpdated: (patch: Partial<ChannelRow>) => void;
  onRoles: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<"main" | "style" | "access" | "roles" | "danger">("main");
  const [name, setName] = useState(channel.name);
  const [handle, setHandle] = useState(channel.handle);
  const [description, setDescription] = useState(channel.description);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(channel.avatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(channel.bannerUrl ?? null);
  const [tags, setTags] = useState<string[]>(channel.tags ?? []);
  const [customTag, setCustomTag] = useState("");
  const [boostColor, setBoostColor] = useState(channel.boostColor || "#ffffff");
  const [boostAvatarFrame, setBoostAvatarFrame] = useState<string | null>(channel.boostAvatarFrame || null);
  const [hideSubscribers, setHideSubscribers] = useState(Boolean(channel.hideSubscribers));
  const [isPrivate, setIsPrivate] = useState(Boolean(channel.isPrivate));
  const [chatEnabled, setChatEnabled] = useState(channel.chatEnabled !== false);
  const [commentsEnabled, setCommentsEnabled] = useState(channel.commentsEnabled !== false);
  const [commentSlowModeSeconds, setCommentSlowModeSeconds] = useState(Math.max(0, channel.commentSlowModeSeconds ?? 0));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const boostLevel = channel.boostMeta?.level ?? channel.boostLevel ?? 0;
  const colorOptions = channel.availableBoostColors ?? [];
  const frameOptionsRaw = channel.availableBoostFrames ?? [];

  useEffect(() => {
    if (!open) return;
    setTab("main");
    setName(channel.name);
    setHandle(channel.handle);
    setDescription(channel.description);
    setAvatarUrl(channel.avatarUrl ?? null);
    setBannerUrl(channel.bannerUrl ?? null);
    setTags(channel.tags ?? []);
    setCustomTag("");
    setBoostColor(channel.boostColor || "#ffffff");
    setBoostAvatarFrame(channel.boostAvatarFrame || null);
    setHideSubscribers(Boolean(channel.hideSubscribers));
    setIsPrivate(Boolean(channel.isPrivate));
    setChatEnabled(channel.chatEnabled !== false);
    setCommentsEnabled(channel.commentsEnabled !== false);
    setCommentSlowModeSeconds(Math.max(0, channel.commentSlowModeSeconds ?? 0));
  }, [channel, open]);

  const normalizedHandle = handle.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
  const frameOptions = [null, ...frameOptionsRaw].map((id) => ({ id, ...channelFrameMeta(id) }));

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag].slice(0, 8));
  }

  function addCustomTag() {
    const tag = customTag.trim().replace(/^#/, "").slice(0, 24);
    if (!tag) return;
    setTags((prev) => prev.includes(tag) ? prev : [...prev, tag].slice(0, 8));
    setCustomTag("");
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function pick(file: File | undefined, type: "avatar" | "banner") {
    if (!file) return;
    setUploading(type);
    try {
      const url = await uploadMedia(file, type === "avatar" ? "avatars" : "posts");
      if (type === "avatar") setAvatarUrl(url);
      else setBannerUrl(url);
    } catch {
      const dataUrl = await fileToDataUrl(file).catch(() => "");
      if (dataUrl) {
        if (type === "avatar") setAvatarUrl(dataUrl);
        else setBannerUrl(dataUrl);
      }
      pushGlobalToast("Storage недоступен — временно использован data URL", "error");
    } finally {
      setUploading(null);
    }
  }

  async function saveSettings() {
    if (!name.trim()) return pushGlobalToast("Название канала обязательно", "error");
    if (!normalizedHandle || normalizedHandle.length < 3) return pushGlobalToast("Юзернейм канала должен быть минимум 3 символа", "error");
    if (!avatarUrl) return pushGlobalToast("Аватарка канала обязательна", "error");
    setSaving(true);
    try {
      const patch: Partial<ChannelRow> = {
        name: name.trim(),
        handle: normalizedHandle,
        description: description.slice(0, 300),
        avatarUrl,
        bannerUrl,
        tags,
        hideSubscribers,
        isPrivate,
        chatEnabled,
        commentsEnabled,
        commentSlowModeSeconds,
      };
      if (boostLevel > 0) {
        patch.boostColor = boostColor;
        patch.boostAvatarFrame = boostAvatarFrame;
      }
      const raw = await api.updateChannel(channel.id, patch);
      const updated = raw as Record<string, unknown>;
      const normalizedPatch: Partial<ChannelRow> = {
        ...patch,
        name: String(updated.name ?? patch.name),
        handle: String(updated.handle ?? patch.handle),
        description: String(updated.description ?? patch.description ?? ""),
        avatarUrl: (updated.avatarUrl as string) ?? (updated.avatar_url as string) ?? patch.avatarUrl,
        bannerUrl: (updated.bannerUrl as string) ?? (updated.banner_url as string) ?? patch.bannerUrl,
        tags: (updated.tags as string[]) ?? patch.tags,
      };
      onUpdated(normalizedPatch);
      pushGlobalToast("Настройки канала сохранены", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить настройки канала";
      pushGlobalToast(message.includes("409") ? "Юзернейм канала уже занят" : message, "error");
    }
    setSaving(false);
  }

  const tabs = [
    { id: "main" as const, label: "Основное", icon: Pencil },
    { id: "style" as const, label: "Оформление", icon: Sparkles },
    { id: "access" as const, label: "Доступ", icon: Shield },
    { id: "roles" as const, label: "Роли", icon: UserCog },
    { id: "danger" as const, label: "Удаление", icon: Trash2 },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-3xl ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[90vh] overflow-y-auto">
            <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
            <h3 className="font-display font-bold text-xl mb-1">Настройки канала</h3>
            <p className="text-xs text-white/45 mb-4">Всё управление каналом разложено по разделам.</p>

            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {tabs.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button key={item.id} onClick={() => setTab(item.id)} className={active ? "btn-glow px-3 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap" : "btn-ghost px-3 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap"}>
                    <Icon size={13} /> {item.label}
                  </button>
                );
              })}
            </div>

            {tab === "main" && (
              <div className="space-y-4">
                <div className="h-36 overflow-hidden rounded-3xl bg-white/5 relative">
                  {bannerUrl ? <img src={bannerUrl} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full" style={{ background: "linear-gradient(120deg,var(--accent-main),var(--accent-tertiary),var(--accent-secondary))" }} />}
                  <button onClick={() => bannerInput.current?.click()} className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition hover:opacity-100">
                    {uploading === "banner" ? <Loader2 size={22} className="animate-spin" /> : <ImageIcon size={24} />}
                  </button>
                  <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0], "banner")} />
                </div>

                <div className="grid gap-4 md:grid-cols-[96px_1fr]">
                  <div>
                    <button onClick={() => avatarInput.current?.click()} className="grid h-24 w-24 place-items-center overflow-hidden rounded-3xl bg-neon-purple/15 shadow-glow">
                      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : uploading === "avatar" ? <Loader2 size={22} className="animate-spin text-neon-purple" /> : <ImageIcon size={24} className="text-white/50" />}
                    </button>
                    <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0], "avatar")} />
                  </div>
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" className="ng-input" />
                      <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Юзернейм" className="ng-input" />
                    </div>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} rows={4} placeholder="Описание" className="ng-input resize-none" />
                  </div>
                </div>

                <div className="rounded-3xl glass p-3">
                  <div className="mb-2 text-xs text-white/45">Теги канала</div>
                  <div className="mb-2 flex flex-wrap gap-2">{CHANNEL_SUGGESTED_TAGS.map((tag) => <button key={tag} onClick={() => toggleTag(tag)} className={tags.includes(tag) ? "btn-glow px-3 py-1.5 text-xs" : "btn-ghost px-3 py-1.5 text-xs"}>#{tag}</button>)}</div>
                  {tags.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{tags.map((tag) => <button key={tag} onClick={() => toggleTag(tag)} className="rounded-full bg-neon-purple/15 px-2.5 py-1 text-xs text-neon-purple hover:bg-red-500/10 hover:text-red-300">#{tag} ×</button>)}</div>}
                  <div className="flex gap-2"><input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }} placeholder="свой тег" className="ng-input flex-1 py-2.5 text-sm" /><button onClick={addCustomTag} className="btn-ghost px-3 py-2 text-sm"><Plus size={14} className="inline mr-1" />Добавить</button></div>
                </div>
              </div>
            )}

            {tab === "style" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl glass p-3 text-xs text-white/50">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-white/75">Цвет названия канала</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/35">ур. {boostLevel}</span>
                  </div>
                  {boostLevel > 0 && colorOptions.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {colorOptions.map((color) => {
                        const meta = CHANNEL_COLOR_NAMES[color.toLowerCase()] ?? { label: color, emoji: "✦" };
                        const active = boostColor.toLowerCase() === color.toLowerCase();
                        return (
                          <button key={color} type="button" onClick={() => setBoostColor(color)} className={cn("rounded-2xl border px-2.5 py-2 text-left transition", active ? "border-white shadow-glow" : "border-white/10 hover:scale-[1.02] hover:border-white/30")} style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }} title={`${meta.label} · ${color}`}>
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}><span>{meta.emoji}</span> {meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] text-white/38">Цвета открываются с 1 уровня буста канала.</div>}
                </div>

                <div className="rounded-3xl glass p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Рамка канала</div>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/35">{frameOptionsRaw.length} открыто</span>
                  </div>
                  {boostLevel > 0 && frameOptionsRaw.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {frameOptions.map((item) => (
                        <button key={item.id ?? "none"} type="button" onClick={() => setBoostAvatarFrame(item.id)} className={cn("rounded-2xl border px-3 py-2 text-left text-xs transition", boostAvatarFrame === item.id ? "bg-neon-purple/20 border-neon-purple/50 text-white shadow-glow" : "glass border-white/10 text-white/60 hover:text-white")}>
                          <span className="mb-1 flex items-center gap-2"><span>{item.emoji}</span><span className="font-semibold">{item.label}</span></span>
                          <span className="block h-1.5 rounded-full" style={{ background: item.preview }} />
                        </button>
                      ))}
                    </div>
                  ) : <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] text-white/38">Рамки открываются с 1 уровня буста канала.</div>}
                </div>
              </div>
            )}

            {tab === "access" && (
              <div className="space-y-3 rounded-3xl glass p-3">
                <ToggleRow label="Скрыть список подписчиков" checked={hideSubscribers} onChange={setHideSubscribers} />
                <ToggleRow label="Приватный канал" checked={isPrivate} onChange={setIsPrivate} />
                <ToggleRow label="Чат канала включён" checked={chatEnabled} onChange={setChatEnabled} />
                <ToggleRow label="Комментарии под постами" checked={commentsEnabled} onChange={setCommentsEnabled} />
                <div className="rounded-2xl bg-white/[0.035] px-3 py-3">
                  <div className="mb-2 flex items-center gap-2 text-sm text-white/70"><Timer size={14} className="text-neon-purple" /> Медленный режим комментариев</div>
                  <CustomSelect value={String(commentSlowModeSeconds)} onChange={(value) => setCommentSlowModeSeconds(Number(value) || 0)} options={[
                    { value: "0", label: "Выключен" },
                    { value: "10", label: "10 секунд" },
                    { value: "30", label: "30 секунд" },
                    { value: "60", label: "1 минута" },
                    { value: "300", label: "5 минут" },
                    { value: "900", label: "15 минут" },
                  ]} />
                </div>
                <div className="rounded-2xl bg-white/[0.035] px-3 py-2 text-xs text-white/38">Инвайты, чат и правила комментариев применяются ко всем подписчикам канала.</div>
              </div>
            )}

            {tab === "roles" && (
              <div className="rounded-3xl glass p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold"><UserCog size={16} className="text-neon-purple" /> Роли и команда</div>
                <p className="mb-4 text-sm text-white/48">Назначай совладельцев, админов, редакторов и модераторов. Передача владельца тоже находится здесь.</p>
                <button onClick={onRoles} disabled={!canManageRoles} className="btn-glow w-full py-3 text-sm disabled:opacity-45">Открыть управление ролями</button>
                {!canManageRoles && <div className="mt-2 text-[11px] text-white/35">Управление ролями доступно владельцу, совладельцу или site admin.</div>}
              </div>
            )}

            {tab === "danger" && (
              <div className="rounded-3xl border border-red-500/25 bg-red-500/5 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-red-200"><Trash2 size={16} /> Опасная зона</div>
                <p className="mb-4 text-sm text-white/48">Удаление канала необратимо. Посты и настройки канала будут очищены.</p>
                <button onClick={onDelete} className="w-full rounded-xl bg-red-500/10 border border-red-500/25 py-3 text-sm text-red-300 hover:bg-red-500/15">Удалить канал</button>
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={onClose} className="btn-ghost px-5 py-2.5 text-sm">Закрыть</button>
              <button onClick={saveSettings} disabled={saving} className="btn-glow px-5 py-2.5 text-sm disabled:opacity-50">{saving ? "Сохраняем…" : "Сохранить всё"}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="w-full flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left hover:bg-white/5 transition">
      <span className="text-sm text-white/70">{label}</span>
      <span className={checked ? "h-6 w-11 rounded-full bg-neon-purple/70 p-1" : "h-6 w-11 rounded-full bg-white/10 p-1"}>
        <span className={checked ? "block h-4 w-4 rounded-full bg-white translate-x-5 transition" : "block h-4 w-4 rounded-full bg-white/70 transition"} />
      </span>
    </button>
  );
}

function DeleteChannelModal({
  open,
  channel,
  onClose,
  onDeleted,
}: {
  open: boolean;
  channel: ChannelRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!password.trim()) return setError("Введите пароль");
    setDeleting(true);
    setError(null);
    try {
      await api.deleteChannel(channel.id, password);
      pushGlobalToast("Канал удалён", "success");
      onClose();
      onDeleted();
    } catch {
      setError("Не удалось удалить канал: проверь пароль");
    }
    setDeleting(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-sm ng-solid rounded-4xl p-6 text-center shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-red-500/12 text-red-300"><Trash2 size={28} /></div>
            <h3 className="font-display font-bold text-lg">Удалить канал?</h3>
            <p className="mt-2 text-sm text-white/50">Канал @{channel.handle} будет удалён. Для подтверждения введите пароль.</p>
            {error && <div className="mt-4 rounded-2xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300">{error}</div>}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" className="mt-4 w-full rounded-xl glass px-3 py-2.5 text-sm outline-none" />
            <div className="mt-4 flex gap-2">
              <button onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">Отмена</button>
              <button onClick={confirmDelete} disabled={deleting || !password.trim()} className="flex-1 rounded-xl bg-red-500/20 border border-red-500/40 py-2.5 text-sm text-red-200 hover:bg-red-500/30 disabled:opacity-50">{deleting ? "…" : "Удалить"}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ChannelRoleRow {
  userId: string;
  role: string;
  roleLabel?: string;
  user?: {
    id: string;
    username: string;
    displayName?: string;
    display_name?: string;
    avatarUrl?: string | null;
    avatar_url?: string | null;
  };
}

const CHANNEL_ROLE_OPTIONS = [
  { id: "co_owner", label: "Совладелец", desc: "Почти все права, кроме безопасной передачи владельца" },
  { id: "admin", label: "Админ", desc: "Редактирует канал и публикует посты" },
  { id: "editor", label: "Редактор", desc: "Может публиковать посты от имени канала" },
  { id: "moderator", label: "Модератор", desc: "Роль для будущей модерации канала" },
];

function ChannelRolesModal({
  open,
  channel,
  onClose,
  onOwnerTransferred,
}: {
  open: boolean;
  channel: ChannelRow;
  onClose: () => void;
  onOwnerTransferred: (ownerId: string) => void;
}) {
  const [roles, setRoles] = useState<ChannelRoleRow[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [selectedUser, setSelectedUser] = useState<Record<string, unknown> | null>(null);
  const [role, setRole] = useState("editor");
  const [password, setPassword] = useState("");
  const [transferTarget, setTransferTarget] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.getChannelRoles(channel.id)
      .then((data) => setRoles(data as ChannelRoleRow[]))
      .catch(() => {
        setRoles([]);
        pushGlobalToast("Не удалось загрузить роли канала. Проверь миграцию channel_roles.", "error");
      })
      .finally(() => setLoading(false));
  }, [channel.id, open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.searchUsers(query.trim()).then((data) => setResults(data as Record<string, unknown>[])).catch(() => setResults([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [open, query]);

  async function refreshRoles() {
    const data = await api.getChannelRoles(channel.id);
    setRoles(data as ChannelRoleRow[]);
  }

  async function assignRole() {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await api.setChannelRole(channel.id, String(selectedUser.id), role);
      pushGlobalToast("Роль канала обновлена", "success");
      setSelectedUser(null);
      setQuery("");
      await refreshRoles();
    } catch {
      pushGlobalToast("Не удалось назначить роль", "error");
    }
    setSaving(false);
  }

  async function removeRole(userId: string) {
    setSaving(true);
    try {
      await api.removeChannelRole(channel.id, userId);
      pushGlobalToast("Роль снята", "success");
      await refreshRoles();
    } catch {
      pushGlobalToast("Не удалось снять роль", "error");
    }
    setSaving(false);
  }

  async function transferOwner() {
    if (!transferTarget || !password.trim()) return;
    setSaving(true);
    try {
      const res = await api.transferChannelOwner(channel.id, String(transferTarget.id), password);
      pushGlobalToast("Владелец канала изменён", "success");
      onOwnerTransferred(res.ownerId);
      setTransferTarget(null);
      setPassword("");
      await refreshRoles();
    } catch {
      pushGlobalToast("Не удалось передать владельца: проверь пароль", "error");
    }
    setSaving(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-2xl ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[90vh] overflow-y-auto">
            <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
            <h3 className="font-display font-bold text-xl flex items-center gap-2 mb-1"><UserCog size={19} className="text-neon-purple" /> Роли канала</h3>
            <p className="text-xs text-white/45 mb-4">Назначай совладельцев, админов, редакторов и модераторов для @{channel.handle}</p>

            <div className="rounded-3xl glass p-4 mb-4">
              <div className="font-semibold text-sm mb-3">Назначить роль</div>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти пользователя по username…" className="w-full rounded-xl glass pl-9 pr-3 py-2.5 text-sm outline-none" />
              </div>
              {results.length > 0 && (
                <div className="mb-3 max-h-36 overflow-y-auto rounded-2xl glass p-1">
                  {results.map((u) => (
                    <button key={String(u.id)} onClick={() => { setSelectedUser(u); setQuery(String(u.username ?? "")); setResults([]); }} className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5">
                      <div className="text-sm font-semibold">@{String(u.username ?? "")}</div>
                      <div className="text-xs text-white/40">{String(u.displayName ?? u.display_name ?? "")}</div>
                    </button>
                  ))}
                </div>
              )}
              <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                <CustomSelect
                  value={role}
                  onChange={setRole}
                  options={CHANNEL_ROLE_OPTIONS.map((r) => ({ value: r.id, label: r.label, description: r.desc }))}
                  buttonClassName="rounded-xl px-3 py-2.5 text-sm"
                />
                <button onClick={assignRole} disabled={!selectedUser || saving} className="btn-glow px-4 py-2.5 text-sm disabled:opacity-50">Назначить</button>
              </div>
              <div className="mt-2 text-[11px] text-white/35">{CHANNEL_ROLE_OPTIONS.find((r) => r.id === role)?.desc}</div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="font-semibold text-sm">Команда канала</div>
              {loading ? <div className="py-6 text-center text-white/40"><Loader2 size={18} className="animate-spin mx-auto" /></div> : roles.length === 0 ? <div className="text-xs text-white/40">Роли пока не назначены</div> : roles.map((r) => (
                <div key={`${r.userId}-${r.role}`} className="glass rounded-2xl p-3 flex items-center gap-3">
                  {r.role === "owner" ? <Crown size={18} className="text-neon-gold" /> : <Shield size={18} className="text-neon-purple" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">@{r.user?.username ?? r.userId}</div>
                    <div className="text-xs text-white/45">{r.roleLabel ?? r.role}</div>
                  </div>
                  {r.role !== "owner" && <button onClick={() => removeRole(r.userId)} disabled={saving} className="rounded-xl bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20">Снять</button>}
                  {r.role !== "owner" && <button onClick={() => setTransferTarget(r.user as unknown as Record<string, unknown>)} className="btn-ghost px-3 py-1.5 text-xs">Передать владельца</button>}
                </div>
              ))}
            </div>

            {transferTarget && (
              <div className="rounded-3xl border border-amber-400/25 bg-amber-400/5 p-4">
                <div className="font-semibold text-sm text-amber-200 mb-1">Передача владельца</div>
                <p className="text-xs text-white/45 mb-3">Новый владелец: @{String(transferTarget.username ?? "")}. Старый владелец станет совладельцем. Нужно подтвердить паролем.</p>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ваш пароль" className="w-full rounded-xl glass px-3 py-2.5 text-sm outline-none mb-3" />
                <div className="flex gap-2">
                  <button onClick={() => setTransferTarget(null)} className="btn-ghost flex-1 py-2.5 text-sm">Отмена</button>
                  <button onClick={transferOwner} disabled={!password.trim() || saving} className="btn-glow flex-1 py-2.5 text-sm disabled:opacity-50">Передать</button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BoostChannelModal({
  open,
  channel,
  onClose,
  onBoosted,
}: {
  open: boolean;
  channel: ChannelRow;
  onClose: () => void;
  onBoosted: (patch: Partial<ChannelRow>) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [reclaimBoosts, setReclaimBoosts] = useState<Record<string, unknown>[]>([]);
  const [selectedReclaim, setSelectedReclaim] = useState<Set<string>>(new Set());

  const activeBoosts = channel.boostMeta?.activeBoosts ?? channel.activeBoosts ?? 0;
  const needPerLevel = channel.boostMeta?.needPerLevel ?? Math.max(1, Math.ceil((channel.subscribersCount || 1) / 25));
  const currentLevel = channel.boostMeta?.level ?? Math.min(3, Math.floor(activeBoosts / needPerLevel));
  const nextLevelBoosts = currentLevel >= 3 ? 3 * needPerLevel : (currentLevel + 1) * needPerLevel;
  const progress = currentLevel >= 3 ? 100 : Math.max(0, Math.min(100, (activeBoosts / Math.max(1, nextLevelBoosts)) * 100));
  const afterOneBoostLevel = Math.min(3, Math.floor((activeBoosts + 1) / needPerLevel));
  const reachesNewLevel = afterOneBoostLevel > currentLevel;
  const maxReached = currentLevel >= 3;

  const levelInfo = [
    {
      level: 1,
      need: needPerLevel,
      title: "Уровень 1",
      desc: "Открывает базовое оформление канала: цвета названия, glow и одноцветные рамки в настройках.",
    },
    {
      level: 2,
      need: needPerLevel * 2,
      title: "Уровень 2",
      desc: "Открывает больше цветов, двухцветные рамки и расширенные визуальные настройки канала.",
    },
    {
      level: 3,
      need: needPerLevel * 3,
      title: "Уровень 3",
      desc: "Максимальный уровень: радужные/анимированные рамки, приоритет и полный набор оформления.",
    },
  ];

  async function loadReclaimList() {
    const data = await api.getMyChannelBoosts().catch(() => []);
    setReclaimBoosts(data as Record<string, unknown>[]);
    setSelectedReclaim(new Set());
  }

  async function applyBoost() {
    setSaving("boost");
    try {
      const res = await api.boostChannel(channel.id, { kind: "boost" });
      const meta = res.boostMeta as ChannelRow["boostMeta"] | undefined;
      const unlockedColors = meta ? CHANNEL_BOOST_COLORS.slice(0, (meta.level ?? 0) * CHANNEL_UNLOCK_PER_LEVEL) : [];
      const unlockedFrames = meta ? CHANNEL_BOOST_FRAMES.slice(0, (meta.level ?? 0) * CHANNEL_UNLOCK_PER_LEVEL) : [];
      const patch: Partial<ChannelRow> = {
        boostedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        activeBoosts: res.activeBoosts ?? (channel.activeBoosts ?? 0) + 1,
        boostMeta: meta,
        boostLevel: meta?.level,
        availableBoostColors: unlockedColors,
        availableBoostFrames: unlockedFrames,
      };
      onBoosted(patch);
      if ((meta?.level ?? 0) > currentLevel) {
        pushGlobalToast(`Канал достиг ${meta?.level} уровня! Оформление открыто в настройках.`, "success");
      } else {
        pushGlobalToast("Буст засчитан. Оформление выбирается в настройках канала.", "success");
      }
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Не удалось забустить канал";
      if (/No boosts|402|Свободных бустов нет/i.test(message)) {
        await loadReclaimList();
        pushGlobalToast("Свободных бустов нет. Можно забрать бусты из других каналов.", "info");
      } else {
        pushGlobalToast(message, "error");
      }
    }
    setSaving(null);
  }

  async function reclaimAndBoost() {
    if (selectedReclaim.size === 0) return;
    setSaving("reclaim");
    try {
      for (const id of Array.from(selectedReclaim)) await api.removeChannelBoost(id);
      setReclaimBoosts([]);
      setSelectedReclaim(new Set());
      await applyBoost();
    } catch {
      pushGlobalToast("Не удалось забрать бусты", "error");
      setSaving(null);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-lg ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
            <h3 className="font-display font-bold text-xl flex items-center gap-2 mb-1"><Sparkles size={19} className="text-neon-gold" /> Буст канала</h3>
            <p className="text-xs text-white/45 mb-4">Буст повышает уровень канала. Цвета, glow и рамки теперь выбираются отдельно в <b className="text-white/70">Настройки → Оформление</b>, чтобы буст не путался с выбором дизайна.</p>

            <div className="relative mb-4 overflow-hidden rounded-4xl border border-neon-purple/25 bg-white/[0.035] p-4">
              <motion.div
                className="absolute -inset-16 opacity-50 blur-2xl"
                style={{ background: maxReached ? "conic-gradient(from 0deg,#fbbf24,#ec4899,#22d3ee,#a855f7,#fbbf24)" : "conic-gradient(from 0deg,#a855f7,#ec4899,#22d3ee,#a855f7)" }}
                animate={{ rotate: [0, 360], scale: [1, 1.06, 1] }}
                transition={{ rotate: { duration: 10, repeat: Infinity, ease: "linear" }, scale: { duration: 3.5, repeat: Infinity } }}
              />
              <div className="relative flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-3xl border border-white/15 bg-black/35 shadow-glow">
                  <Sparkles size={28} className={maxReached ? "text-neon-gold" : "text-neon-purple"} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">текущий уровень</div>
                  <div className="font-display text-2xl font-black text-white">Lv.{currentLevel}/3</div>
                  <div className="text-xs text-white/48">{maxReached ? "Максимальный уровень достигнут" : reachesNewLevel ? `Следующий буст откроет уровень ${afterOneBoostLevel}` : `${Math.max(0, nextLevelBoosts - activeBoosts)} буст. до следующего уровня`}</div>
                </div>
              </div>
              <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-neon-purple via-pink-400 to-neon-gold" style={{ width: `${progress}%` }} layout />
              </div>
              {maxReached && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative mt-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                  ✨ Уровень достигнут: все визуальные возможности канала уже открыты в настройках оформления.
                </motion.div>
              )}
            </div>

            <div className="mb-4 rounded-3xl glass p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-white/75">Что дают уровни</span>
                <span className="text-[11px] text-white/35">{activeBoosts}/{3 * needPerLevel} бустов</span>
              </div>
              <div className="space-y-2">
                {levelInfo.map((level) => {
                  const unlocked = currentLevel >= level.level;
                  return (
                    <div key={level.level} className={unlocked ? "rounded-2xl border border-neon-gold/30 bg-neon-gold/10 p-3" : "rounded-2xl border border-white/10 bg-white/[0.03] p-3"}>
                      <div className="flex items-center gap-2">
                        <span className={unlocked ? "text-sm font-bold text-neon-gold" : "text-sm font-bold text-white/65"}>{level.title}</span>
                        <span className="ml-auto text-[11px] text-white/40">нужно {level.need} буст.</span>
                      </div>
                      <div className="mt-1 text-xs text-white/50 leading-relaxed">{level.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={applyBoost} disabled={Boolean(saving)} className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-55">
              {saving === "boost" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {maxReached ? "Добавить буст в поддержку канала" : reachesNewLevel ? `Забустить и открыть уровень ${afterOneBoostLevel}` : "Забустить канал"}
            </button>

            {reclaimBoosts.length > 0 && (
              <div className="mt-4 rounded-3xl border border-amber-400/25 bg-amber-400/5 p-3">
                <div className="text-sm font-semibold text-amber-200 mb-2">Забрать бусты из других каналов</div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {reclaimBoosts.map((boost) => {
                    const id = String(boost.id);
                    const channelInfo = (boost.channel ?? {}) as Record<string, unknown>;
                    const checked = selectedReclaim.has(id);
                    return (
                      <button key={id} onClick={() => setSelectedReclaim((prev) => { const next = new Set(prev); if (checked) next.delete(id); else next.add(id); return next; })} className="w-full flex items-center gap-2 rounded-2xl glass px-3 py-2 text-left hover:brightness-110">
                        <span className={checked ? "grid h-5 w-5 place-items-center rounded-md bg-neon-purple text-white" : "grid h-5 w-5 place-items-center rounded-md border border-white/20"}>{checked ? "✓" : ""}</span>
                        <span className="min-w-0 flex-1 text-xs text-white/70 truncate">{String(channelInfo.name ?? "Канал")} · 1 буст</span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={reclaimAndBoost} disabled={selectedReclaim.size === 0 || saving === "reclaim"} className="btn-glow mt-3 w-full py-2.5 text-sm disabled:opacity-50">
                  {saving === "reclaim" ? "Переносим…" : "Забрать выбранные и забустить"}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChannelModerationModal({ open, channel, onClose }: { open: boolean; channel: ChannelRow; onClose: () => void }) {
  const [tab, setTab] = useState<"bans" | "log">("bans");
  const [bans, setBans] = useState<Record<string, unknown>[]>([]);
  const [log, setLog] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([api.getChannelBans(channel.id).catch(() => []), api.getChannelModerationLog(channel.id).catch(() => [])])
      .then(([banRows, logRows]) => { setBans(banRows as Record<string, unknown>[]); setLog(logRows as Record<string, unknown>[]); })
      .finally(() => setLoading(false));
  }, [channel.id, open]);

  return <AnimatePresence>{open && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4">
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
    <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.96 }} className="relative z-10 w-full max-w-xl ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[88vh] overflow-y-auto">
      <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
      <h3 className="font-display font-bold text-xl flex items-center gap-2"><Shield size={19} className="text-neon-purple" /> Модерация канала</h3>
      <p className="mt-1 text-xs text-white/45">Блокировки подписчиков и журнал действий команды.</p>
      <div className="mt-4 flex gap-2"><button onClick={() => setTab("bans")} className={tab === "bans" ? "btn-glow px-3 py-2 text-xs" : "btn-ghost px-3 py-2 text-xs"}><Ban size={13} className="inline mr-1" /> Блокировки</button><button onClick={() => setTab("log")} className={tab === "log" ? "btn-glow px-3 py-2 text-xs" : "btn-ghost px-3 py-2 text-xs"}><History size={13} className="inline mr-1" /> Журнал</button></div>
      {loading ? <div className="grid place-items-center py-12"><Loader2 size={20} className="animate-spin text-neon-purple" /></div> : tab === "bans" ? <div className="mt-4 space-y-2">
        {bans.length === 0 ? <div className="rounded-3xl glass p-7 text-center text-sm text-white/40">Заблокированных пользователей нет</div> : bans.map((row) => {
          const u = (row.user || {}) as Record<string, unknown>;
          return <div key={String(row.userId)} className="flex items-center gap-3 rounded-2xl glass p-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-red-500/10 text-red-300"><Ban size={16} /></div><div className="min-w-0 flex-1"><div className="font-semibold text-sm truncate">{String(u.display_name ?? u.displayName ?? u.username ?? row.userId)}</div><div className="text-xs text-white/40 truncate">@{String(u.username ?? "unknown")} · {String(row.reason ?? "Без причины")}</div>{row.expiresAt ? <div className="text-[10px] text-white/30">До {new Date(String(row.expiresAt)).toLocaleString("ru-RU")}</div> : <div className="text-[10px] text-red-300/60">Бессрочно</div>}</div><button onClick={async () => { try { await api.unbanChannelSubscriber(channel.id, String(row.userId)); setBans((prev) => prev.filter((x) => String(x.userId) !== String(row.userId))); pushGlobalToast("Блокировка снята", "success"); } catch { pushGlobalToast("Не удалось снять блокировку", "error"); } }} className="btn-ghost px-3 py-2 text-xs">Разблокировать</button></div>;
        })}
      </div> : <div className="mt-4 space-y-2">
        {log.length === 0 ? <div className="rounded-3xl glass p-7 text-center text-sm text-white/40">Журнал пока пуст</div> : log.map((row) => { const actor=(row.actor||{}) as Record<string,unknown>; const target=(row.target||{}) as Record<string,unknown>; return <div key={String(row.id)} className="rounded-2xl glass p-3"><div className="flex items-center gap-2 text-sm"><History size={14} className="text-neon-purple" /><span className="font-semibold">{String(row.action ?? "action")}</span><span className="ml-auto text-[10px] text-white/30">{new Date(String(row.createdAt)).toLocaleString("ru-RU")}</span></div><div className="mt-1 text-xs text-white/48">@{String(actor.username ?? "system")}{target.username ? ` → @${String(target.username)}` : ""}{row.reason ? ` · ${String(row.reason)}` : ""}</div></div>; })}
      </div>}
    </motion.div>
  </motion.div>}</AnimatePresence>;
}

function ChannelSubscribersModal({
  open,
  channel,
  canModerate = false,
  onClose,
}: {
  open: boolean;
  channel: ChannelRow;
  canModerate?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.getChannelSubscribers(channel.id)
      .then((data) => setUsers(data as Record<string, unknown>[]))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [channel.id, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
            <h3 className="font-display font-bold text-xl flex items-center gap-2 mb-4"><Users size={19} className="text-neon-purple" /> Подписчики канала</h3>
            {loading ? <div className="py-10 grid place-items-center text-white/40"><Loader2 size={20} className="animate-spin" /></div> : users.length === 0 ? <p className="py-8 text-center text-sm text-white/45">Подписчиков не видно или их пока нет</p> : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {users.map((u) => (
                  <div key={String(u.id)} className="flex items-center gap-2 rounded-2xl glass p-3">
                    <button onClick={() => router.push(`/profile/${String(u.username ?? "")}`)} className="min-w-0 flex flex-1 items-center gap-3 text-left hover:brightness-110 transition">
                      {String(u.avatarUrl ?? u.avatar_url ?? "") ? <img src={String(u.avatarUrl ?? u.avatar_url)} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="h-10 w-10 rounded-full bg-neon-purple/15 grid place-items-center">✦</div>}
                      <div className="min-w-0"><div className="font-semibold text-sm truncate">{String(u.displayName ?? u.display_name ?? u.username ?? "")}</div><div className="text-xs text-white/40 truncate">@{String(u.username ?? "")}</div></div>
                    </button>
                    {canModerate && <button onClick={async () => {
                      const reason = window.prompt(`Причина блокировки @${String(u.username ?? "user")}`, "Нарушение правил канала");
                      if (reason === null) return;
                      const durationRaw = window.prompt("Срок блокировки в днях. Оставьте пустым для бессрочной блокировки.", "");
                      if (durationRaw === null) return;
                      const days = Math.max(0, Math.min(3650, Number(durationRaw) || 0));
                      const expiresAt = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
                      try { await api.banChannelSubscriber(channel.id, { userId: String(u.id), reason, expiresAt }); setUsers((prev) => prev.filter((item) => String(item.id) !== String(u.id))); pushGlobalToast(days > 0 ? `Пользователь заблокирован на ${days} дн.` : "Пользователь заблокирован бессрочно", "success"); }
                      catch (error) { pushGlobalToast(error instanceof Error ? error.message : "Не удалось заблокировать", "error"); }
                    }} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20" title="Заблокировать в канале"><Ban size={15} /></button>}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
