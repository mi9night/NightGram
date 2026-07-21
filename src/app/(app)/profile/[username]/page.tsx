"use client";

/* eslint-disable @next/next/no-img-element */

// =============================================================================
//  NightGram Web — Profile page
//  Shows a customizable banner + avatar that sits ON the glass card edge.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Grid3x3, UserPlus, Ban,
  ShoppingBag,
  Send,
  Pencil,
  Check,
  Heart,
  Loader2,
  Trophy,
  Crown,
  Flame,
  Star,
  Award,
  Zap,
  Shield,
  MessageSquare,
  Image as ImageIcon,
  X,
  Home,
  Music2,
  Gift,
  Flag,
} from "lucide-react";
import type { Comment, Post, StoreItem, User } from "@/types";
import type { LucideIcon } from "lucide-react";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { ColoredUsername, PremiumCrownIcon } from "@/components/shared/Badges";
import { RoleBadge, VerifiedBadge } from "@/components/shared/RoleBadge";
import { PostCard } from "@/components/feed/PostCard";
import { PostMenu } from "@/components/feed/PostMenu";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { cn, formatCount, timeAgo } from "@/lib/utils";
import { pushGlobalToast } from "@/lib/toast";
import { uploadMedia } from "@/lib/upload";

const STORE_CATEGORY_META: Record<StoreItem["category"] | "all", { label: string; emoji: string }> = {
  all: { label: "Все", emoji: "✨" },
  theme: { label: "Темы", emoji: "🎨" },
  color_pack: { label: "Цвета", emoji: "🌈" },
  sticker_pack: { label: "Стикеры", emoji: "😺" },
  frame: { label: "Рамки", emoji: "🖼️" },
  glow_effect: { label: "Glow", emoji: "💫" },
  badge: { label: "Бейджи", emoji: "👑" },
  nft: { label: "NFT", emoji: "💠" },
};
const STORE_PROFILE_CATEGORIES = Object.keys(STORE_CATEGORY_META) as (StoreItem["category"] | "all")[];

function isUpgradedNftItem(item?: StoreItem | null): boolean {
  return Boolean(item && item.category === "nft" && (item.isNftUpgraded || item.upgradedAt || item.serialNumber || (item.level ?? 1) > 1 || item.nftMetadata?.upgraded));
}

function nftPreviewUrl(item: StoreItem): string {
  return isUpgradedNftItem(item) && item.nftMetadata?.modelUrl ? item.nftMetadata.modelUrl : item.previewUrl;
}

function isVideoAsset(url?: string | null): boolean {
  return Boolean(url && /\.(mp4|webm|mov)(\?|#|$)/i.test(url));
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user: me } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [wallPosts, setWallPosts] = useState<Record<string, unknown>[]>([]);
  const [wallText, setWallText] = useState("");
  const [wallMedia, setWallMedia] = useState<{ type: "image" | "video"; url: string }[]>([]);
  const [wallPosting, setWallPosting] = useState(false);
  const wallFileInput = useRef<HTMLInputElement>(null);
  const [ownedItems, setOwnedItems] = useState<StoreItem[]>([]);
  const [gifts, setGifts] = useState<Record<string, unknown>[]>([]);
  const [itemCategory, setItemCategory] = useState<StoreItem["category"] | "all">("all");
  const [tab, setTab] = useState<"comments" | "posts" | "room" | "items" | "gifts">("comments");
  const [loading, setLoading] = useState(true);
  const [socialLists, setSocialLists] = useState<{ friends: Record<string, unknown>[]; channels: Record<string, unknown>[]; hidden?: boolean }>({ friends: [], channels: [] });
  const [socialModal, setSocialModal] = useState<"followers" | "following" | "friends" | "channels" | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [followersCountLocal, setFollowersCountLocal] = useState(0);
  const [followingCountLocal, setFollowingCountLocal] = useState(0);
  const [showBlockedContent, setShowBlockedContent] = useState(false);
  const [followersList, setFollowersList] = useState<Record<string, unknown>[]>([]);
  const [followingList, setFollowingList] = useState<Record<string, unknown>[]>([]);

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
      setFollowersCountLocal(Number(u.followersCount ?? 0));
      setFollowingCountLocal(Number(u.followingCount ?? 0));
      if (u.username) {
        api.getUserPosts(u.username).catch(() => []).then((p) => active && setPosts(p));
        api.getUserComments(u.username).catch(() => []).then((c) => active && setComments(c));
        api.getProfileWall(u.username).catch(() => []).then((w) => active && setWallPosts(w as Record<string, unknown>[]));
        api.getOwnedStoreItems(u.username).catch(() => []).then((items) => active && setOwnedItems(items));
        api.getUserGifts(u.username).catch(() => []).then((items) => active && setGifts(items as Record<string, unknown>[]));
        api.getUserSocial(u.username).catch(() => ({ friends: [], channels: [], hidden: false })).then((social) => active && setSocialLists(social as { friends: Record<string, unknown>[]; channels: Record<string, unknown>[]; hidden?: boolean }));
        if (!isMe) {
          api.getSocial().catch(() => ({ blocked: [] })).then((social) => {
            if (!active) return;
            const sdata = social as { blocked?: Record<string, unknown>[]; following?: Record<string, unknown>[]; friends?: Record<string, unknown>[] };
            const blocked = (sdata.blocked ?? []).some((x) => String(x.id) === String(u.id));
            setIsBlocked(blocked);
            setIsFollowing((sdata.following ?? []).some((x) => String(x.id) === String(u.id)));
            setIsFriend((sdata.friends ?? []).some((x) => String(x.id) === String(u.id)));
          });
        }
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, isMe]);

  useEffect(() => {
    if (!profile?.id) return;
    const socket = getSocket();
    const onPresence = ({ userId, isOnline, lastSeen }: { userId: string; isOnline: boolean; lastSeen?: string }) => {
      if (userId === profile.id) {
        setProfile((prev) => prev ? { ...prev, isOnline, lastSeen: lastSeen || (isOnline ? prev.lastSeen : new Date().toISOString()) } : prev);
      }
    };
    socket.on("presence:update", onPresence);
    return () => {
      socket.off("presence:update", onPresence);
    };
  }, [profile?.id]);

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
    hidePurchases: profile.hidePurchases ?? false,
    nightStatusText: profile.nightStatusText ?? null,
    nightStatusEmoji: profile.nightStatusEmoji ?? null,
    nightStatusExpiresAt: profile.nightStatusExpiresAt ?? null,
    musicArtist: profile.musicArtist ?? null,
    musicTrack: profile.musicTrack ?? null,
    roomScene: profile.roomScene ?? null,
  };

  const ngIdDisplay = String(safeProfile.ngId).padStart(8, "0");
  const profileDisplayName = safeProfile.deletedAt ? "Удалённый аккаунт" : isBlocked ? "Пользователь в ЧС" : safeProfile.displayName;
  const profileNameColor = safeProfile.deletedAt || isBlocked ? "#fb7185" : safeProfile.nameColor;
  const profileBannerUrl = safeProfile.deletedAt || isBlocked ? null : safeProfile.bannerUrl;
  const profileAvatarUrl = safeProfile.deletedAt || isBlocked ? null : safeProfile.avatarUrl;
  const nightStatusActive = Boolean(
    safeProfile.nightStatusText
      && (!safeProfile.nightStatusExpiresAt || new Date(safeProfile.nightStatusExpiresAt).getTime() > Date.now()),
  );
  const appliedNft = ownedItems.find((item) => item.category === "nft" && item.applied && isUpgradedNftItem(item));
  const appliedBackground = ownedItems.find((item) => item.effectType === "profile_background" && item.applied) ?? appliedNft;

  async function pickWallMedia(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const url = await uploadMedia(file, "posts");
      setWallMedia([{ url, type: file.type.startsWith("video/") ? "video" : "image" }]);
    } catch {
      pushGlobalToast("Не удалось загрузить медиа", "error");
    } finally {
      if (wallFileInput.current) wallFileInput.current.value = "";
    }
  }

  async function submitWallPost() {
    if (!wallText.trim() && wallMedia.length === 0) return;
    setWallPosting(true);
    try {
      const created = await api.addProfileWall(safeProfile.username, { text: wallText.trim() || undefined, media: wallMedia });
      setWallPosts((prev) => [created as Record<string, unknown>, ...prev]);
      setWallText("");
      setWallMedia([]);
      pushGlobalToast("Запись опубликована", "success");
    } catch {
      pushGlobalToast("Не удалось опубликовать запись", "error");
    }
    setWallPosting(false);
  }

  async function openPeopleList(kind: "followers" | "following") {
    setSocialModal(kind);
    try {
      const res = kind === "followers" ? await api.getUserFollowers(safeProfile.username) : await api.getUserFollowing(safeProfile.username);
      if (res.hidden) return;
      if (kind === "followers") setFollowersList(res.users as Record<string, unknown>[]);
      else setFollowingList(res.users as Record<string, unknown>[]);
    } catch {
      if (kind === "followers") setFollowersList([]);
      else setFollowingList([]);
    }
  }

  async function doSocial(action: "friend" | "favorite" | "block", activeText: string, inactiveText: string) {
    try {
      const res = await api.socialAction(action, safeProfile.id);
      const text = res.friends ? "Вы теперь друзья" : (res.active ? activeText : inactiveText);
      pushGlobalToast(text, "success");
      if (action === "friend") {
        setIsFollowing(res.active);
        setIsFriend(Boolean(res.friends));
        setFollowersCountLocal((n) => Math.max(0, n + (res.active ? 1 : -1)));
      }
      if (action === "block") setIsBlocked(res.active);
    } catch {
      pushGlobalToast("Действие недоступно", "error");
    }
  }

  async function reportProfile() {
    const reason = window.prompt("Опиши причину жалобы на профиль:", "");
    if (!reason?.trim()) return;
    try {
      await api.createReport({ targetType: "user", targetId: safeProfile.id, category: "profile_report", reason: reason.trim().slice(0, 1000) });
      pushGlobalToast("Жалоба отправлена модераторам", "success");
    } catch {
      pushGlobalToast("Не удалось отправить жалобу", "error");
    }
  }

  async function openDirectMessage() {
    try {
      const conv = await api.createDirectConversation(safeProfile.id);
      localStorage.setItem("ng_open_chat", conv.id);
      router.push("/messages");
    } catch {
      pushGlobalToast("Не удалось открыть личные сообщения", "error");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        {/* ===== Banner ===== */}
        <div className="h-36 md:h-48 rounded-4xl overflow-hidden relative">
          {appliedBackground && !isBlocked && !safeProfile.deletedAt ? (
            <>
              {appliedBackground.category === "nft" && appliedBackground.nftMetadata?.backgroundCss ? (
                <div className="relative h-full w-full" style={{ background: appliedBackground.nftMetadata.backgroundCss }}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.22),transparent_32%)]" />
                  {isVideoAsset(nftPreviewUrl(appliedBackground)) ? (
                    <video src={nftPreviewUrl(appliedBackground)} className="relative mx-auto h-full max-w-[60%] object-contain p-4 opacity-95 drop-shadow-[0_0_32px_rgba(34,211,238,0.35)]" autoPlay muted loop playsInline />
                  ) : (
                    <img src={nftPreviewUrl(appliedBackground)} alt="" className="relative mx-auto h-full max-w-[60%] object-contain p-4 opacity-95 drop-shadow-[0_0_32px_rgba(34,211,238,0.35)]" />
                  )}
                </div>
              ) : (
                <img src={appliedBackground.previewUrl} alt="" className="h-full w-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-black/45" />
              <div className="absolute bottom-3 right-3 rounded-full border border-cyan-300/35 bg-black/45 px-3 py-1 text-[11px] font-bold text-cyan-100 backdrop-blur-md">
                {appliedBackground.category === "nft" ? `NFT #${appliedBackground.serialNumber ? String(appliedBackground.serialNumber).padStart(4, "0") : "----"} · ${appliedBackground.nftMetadata?.modelName || "Unique"}` : appliedBackground.name}
              </div>
            </>
          ) : profileBannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profileBannerUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background: `linear-gradient(120deg, ${profileNameColor}, var(--accent-pink, #ec4899), var(--accent-secondary, #8b5cf6))`,
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
              {isBlocked || safeProfile.deletedAt ? (
                <div className="grid h-24 w-24 place-items-center rounded-full border-4 border-midnight-950 bg-gradient-to-br from-red-950/80 to-pink-900/50 text-3xl shadow-glow">
                  🐶✕
                </div>
              ) : (
                <GlowAvatar
                  src={profileAvatarUrl}
                  alt={safeProfile.username}
                  size={96}
                  glow={safeProfile.glowEffect ?? undefined}
                  frame={safeProfile.avatarFrame ?? undefined}
                  ringColor={profileNameColor}
                />
              )}
            </div>

            {/* Name + IDs */}
            <div className="flex-1 min-w-0 pb-1 pt-2 md:pt-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="font-display font-bold text-2xl md:text-3xl truncate leading-none"
                  style={{
                    color: profileNameColor,
                    textShadow: safeProfile.glowEffect && !isBlocked ? `0 0 16px ${profileNameColor}88` : undefined,
                  }}
                >
                  {profileDisplayName}
                </h1>
                {/* Badges wrap to next line under the first badge if too many */}
                <div className="inline-flex items-center gap-1.5 flex-wrap max-w-full">
                  {(safeProfile.verified || safeProfile.avatarFrame === "verified") && <VerifiedBadge size={16} showLabel />}
                  {safeProfile.isPremium && <PremiumCrownIcon />}
                  {safeProfile.role && safeProfile.role !== "user" && (
                    <RoleBadge role={safeProfile.role} size={18} showLabel />
                  )}
                </div>
              </div>

              {/* Username + public numeric/custom ID */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <ColoredUsername username={safeProfile.username} color={profileNameColor} className="text-sm" />
                <span className="text-white/25">·</span>
                <span
                  className="font-semibold text-sm text-white/45"
                  title={safeProfile.customId ? "Кастомный ID" : "NightGram ID"}
                >
                  {safeProfile.customId ? `@${safeProfile.customId}` : `#${ngIdDisplay}`}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className={cn("h-2 w-2 rounded-full", safeProfile.isOnline ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]" : "bg-gray-500")} />
                <span className="text-white/45">
                  {safeProfile.isOnline ? "в сети" : safeProfile.lastSeen ? `был(а) ${timeAgo(safeProfile.lastSeen)}` : "офлайн"}
                </span>
              </div>
              {nightStatusActive && !isBlocked && !safeProfile.deletedAt && (
                <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-neon-purple/25 bg-neon-purple/10 px-3 py-1.5 text-xs text-white/75 shadow-glow">
                  <span>{safeProfile.nightStatusEmoji || "🌙"}</span>
                  <span className="truncate">{safeProfile.nightStatusText}</span>
                </div>
              )}
              <p className="text-white/60 text-sm mt-2 max-w-md">{isBlocked ? "Вы добавили этого пользователя в чёрный список." : safeProfile.profileRestricted ? "Пользователь ограничил доступ к профилю настройками приватности." : safeProfile.deletedAt ? "Аккаунт удалён." : safeProfile.bio}</p>
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
                <button onClick={() => doSocial("friend", "Вы подписались", "Подписка отменена")} className={isFriend ? "rounded-xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-2.5 text-sm flex items-center gap-1.5 text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.18)]" : isFollowing ? "btn-ghost px-4 py-2.5 text-sm flex items-center gap-1.5" : "btn-glow px-4 py-2.5 text-sm flex items-center gap-1.5"}>
                  <UserPlus size={15} /> {isFriend ? "Вы друзья" : isFollowing ? "Вы подписаны" : "Подписаться"}
                </button>
                <button
                  onClick={openDirectMessage}
                  className="btn-glow px-4 py-2.5 text-sm flex items-center gap-1.5"
                >
                  <Send size={15} /> Написать
                </button>
                <button onClick={() => doSocial("block", "Пользователь в ЧС", "Пользователь убран из ЧС")} className="btn-ghost px-3 py-2.5 text-sm" title="В ЧС">
                  <Ban size={15} />
                </button>
                <button onClick={reportProfile} className="btn-ghost px-3 py-2.5 text-sm" title="Пожаловаться">
                  <Flag size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-6 mt-4 pt-4 border-t border-white/5 flex-wrap">
            <Stat label="Постов" value={safeProfile.postsCount} />
            <button onClick={() => openPeopleList("followers")} className="text-left"><Stat label="Подписчиков" value={followersCountLocal} /></button>
            <button onClick={() => openPeopleList("following")} className="text-left"><Stat label="Подписок" value={followingCountLocal} /></button>
            <button onClick={() => !socialLists.hidden && setSocialModal("friends")} className="text-left disabled:opacity-40" disabled={Boolean(socialLists.hidden)}>
              <Stat label="Друзей" value={socialLists.hidden ? 0 : socialLists.friends.length} />
            </button>
            <button onClick={() => !socialLists.hidden && setSocialModal("channels")} className="text-left disabled:opacity-40" disabled={Boolean(socialLists.hidden)}>
              <Stat label="Каналов" value={socialLists.hidden ? 0 : socialLists.channels.length} />
            </button>
            {socialLists.hidden && <span className="text-xs text-white/35 self-end pb-1">списки скрыты</span>}
          </div>


          {/* Awards */}
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={13} className="text-neon-gold" />
              <span className="text-xs font-medium text-white/35">Награды</span>
            </div>
            <ProfileAwards isPremium={safeProfile.isPremium} ownedCount={ownedItems.length} postsCount={posts.length} followersCount={followersCountLocal} />
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {socialModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSocialModal(null)} />
            <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <h3 className="font-display font-bold text-lg mb-4">{socialModal === "friends" ? "Друзья" : socialModal === "channels" ? "Подписанные каналы" : socialModal === "followers" ? "Подписчики" : "Подписки"}</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {(socialModal === "friends" ? socialLists.friends : socialModal === "channels" ? socialLists.channels : socialModal === "followers" ? followersList : followingList).length === 0 ? (
                  <p className="text-sm text-white/45 py-8 text-center">Пока пусто</p>
                ) : (socialModal === "friends" ? socialLists.friends : socialModal === "channels" ? socialLists.channels : socialModal === "followers" ? followersList : followingList).map((item, i) => (
                  <button key={String(item.id ?? i)} onClick={() => router.push(socialModal === "channels" ? `/channels/${String(item.handle ?? "")}` : `/profile/${String(item.username ?? "")}`)} className="w-full text-left flex items-center gap-3 rounded-2xl glass px-3 py-2.5 hover:brightness-110 transition">
                    {String(item.avatarUrl ?? item.avatar_url ?? "") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={String(item.avatarUrl ?? item.avatar_url)} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : <div className="h-11 w-11 rounded-full bg-neon-purple/15 grid place-items-center">✦</div>}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{String(item.displayName ?? item.display_name ?? item.name ?? item.username ?? "Без имени")}</div>
                      <div className="text-xs text-white/40 truncate">{socialModal === "channels" ? `@${String(item.handle ?? "")}` : `@${String(item.username ?? "")}`}</div>
                      {socialModal === "channels" ? (
                        <div className="mt-1 text-[11px] text-white/35 truncate">
                          {String(item.description ?? "")} {item.subscribersCount || item.subscribers_count ? `· ${formatCount(Number(item.subscribersCount ?? item.subscribers_count))} подписчиков` : ""}
                        </div>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-white/35">
                          <span>{formatCount(Number(item.followersCount ?? item.followers_count ?? 0))} подписчиков</span>
                          <span>{formatCount(Number(item.followingCount ?? item.following_count ?? 0))} подписок</span>
                          {String(item.role ?? "user") !== "user" && <span className="text-neon-purple">{String(item.role)}</span>}
                          {Boolean(item.isPremium ?? item.is_premium) && <span className="text-neon-gold">Premium</span>}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setSocialModal(null)} className="btn-ghost w-full py-2.5 mt-4 text-sm">Закрыть</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Tabs */}
      <div className="flex gap-2 mt-8 border-b border-white/5">
        <TabButton active={tab === "comments"} onClick={() => setTab("comments")} icon={MessageSquare} label="Стена" />
        <TabButton active={tab === "posts"} onClick={() => setTab("posts")} icon={Grid3x3} label="Посты" />
        <TabButton active={tab === "room"} onClick={() => setTab("room")} icon={Home} label="Комната" />
        <TabButton active={tab === "items"} onClick={() => setTab("items")} icon={ShoppingBag} label="Купленное" />
        <TabButton active={tab === "gifts"} onClick={() => setTab("gifts")} icon={Gift} label="Подарки" />
      </div>

      {isBlocked && !showBlockedContent && (
        <div className="mt-6 rounded-3xl border border-red-500/25 bg-red-500/5 p-6 text-center">
          <div className="text-3xl mb-2">🐶✕</div>
          <div className="font-semibold text-red-200">Пользователь в чёрном списке</div>
          <p className="text-sm text-white/45 mt-1">Посты и комментарии скрыты.</p>
          <button onClick={() => setShowBlockedContent(true)} className="btn-ghost mt-4 px-4 py-2 text-sm">Показать содержимое</button>
        </div>
      )}

      {/* Content */}
      <div className={cn("mt-6", (isBlocked && !showBlockedContent || safeProfile.profileRestricted) && "hidden")}>
        <AnimatePresence mode="wait">
          {tab === "comments" ? (
            <motion.div
              key="wall"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {!isBlocked && !safeProfile.deletedAt && (
                <div className="glass-strong rounded-3xl p-4">
                  <textarea
                    value={wallText}
                    onChange={(e) => setWallText(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder={isMe ? "Напиши что-нибудь на своей стене…" : `Написать ${safeProfile.displayName} на стену…`}
                    className="w-full rounded-2xl glass px-4 py-3 text-sm outline-none resize-none focus:border-neon-purple/40"
                  />
                  {wallMedia.length > 0 && (
                    <div className="mt-3 relative w-28 overflow-hidden rounded-2xl">
                      {wallMedia[0].type === "video" ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video src={wallMedia[0].url} className="h-24 w-28 object-cover" muted playsInline />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={wallMedia[0].url} alt="" className="h-24 w-28 object-cover" />
                      )}
                      <button onClick={() => setWallMedia([])} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white"><X size={11} /></button>
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <input ref={wallFileInput} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => pickWallMedia(e.target.files)} />
                    <button onClick={() => wallFileInput.current?.click()} className="btn-ghost px-3 py-2 text-sm flex items-center gap-2"><ImageIcon size={15} /> Медиа</button>
                    <div className="flex-1" />
                    <button onClick={submitWallPost} disabled={wallPosting || (!wallText.trim() && wallMedia.length === 0)} className="btn-glow px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                      {wallPosting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Отправить
                    </button>
                  </div>
                </div>
              )}

              {wallPosts.length === 0 ? (
                <div className="text-center py-12 text-white/40">
                  <MessageSquare size={32} className="mx-auto mb-3" />
                  <p>На стене пока пусто</p>
                </div>
              ) : wallPosts.map((w, i) => (
                <WallPostCard
                  key={String(w.id ?? i)}
                  post={w}
                  index={i}
                  onPatch={(id, patch) => setWallPosts((prev) => prev
                    .map((item) => String(item.id) === id ? { ...item, ...patch } : item)
                    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(String(b.pinnedAt ?? b.pinned_at ?? 0)).getTime() - new Date(String(a.pinnedAt ?? a.pinned_at ?? 0)).getTime() || new Date(String(b.createdAt ?? b.created_at ?? 0)).getTime() - new Date(String(a.createdAt ?? a.created_at ?? 0)).getTime()))}
                  onDeleted={(id) => setWallPosts((prev) => prev.filter((item) => String(item.id) !== id))}
                />
              ))}
            </motion.div>
          ) : tab === "posts" ? (
            <motion.div
              key="posts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {posts.map((p, i) => (
                <PostCard
                  key={p.id}
                  post={{ ...p, author: { kind: "user", user: safeProfile } }}
                  index={i}
                  enableProfilePin={isMe}
                  onPinned={(id, pinned, pinnedAt) => setPosts((prev) => prev
                    .map((post) => post.id === id ? { ...post, pinnedOnProfile: pinned, pinnedAt: pinnedAt ?? null } : post)
                    .sort((a, b) => Number(Boolean(b.pinnedOnProfile)) - Number(Boolean(a.pinnedOnProfile)) || new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime() || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))}
                  onDeleted={(id) => setPosts((prev) => prev.filter((post) => post.id !== id))}
                />
              ))}
            </motion.div>
          ) : tab === "room" ? (
            <ProfileRoom profile={safeProfile} ownedItems={ownedItems} posts={posts} friendsCount={socialLists.hidden ? 0 : socialLists.friends.length} />
          ) : tab === "gifts" ? (
            <GiftWall gifts={gifts} hidden={Boolean(!isMe && safeProfile.hidePurchases)} />
          ) : (
            <motion.div
              key="items"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {!isMe && safeProfile.hidePurchases ? (
                <div className="rounded-4xl glass-strong p-8 text-center text-white/45">
                  <ShoppingBag size={34} className="mx-auto mb-3 opacity-60" />
                  <div className="font-semibold text-white/70">Покупки скрыты</div>
                  <p className="mt-1 text-sm text-white/40">Пользователь решил не показывать свою коллекцию.</p>
                </div>
              ) : ownedItems.length === 0 ? (
                <div className="text-center py-12 text-white/40">
                  <ShoppingBag size={32} className="mx-auto mb-3" />
                  <p>Пока ничего не куплено</p>
                  {isMe && <button onClick={() => router.push("/store")} className="mt-3 text-neon-purple text-sm hover:underline">Открыть магазин →</button>}
                </div>
              ) : (
                <>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {STORE_PROFILE_CATEGORIES
                      .filter((cat) => cat === "all" || ownedItems.some((item) => item.category === cat))
                      .map((cat) => {
                        const meta = STORE_CATEGORY_META[cat];
                        const count = cat === "all" ? ownedItems.length : ownedItems.filter((item) => item.category === cat).length;
                        const active = itemCategory === cat;
                        return (
                          <button
                            key={cat}
                            onClick={() => setItemCategory(cat)}
                            className={active ? "rounded-2xl bg-neon-purple/20 border border-neon-purple/45 px-3 py-2 text-xs text-white shadow-glow" : "rounded-2xl glass px-3 py-2 text-xs text-white/55 hover:text-white"}
                          >
                            {meta.emoji} {meta.label} <span className="text-white/35">{count}</span>
                          </button>
                        );
                      })}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {ownedItems
                      .filter((item) => itemCategory === "all" || item.category === itemCategory)
                      .map((item, i) => {
                        const meta = STORE_CATEGORY_META[item.category];
                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: Math.min(i * 0.04, 0.22) }}
                            className="gradient-border rounded-3xl glass-strong p-3"
                          >
                            <div className="aspect-square rounded-2xl overflow-hidden mb-2 relative" style={item.category === "nft" && item.nftMetadata?.backgroundCss ? { background: item.nftMetadata.backgroundCss } : undefined}>
                              {item.category === "nft" && isVideoAsset(nftPreviewUrl(item)) ? (
                                <video src={nftPreviewUrl(item)} className={cn("h-full w-full", isUpgradedNftItem(item) ? "object-contain p-3" : "object-cover")} autoPlay muted loop playsInline />
                              ) : (
                                <img src={nftPreviewUrl(item)} alt={item.name} className={cn("h-full w-full", item.category === "nft" && isUpgradedNftItem(item) ? "object-contain p-3 drop-shadow-[0_0_20px_rgba(34,211,238,0.3)]" : "object-cover")} />
                              )}
                              <div className={item.applied ? "absolute top-2 right-2 rounded-full bg-neon-purple/80 px-2 py-0.5 text-[9px] font-bold text-white" : "absolute top-2 right-2 grid place-items-center h-6 w-6 rounded-full bg-green-500/20 border border-green-500/50"}>
                                {item.applied ? "ACTIVE" : <Check size={12} className="text-green-400" />}
                              </div>
                              {item.category === "nft" && <div className="absolute bottom-2 left-2 rounded-full bg-cyan-400/15 border border-cyan-300/35 px-2 py-0.5 text-[10px] font-bold text-cyan-100">{isUpgradedNftItem(item) ? `#${item.serialNumber ? String(item.serialNumber).padStart(4, "0") : "----"}` : "BASE"}</div>}
                            </div>
                            <div className="text-sm font-semibold truncate">{item.name}</div>
                            <div className="text-[11px] text-white/40 capitalize">{meta.emoji} {meta.label}{item.category === "nft" && isUpgradedNftItem(item) ? ` · ${item.nftMetadata?.colorName || "Unique"}` : ""}</div>
                          </motion.div>
                        );
                      })}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}



function WallPostCard({ post, index, onPatch, onDeleted }: { post: Record<string, unknown>; index: number; onPatch: (id: string, patch: Record<string, unknown>) => void; onDeleted: (id: string) => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Record<string, unknown>[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<Record<string, unknown> | null>(null);
  const [sending, setSending] = useState(false);
  const author = (post.author ?? {}) as Record<string, unknown>;
  const media = Array.isArray(post.media) ? post.media as { type: "image" | "video"; url: string }[] : [];
  const id = String(post.id ?? "");
  const liked = Boolean(post.liked);
  const likesCount = Number(post.likesCount ?? post.likes_count ?? 0);
  const commentsCount = Number(post.commentsCount ?? post.comments_count ?? comments.length ?? 0);
  const pinned = Boolean(post.pinned);
  const canManageWallPost = String(author.id ?? "") === user?.id || String(post.authorId ?? post.author_id ?? "") === user?.id || String(post.profileUserId ?? post.profile_user_id ?? "") === user?.id || ["admin", "owner", "co_owner", "moderator"].includes(user?.role ?? "");

  async function loadComments() {
    if (!id) return;
    setLoadingComments(true);
    try {
      const data = await api.getWallComments(id);
      setComments(data as Record<string, unknown>[]);
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }

  async function toggleComments() {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && comments.length === 0) await loadComments();
  }

  async function toggleLike() {
    onPatch(id, { liked: !liked, likesCount: Math.max(0, likesCount + (liked ? -1 : 1)) });
    try {
      const res = await api.toggleWallLike(id);
      onPatch(id, { liked: res.liked, likesCount: res.likesCount });
    } catch {
      onPatch(id, { liked, likesCount });
      pushGlobalToast("Не удалось поставить лайк", "error");
    }
  }

  async function togglePin() {
    const previous = { pinned: Boolean(post.pinned), pinnedAt: post.pinnedAt ?? post.pinned_at ?? null };
    onPatch(id, { pinned: !previous.pinned, pinnedAt: !previous.pinned ? new Date().toISOString() : null });
    try {
      const res = await api.toggleWallPin(id);
      onPatch(id, { pinned: res.pinned, pinnedAt: res.pinnedAt ?? null });
      pushGlobalToast(res.pinned ? "Запись закреплена" : "Запись откреплена", "success");
    } catch (error) {
      onPatch(id, previous);
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось закрепить", "error");
    }
  }

  async function deleteWallPost() {
    try {
      await api.deleteWallPost(id);
      onDeleted(id);
      pushGlobalToast("Запись удалена", "success");
    } catch {
      pushGlobalToast("Не удалось удалить запись", "error");
    }
  }

  function reportWallPost(category: string, reason: string) {
    api.createReport({ targetType: "wall_post", targetId: id, category, reason }).catch(() => {});
    pushGlobalToast("Жалоба отправлена", "success");
  }

  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || !user || !id) return;
    const text = commentText.trim();
    setCommentText("");
    setSending(true);
    try {
      const created = await api.addWallComment(id, text, replyTo ? String(replyTo.id) : null) as Record<string, unknown>;
      setComments((prev) => [...prev, created]);
      onPatch(id, { commentsCount: commentsCount + 1 });
      setReplyTo(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить комментарий";
      pushGlobalToast(message, "error");
      setCommentText(text);
    } finally {
      setSending(false);
    }
  }

  async function toggleCommentLike(commentId: string) {
    const current = comments.find((comment) => String(comment.id) === commentId);
    setComments((prev) => prev.map((comment) => String(comment.id) === commentId
      ? { ...comment, liked: !comment.liked, likesCount: Math.max(0, Number(comment.likesCount ?? comment.likes_count ?? 0) + (comment.liked ? -1 : 1)) }
      : comment));
    try {
      const res = await api.toggleWallCommentLike(commentId);
      setComments((prev) => prev.map((comment) => String(comment.id) === commentId ? { ...comment, liked: res.liked, likesCount: res.likesCount } : comment));
    } catch {
      if (current) setComments((prev) => prev.map((comment) => String(comment.id) === commentId ? current : comment));
      pushGlobalToast("Не удалось поставить лайк", "error");
    }
  }

  async function toggleCommentPin(commentId: string) {
    const current = comments.find((comment) => String(comment.id) === commentId);
    if (!current) return;
    const previous = { pinned: Boolean(current.pinned), pinnedAt: current.pinnedAt ?? current.pinned_at ?? null };
    setComments((prev) => prev
      .map((comment) => String(comment.id) === commentId ? { ...comment, pinned: !previous.pinned, pinnedAt: !previous.pinned ? new Date().toISOString() : null } : comment)
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(String(a.createdAt ?? a.created_at ?? 0)).getTime() - new Date(String(b.createdAt ?? b.created_at ?? 0)).getTime()));
    try {
      const res = await api.toggleWallCommentPin(commentId);
      setComments((prev) => prev
        .map((comment) => String(comment.id) === commentId ? { ...comment, pinned: res.pinned, pinnedAt: res.pinnedAt ?? null } : comment)
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(String(a.createdAt ?? a.created_at ?? 0)).getTime() - new Date(String(b.createdAt ?? b.created_at ?? 0)).getTime()));
    } catch {
      setComments((prev) => prev.map((comment) => String(comment.id) === commentId ? { ...comment, ...previous } : comment));
      pushGlobalToast("Не удалось закрепить комментарий", "error");
    }
  }

  async function deleteComment(commentId: string) {
    try {
      await api.deleteWallComment(commentId);
      setComments((prev) => prev.filter((comment) => String(comment.id) !== commentId && String(comment.parentId ?? comment.parent_id ?? "") !== commentId));
      onPatch(id, { commentsCount: Math.max(0, commentsCount - 1) });
    } catch {
      pushGlobalToast("Не удалось удалить комментарий", "error");
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.25) }} className="glass-strong rounded-3xl p-4">
      <div className="mb-3 flex items-center gap-3">
        <GlowAvatar src={(author.avatarUrl as string) ?? (author.avatar_url as string) ?? null} alt={String(author.username ?? "user")} size={34} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate" style={{ color: String(author.nameColor ?? author.name_color ?? "#fff") }}>{String(author.displayName ?? author.display_name ?? author.username ?? "Пользователь")}</div>
          <div className="text-[11px] text-white/35">@{String(author.username ?? "")} · {timeAgo(String(post.createdAt ?? post.created_at ?? new Date().toISOString()))}</div>
        </div>
        <PostMenu
          itemType="запись"
          isOwner={canManageWallPost}
          isAdmin={["admin", "owner", "co_owner", "moderator"].includes(user?.role ?? "")}
          onPin={canManageWallPost ? togglePin : undefined}
          pinned={pinned}
          onDelete={canManageWallPost ? deleteWallPost : undefined}
          onReport={reportWallPost}
        />
      </div>
      {pinned && <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-neon-purple/25 bg-neon-purple/10 px-2.5 py-1 text-[11px] font-semibold text-neon-purple">Закреплено</div>}
      {Boolean(post.text) && <p className="text-sm text-white/80 whitespace-pre-wrap break-words">{String(post.text)}</p>}
      {media.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{media.map((m) => m.type === "video" ? <video key={m.url} src={m.url} className="max-h-72 rounded-2xl object-cover" controls /> : <img key={m.url} src={m.url} alt="" className="max-h-72 rounded-2xl object-cover" />)}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/45">
        <button onClick={toggleLike} className={cn("flex items-center gap-1 rounded-xl glass px-3 py-1.5 hover:text-white", liked && "text-pink-300")}><Heart size={13} className={liked ? "fill-current" : ""} /> {likesCount || ""}</button>
        <button onClick={toggleComments} className="flex items-center gap-1 rounded-xl glass px-3 py-1.5 hover:text-white"><MessageSquare size={13} /> {commentsCount || "Комментировать"}</button>
      </div>

      <AnimatePresence>
        {commentsOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden border-t border-white/5 pt-3">
            {loadingComments ? <div className="py-5 text-center text-white/35"><Loader2 size={17} className="mx-auto animate-spin" /></div> : comments.length === 0 ? <div className="py-4 text-center text-xs text-white/35">Комментариев пока нет</div> : (
              <div className="space-y-2">
                {comments.map((comment) => {
                  const cAuthor = (comment.author ?? {}) as Record<string, unknown>;
                  const parentId = String(comment.parentId ?? comment.parent_id ?? "");
                  const parent = parentId ? comments.find((entry) => String(entry.id) === parentId) : null;
                  const cLiked = Boolean(comment.liked);
                  const cPinned = Boolean(comment.pinned);
                  const cLikes = Number(comment.likesCount ?? comment.likes_count ?? 0);
                  const canDelete = String(cAuthor.id ?? "") === user?.id || ["admin", "owner", "co_owner", "moderator"].includes(user?.role ?? "");
                  const canPinComment = canDelete || canManageWallPost;
                  return (
                    <div key={String(comment.id)} className={cn("flex gap-2.5", parentId && "ml-8")}> 
                      <GlowAvatar src={(cAuthor.avatarUrl as string) ?? (cAuthor.avatar_url as string) ?? null} alt={String(cAuthor.username ?? "user")} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="rounded-2xl glass px-3 py-2">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <div className="text-xs font-semibold" style={{ color: String(cAuthor.nameColor ?? cAuthor.name_color ?? "#fff") }}>{String(cAuthor.displayName ?? cAuthor.display_name ?? cAuthor.username ?? "Пользователь")}</div>
                                {cPinned && <span className="rounded-full bg-neon-purple/15 px-1.5 py-0.5 text-[9px] font-bold text-neon-purple">PIN</span>}
                              </div>
                              {parent && <div className="mb-1 text-[11px] text-neon-purple/80">↳ ответ @{String(((parent.author ?? {}) as Record<string, unknown>).username ?? "user")}</div>}
                              <div className="text-sm text-white/82 break-words">{String(comment.text ?? "")}</div>
                            </div>
                            <PostMenu
                              itemType="комментарий"
                              isOwner={canDelete}
                              isAdmin={["admin", "owner", "co_owner", "moderator"].includes(user?.role ?? "")}
                              onPin={canPinComment ? () => toggleCommentPin(String(comment.id)) : undefined}
                              pinned={cPinned}
                              onDelete={canDelete ? () => deleteComment(String(comment.id)) : undefined}
                              onReport={(category, reason) => {
                                api.createReport({ targetType: "wall_comment", targetId: String(comment.id), category, reason }).catch(() => {});
                                pushGlobalToast("Жалоба отправлена", "success");
                              }}
                            />
                          </div>
                        </div>
                        <div className="mt-1 ml-1 flex items-center gap-3 text-[11px] text-white/38">
                          <span>{timeAgo(String(comment.createdAt ?? comment.created_at ?? new Date().toISOString()))}</span>
                          <button onClick={() => toggleCommentLike(String(comment.id))} className={cn("flex items-center gap-1 hover:text-white", cLiked && "text-pink-300")}><Heart size={11} className={cLiked ? "fill-current" : ""} /> {cLikes || ""}</button>
                          <button onClick={() => { setReplyTo(comment); setCommentText(``); }} className="hover:text-white">Ответить</button>

                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {replyTo && <div className="mt-3 flex items-center gap-2 rounded-2xl glass px-3 py-2 text-xs text-white/55"><span className="text-neon-purple">Ответ @{String(((replyTo.author ?? {}) as Record<string, unknown>).username ?? "user")}</span><span className="min-w-0 flex-1 truncate">{String(replyTo.text ?? "")}</span><button onClick={() => setReplyTo(null)}>×</button></div>}
            <form onSubmit={sendComment} className="mt-3 flex items-center gap-2">
              <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder={replyTo ? "Ответить на комментарий…" : "Написать комментарий…"} className="flex-1 rounded-full glass px-4 py-2.5 text-sm outline-none focus:border-neon-purple/40" />
              <button disabled={sending || !commentText.trim()} className="grid h-10 w-10 place-items-center rounded-full btn-glow disabled:opacity-45">{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function GiftWall({ gifts, hidden }: { gifts: Record<string, unknown>[]; hidden: boolean }) {
  if (hidden) {
    return (
      <motion.div key="gifts-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-4xl glass-strong p-8 text-center text-white/45">
        <Gift size={34} className="mx-auto mb-3 opacity-60" />
        <div className="font-semibold text-white/70">Подарки скрыты</div>
        <p className="mt-1 text-sm text-white/40">Пользователь решил не показывать коллекцию и подарки.</p>
      </motion.div>
    );
  }
  if (gifts.length === 0) {
    return (
      <motion.div key="gifts-empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-center py-12 text-white/40">
        <Gift size={34} className="mx-auto mb-3" />
        <p>Подарков пока нет</p>
      </motion.div>
    );
  }
  return (
    <motion.div key="gifts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid gap-4 md:grid-cols-2">
      {gifts.map((gift, index) => {
        const sender = (gift.sender ?? {}) as Record<string, unknown>;
        const item = (gift.item ?? {}) as Record<string, unknown>;
        const previewUrl = String(item.previewUrl ?? item.preview_url ?? "");
        const title = String(gift.title ?? item.name ?? "Подарок NightGram");
        const message = String(gift.message ?? "");
        return (
          <motion.div key={String(gift.id ?? index)} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(index * 0.04, 0.24) }} className="relative overflow-hidden rounded-4xl glass-strong p-4">
            <div className="absolute inset-0 opacity-55" style={{ background: "radial-gradient(circle at 18% 18%, rgba(251,191,36,0.16), transparent 38%), radial-gradient(circle at 88% 78%, rgba(168,85,247,0.18), transparent 42%)" }} />
            <div className="relative flex gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-3xl bg-white/5 shadow-glow">
                {previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-cover" /> : <Gift size={26} className="text-neon-gold" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] text-white/35"><Gift size={12} className="text-neon-gold" /> подарок</div>
                <div className="mt-1 truncate font-semibold text-white/85">{title}</div>
                <div className="mt-1 text-xs text-white/45">от @{String(sender.username ?? "user")}</div>
                {message && <div className="mt-2 rounded-2xl bg-black/20 px-3 py-2 text-xs text-white/65">“{message}”</div>}
                <div className="mt-2 text-[10px] text-white/30">{timeAgo(String(gift.createdAt ?? gift.created_at ?? new Date().toISOString()))}</div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function ProfileRoom({ profile, ownedItems, posts, friendsCount }: { profile: User; ownedItems: StoreItem[]; posts: Post[]; friendsCount: number }) {
  const featured = ownedItems.slice(0, 6);
  const mood = profile.nightStatusText ? `${profile.nightStatusEmoji || "🌙"} ${profile.nightStatusText}` : profile.isPremium ? "✨ Premium mood" : "🌙 Night mood";
  const manualMusic = profile.musicArtist && profile.musicTrack ? `${profile.musicArtist} — ${profile.musicTrack}` : null;
  const sceneMap: Record<string, { label: string; emoji: string; bg: string }> = {
    midnight: { label: "Midnight Desk", emoji: "🌙", bg: `radial-gradient(circle at 20% 20%, ${profile.nameColor || "#a855f7"}55, transparent 38%), radial-gradient(circle at 86% 74%, rgba(99,102,241,0.28), transparent 42%)` },
    cyber: { label: "Cyber Room", emoji: "👾", bg: "radial-gradient(circle at 18% 20%, rgba(0,245,212,0.30), transparent 38%), radial-gradient(circle at 84% 74%, rgba(217,70,239,0.24), transparent 42%)" },
    gold: { label: "Gold Lounge", emoji: "✨", bg: "radial-gradient(circle at 18% 20%, rgba(251,191,36,0.30), transparent 38%), radial-gradient(circle at 84% 74%, rgba(249,115,22,0.22), transparent 42%)" },
    rain: { label: "Rain Window", emoji: "🌧️", bg: "radial-gradient(circle at 18% 20%, rgba(56,189,248,0.25), transparent 38%), radial-gradient(circle at 84% 74%, rgba(30,41,59,0.36), transparent 42%)" },
    void: { label: "Void Gallery", emoji: "🕳️", bg: "radial-gradient(circle at 18% 20%, rgba(17,24,39,0.62), transparent 38%), radial-gradient(circle at 84% 74%, rgba(168,85,247,0.25), transparent 42%)" },
  };
  const scene = sceneMap[profile.roomScene || "midnight"] || sceneMap.midnight;
  const sceneGradient = scene.bg;
  return (
    <motion.div
      key="room"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-4"
    >
      <div className="relative overflow-hidden rounded-4xl glass-strong p-5 md:p-6">
        <div className="absolute inset-0 opacity-80" style={{ background: sceneGradient }} />
        <motion.div
          className="absolute right-8 top-8 h-28 w-28 rounded-full blur-3xl"
          style={{ background: profile.nameColor || "#a855f7" }}
          animate={{ opacity: [0.18, 0.42, 0.18], scale: [1, 1.16, 1] }}
          transition={{ duration: 5, repeat: Infinity }}
        />
        <div className="relative grid gap-5 md:grid-cols-[1fr_260px]">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-white/40">
              <Home size={14} /> Profile Room
            </div>
            <h2 className="font-display text-2xl font-bold" style={{ color: profile.nameColor || "#fff", textShadow: `0 0 16px ${(profile.nameColor || "#a855f7")}66` }}>
              Комната @{profile.username}
            </h2>
            <p className="mt-2 max-w-lg text-sm text-white/60">Личная витрина настроения, ауры, коллекции и активности. Это не просто профиль — это ночное пространство пользователя.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl glass px-3 py-3">
                <div className="text-[10px] text-white/35">Сцена</div>
                <div className="truncate text-sm font-semibold text-white/80">{scene.emoji} {scene.label}</div>
              </div>
              <div className="rounded-2xl glass px-3 py-3">
                <div className="text-[10px] text-white/35">Активность</div>
                <div className="text-sm font-semibold text-white/80">{posts.length} постов</div>
              </div>
              <div className="rounded-2xl glass px-3 py-3">
                <div className="text-[10px] text-white/35">Связи</div>
                <div className="text-sm font-semibold text-white/80">{friendsCount} друзей</div>
              </div>
            </div>
          </div>
          <div className="rounded-3xl glass p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/75"><Music2 size={15} className="text-neon-purple" /> Sound Mood</div>
            <div className="rounded-2xl bg-black/25 p-3">
              <div className="text-xs text-white/35">Сейчас играет</div>
              <div className="mt-1 truncate text-sm font-semibold text-white/80">{manualMusic || (profile.nightStatusText?.includes("музык") || profile.nightStatusText?.includes("слуш") ? profile.nightStatusText : "NightGram Ambient · Violet Pulse")}</div>
              <div className="mt-3 flex h-10 items-end gap-1">
                {Array.from({ length: 24 }).map((_, i) => (
                  <motion.span
                    key={i}
                    className="w-full rounded-full bg-neon-purple/70"
                    animate={{ height: [`${20 + (i % 5) * 9}%`, `${38 + (i % 7) * 7}%`, `${20 + (i % 5) * 9}%`] }}
                    transition={{ duration: 0.9 + (i % 4) * 0.12, repeat: Infinity }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-4xl glass-strong p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold text-sm">Витрина коллекции</div>
            <span className="text-[11px] text-white/35">{ownedItems.length} предметов</span>
          </div>
          {featured.length === 0 ? (
            <div className="rounded-3xl glass p-8 text-center text-sm text-white/40">Коллекция пока пустая</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {featured.map((item) => (
                <div key={item.id} className="group relative overflow-hidden rounded-2xl bg-white/5" style={item.category === "nft" && item.nftMetadata?.backgroundCss ? { background: item.nftMetadata.backgroundCss } : undefined}>
                  {item.category === "nft" && isVideoAsset(nftPreviewUrl(item)) ? (
                    <video src={nftPreviewUrl(item)} className={cn("aspect-square h-full w-full transition group-hover:scale-110", isUpgradedNftItem(item) ? "object-contain p-2" : "object-cover")} autoPlay muted loop playsInline />
                  ) : (
                    <img src={nftPreviewUrl(item)} alt={item.name} className={cn("aspect-square h-full w-full transition group-hover:scale-110", item.category === "nft" && isUpgradedNftItem(item) ? "object-contain p-2" : "object-cover")} />
                  )}
                  {item.applied && <span className="absolute right-1 top-1 rounded-full bg-neon-purple/80 px-1.5 py-0.5 text-[9px] font-bold text-white">ACTIVE</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-4xl glass-strong p-5">
          <div className="mb-3 font-semibold text-sm">Закреплённые моменты</div>
          {posts.length === 0 ? (
            <div className="rounded-3xl glass p-8 text-center text-sm text-white/40">Постов пока нет</div>
          ) : (
            <div className="space-y-2">
              {posts.slice(0, 3).map((post) => (
                <div key={post.id} className="rounded-2xl glass px-3 py-2">
                  <div className="line-clamp-2 text-sm text-white/75">{post.text || "Медиа-пост"}</div>
                  <div className="mt-1 text-[11px] text-white/35">{timeAgo(post.createdAt)} · {formatCount(post.likesCount)} лайков</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
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
    desc: "Premium-подписка. Темы, рамки, glow-эффекты и 2× NightCoins.",
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
    desc: "За покупку первого товара в магазине.",
    color: "#a855f7",
  },
  {
    icon: Award,
    label: "Коллекционер",
    desc: "За владение 3+ товарами из магазина одновременно.",
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

function ProfileAwards({ isPremium, ownedCount, postsCount, followersCount }: { isPremium: boolean; ownedCount: number; postsCount: number; followersCount: number }) {
  const unlocked = new Set<string>();
  if (isPremium) unlocked.add("Premium");
  unlocked.add("Первые шаги");
  if (ownedCount >= 1) unlocked.add("Звезда");
  if (ownedCount >= 3) unlocked.add("Коллекционер");
  if (postsCount >= 5) unlocked.add("Активист");
  if (followersCount >= 100 || ownedCount >= 8) unlocked.add("Легенда");

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
