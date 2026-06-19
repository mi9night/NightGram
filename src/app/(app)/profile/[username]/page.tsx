"use client";

// =============================================================================
//  NightGram Web — Profile page
//  Shows a customizable banner + avatar that sits ON the glass card edge.
// =============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Grid3x3, UserPlus, Ban,
  ShoppingBag,
  Send,
  Pencil,
  Check,
  Loader2,
  Trophy,
  Crown,
  Flame,
  Star,
  Award,
  Zap,
  Shield,
} from "lucide-react";
import type { Post, StoreItem, User } from "@/types";
import type { LucideIcon } from "lucide-react";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { ColoredUsername, PremiumCrownIcon } from "@/components/shared/Badges";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { PostCard } from "@/components/feed/PostCard";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { cn, formatCount } from "@/lib/utils";

export default function ProfilePage({
  params,
}: {
  params: { username: string };
}) {
  const { username } = params;
  const { user: me } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [ownedItems, setOwnedItems] = useState<StoreItem[]>([]);
  const [tab, setTab] = useState<"posts" | "items">("posts");
  const [loading, setLoading] = useState(true);

  const isMe = me?.username === username || username === "you";

  useEffect(() => {
    let active = true;
    setLoading(true);

    const loadProfile = isMe
      ? me ? Promise.resolve(me) : api.getUserProfile("me").catch(() => null)
      : api.getUserProfile(username);

    loadProfile.then((u) => {
      if (!active) return;
      if (!u) {
        setLoading(false);
        return;
      }
      setProfile(u);
      if (u.username) {
        api.getUserPosts(u.username).catch(() => []).then((p) => active && setPosts(p));
      }
      const owned = new Set(u.ownedItems ?? []);
      setLoading(false);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, isMe]);

  if (loading || !profile) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 size={28} className="animate-spin text-neon-purple" />
      </div>
    );
  }

  // Safe defaults for all profile fields (prevents client-side crash)
  const safeProfile: User = {
    ...profile,
    ngId: Number(profile.ngId ?? 10000001),
    nameColor: profile.nameColor ?? "#ffffff",
    displayName: profile.displayName || profile.username || "Пользователь",
    username: profile.username || "unknown",
    bio: profile.bio ?? "",
    avatarUrl: profile.avatarUrl ?? null,
    bannerUrl: profile.bannerUrl ?? null,
    glowEffect: profile.glowEffect ?? null,
    avatarFrame: profile.avatarFrame ?? null,
    isPremium: profile.isPremium ?? false,
    nightCoins: Number(profile.nightCoins ?? 0),
    followersCount: Number(profile.followersCount ?? 0),
    followingCount: Number(profile.followingCount ?? 0),
    postsCount: Number(profile.postsCount ?? 0),
    customId: profile.customId ?? null,
    ownedItems: profile.ownedItems ?? [],
  };

  const ngIdDisplay = String(safeProfile.ngId).padStart(8, "0");

  return (
    <div className="max-w-4xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        {/* ===== Banner ===== */}
        <div className="h-36 md:h-48 rounded-4xl overflow-hidden relative">
          {safeProfile.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={safeProfile.bannerUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background: `linear-gradient(120deg, ${safeProfile.nameColor}, var(--accent-pink, #ec4899), var(--accent-secondary, #8b5cf6))`,
              }}
            />
          )}
          <motion.div
            className="absolute inset-0 opacity-30"
            style={{ background: "radial-gradient(circle at 30% 50%, rgba(255,255,255,0.4), transparent 60%)" }}
            animate={{ opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
        </div>

        {/* ===== Glass info card ===== */}
        <div className="glass-strong rounded-4xl mx-1 md:mx-4 -mt-6 md:-mt-8 relative z-10 px-4 md:px-6 pb-6 pt-5 overflow-visible">
          {/* Avatar row — avatar on the same level as the name + bio */}
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="shrink-0 self-start">
              <GlowAvatar
                src={safeProfile.avatarUrl}
                alt={safeProfile.username}
                size={96}
                glow={safeProfile.glowEffect ?? undefined}
                frame={safeProfile.avatarFrame ?? undefined}
                ringColor="#0e0a22"
              />
            </div>

            {/* Name + IDs */}
            <div className="flex-1 min-w-0 pb-1 pt-2 md:pt-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="font-display font-bold text-2xl md:text-3xl truncate leading-none"
                  style={{
                    color: safeProfile.nameColor,
                    textShadow: safeProfile.glowEffect ? `0 0 16px ${safeProfile.nameColor}88` : undefined,
                  }}
                >
                  {safeProfile.displayName}
                </h1>
                {/* Badges wrap to next line under the first badge if too many */}
                <div className="inline-flex items-center gap-1.5 flex-wrap max-w-full">
                  {safeProfile.isPremium && <PremiumCrownIcon />}
                  {safeProfile.role && safeProfile.role !== "user" && (
                    <RoleBadge role={safeProfile.role} size={18} showLabel />
                  )}
                </div>
              </div>

              {/* Single identifier line: @customId OR @ngId (no duplicate @) */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {safeProfile.customId ? (
                  <ColoredUsername username={safeProfile.customId} color={safeProfile.nameColor} className="text-sm" />
                ) : (
                  <span
                    className="font-semibold text-sm"
                    style={{ color: safeProfile.nameColor, textShadow: `0 0 10px ${safeProfile.nameColor}88` }}
                  >
                    @{ngIdDisplay}
                  </span>
                )}
              </div>

              <p className="text-white/60 text-sm mt-2 max-w-md">{safeProfile.bio}</p>
            </div>

            {/* Action buttons */}
            {isMe ? (
              <div className="flex gap-2 pb-1">
                <button
                  onClick={() => router.push("/settings")}
                  className="btn-glow px-4 py-2.5 text-sm flex items-center gap-2"
                >
                  <Pencil size={15} /> Изменить
                </button>
              </div>
            ) : (
              <div className="flex gap-2 pb-1 flex-wrap">
                <button className="btn-glow px-4 py-2.5 text-sm flex items-center gap-1.5">
                  <UserPlus size={15} /> В друзья
                </button>
                <button
                  onClick={() => router.push("/messages")}
                  className="btn-glow px-4 py-2.5 text-sm flex items-center gap-1.5"
                >
                  <Send size={15} /> Написать
                </button>
                <button className="btn-ghost px-3 py-2.5 text-sm" title="В избранные">
                  <Star size={15} />
                </button>
                <button className="btn-ghost px-3 py-2.5 text-sm" title="В ЧС">
                  <Ban size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-6 mt-4 pt-4 border-t border-white/5">
            <Stat label="Постов" value={safeProfile.postsCount} />
            <Stat label="Подписчиков" value={safeProfile.followersCount} />
            <Stat label="Подписок" value={safeProfile.followingCount} />
          </div>

          {/* Awards */}
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={13} className="text-neon-gold" />
              <span className="text-xs font-medium text-white/35">Награды</span>
            </div>
            <ProfileAwards isPremium={safeProfile.isPremium} ownedCount={ownedItems.length} />
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 mt-8 border-b border-white/5">
        <TabButton active={tab === "posts"} onClick={() => setTab("posts")} icon={Grid3x3} label="Посты" />
        {isMe && (
          <TabButton active={tab === "items"} onClick={() => setTab("items")} icon={ShoppingBag} label="Купленное" />
        )}
      </div>

      {/* Content */}
      <div className="mt-6">
        <AnimatePresence mode="wait">
          {tab === "posts" ? (
            <motion.div
              key="posts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {posts.map((p, i) => (
                <PostCard key={p.id} post={{ ...p, author: { kind: "user", user: safeProfile } }} index={i} />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="items"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-2 md:grid-cols-3 gap-4"
            >
              {ownedItems.length === 0 ? (
                <div className="col-span-full text-center py-12 text-white/40">
                  <ShoppingBag size={32} className="mx-auto mb-3" />
                  <p>Пока ничего не куплено</p>
                  <button onClick={() => router.push("/store")} className="mt-3 text-neon-purple text-sm hover:underline">
                    Открыть Night Store →
                  </button>
                </div>
              ) : (
                ownedItems.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="gradient-border rounded-3xl glass-strong p-3"
                  >
                    <div className="aspect-square rounded-2xl overflow-hidden mb-2 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.previewUrl} alt={item.name} className="h-full w-full object-cover" />
                      <div className="absolute top-2 right-2 grid place-items-center h-6 w-6 rounded-full bg-green-500/20 border border-green-500/50">
                        <Check size={12} className="text-green-400" />
                      </div>
                    </div>
                    <div className="text-sm font-semibold truncate">{item.name}</div>
                    <div className="text-[11px] text-white/40 capitalize">{item.category.replace("_", " ")}</div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <div className="font-display font-bold text-lg">{formatCount(value ?? 0)}</div>
      <div className="text-xs text-white/45">{label}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition",
        active ? "border-neon-purple text-white" : "border-transparent text-white/50 hover:text-white",
      )}
    >
      <Icon size={16} /> {label}
    </button>
  );
}

// =============================================================================
//  ProfileAwards — achievement badges shown under the stats.
// =============================================================================

interface AwardDef {
  icon: typeof Trophy;
  label: string;
  desc: string;
  color: string;
}

const ALL_AWARDS: AwardDef[] = [
  {
    icon: Crown,
    label: "Premium",
    desc: "Подписка на нашем сайте. Даёт уникальные темы, рамки, glow-эффекты и 2× NightCoins.",
    color: "#fbbf24",
  },
  {
    icon: Flame,
    label: "Первые шаги",
    desc: "Выдан за создание аккаунта и первые действия в NightGram.",
    color: "#f97316",
  },
  {
    icon: Star,
    label: "Звезда",
    desc: "За покупку первого товара в Night Store.",
    color: "#a855f7",
  },
  {
    icon: Award,
    label: "Коллекционер",
    desc: "За владение 3+ товарами из Night Store одновременно.",
    color: "#22d3ee",
  },
  {
    icon: Zap,
    label: "Активист",
    desc: "За регулярную активность: посты, комментарии и реакции каждый день.",
    color: "#ec4899",
  },
  {
    icon: Shield,
    label: "Легенда",
    desc: "Особая награда для самых преданных участников комьюнити NightGram.",
    color: "#6366f1",
  },
];

function ProfileAwards({ isPremium, ownedCount }: { isPremium: boolean; ownedCount: number }) {
  const unlocked = new Set<string>();
  if (isPremium) unlocked.add("Premium");
  unlocked.add("Первые шаги");
  if (ownedCount >= 1) unlocked.add("Звезда");
  if (ownedCount >= 3) unlocked.add("Коллекционер");

  const anyUnlocked = unlocked.size > 0;

  return (
    <div>
      {anyUnlocked ? (
        <div className="flex flex-wrap gap-2">
          {ALL_AWARDS.map((a) => {
            const Icon = a.icon;
            const isUnlocked = unlocked.has(a.label);
            return (
              <div
                key={a.label}
                className={cn(
                  "group relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 transition cursor-default overflow-visible",
                  isUnlocked ? "glass" : "border border-dashed border-white/10",
                )}
                style={
                  isUnlocked
                    ? { boxShadow: `inset 0 0 12px ${a.color}22` }
                    : { background: "rgba(255,255,255,0.03)" }
                }
                title={a.desc}
              >
                <Icon
                  size={15}
                  style={isUnlocked ? { color: a.color } : { color: "rgba(255,255,255,0.35)" }}
                />
                <span className={cn("text-[11px] font-medium", isUnlocked ? "text-white/70" : "text-white/35")}>
                  {a.label}
                </span>

                {/* Tooltip — readable on both locked & unlocked */}
                <div className="pointer-events-none absolute bottom-full left-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 w-56">
                  <div className="ng-solid rounded-xl p-3 text-xs text-white/80 shadow-glow-lg">
                    <div className="font-semibold mb-1 flex items-center gap-1.5" style={{ color: isUnlocked ? a.color : "rgba(255,255,255,0.5)" }}>
                      <Icon size={12} /> {a.label}
                      {!isUnlocked && (
                        <span className="ml-auto text-[9px] uppercase text-white/40">не получена</span>
                      )}
                    </div>
                    {a.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-white/35">
          Пока нету. Будьте активны, чтобы их получить!
        </p>
      )}
    </div>
  );
}
