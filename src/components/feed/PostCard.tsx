"use client";

// =============================================================================
//  Feed — PostCard
//  Glassmorphism post card: author, media, text, reactions, comments,
//  views, save, share. Original NightGram layout (not an Instagram clone).
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Eye,
  Play,
} from "lucide-react";
import type { Post } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { ColoredUsername } from "@/components/shared/Badges";
import { cn, formatCount, timeAgo } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { CommentSheet } from "./CommentSheet";
import { RoleBadge, PremiumBadge, VerifiedBadge } from "@/components/shared/RoleBadge";
import { PostMenu } from "./PostMenu";
import { MediaViewer, type MediaViewerItem } from "@/components/shared/MediaViewer";
import { pushGlobalToast } from "@/lib/toast";
import { removeSavedItem, saveItem } from "@/lib/saved";

const QUICK_REACTIONS = ["🔥", "❤️", "😂", "😮", "😢", "👏", "💜", "✨", "👍", "💯", "🤯", "😍"];

export function PostCard({
  post,
  index = 0,
  onDeleted,
  enableProfilePin = false,
  onPinned,
}: {
  post: Post;
  index?: number;
  onDeleted?: (postId: string) => void;
  enableProfilePin?: boolean;
  onPinned?: (postId: string, pinned: boolean, pinnedAt?: string | null) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.liked);
  const [saved, setSaved] = useState(post.saved);
  const [pinnedOnProfile, setPinnedOnProfile] = useState(Boolean(post.pinnedOnProfile));
  const [likes, setLikes] = useState(post.likesCount);
  const [views, setViews] = useState(post.viewsCount);
  const [showReactions, setShowReactions] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [onCommentOpen, setOnCommentOpen] = useState(false);
  const [heartBurst, setHeartBurst] = useState(0);
  const [deleted, setDeleted] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const articleRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    const node = articleRef.current;
    if (!node || viewedRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || viewedRef.current) return;
        viewedRef.current = true;
        setViews((v) => v + 1);
        api.viewPost(post.id).catch(() => {});
        observer.disconnect();
      },
      { threshold: 0.55 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [post.id]);

  function showToast(message: string, kind: "default" | "success" | "error" | "info" = "default") {
    pushGlobalToast(message, kind);
  }

  function toggleLike(withToast = true) {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    if (withToast) showToast(next ? "Лайк поставлен" : "Лайк убран");
    api.toggleLike(post.id).catch(() => {});
  }

  function likeFromDoubleTap() {
    setHeartBurst((v) => v + 1);
    if (!liked) {
      setLiked(true);
      setLikes((n) => n + 1);
      showToast("Лайк поставлен");
      api.toggleLike(post.id).catch(() => {});
    }
  }

  function toggleSave() {
    const next = !saved;
    setSaved(next);
    if (next) {
      const firstMedia = post.media?.[0];
      saveItem({
        id: `post:${post.id}`,
        type: firstMedia ? "media" : "post",
        title: "Сохранённый пост",
        text: post.text ?? undefined,
        mediaUrl: firstMedia?.url,
        mediaType: firstMedia?.type,
        source: username,
        createdAt: new Date().toISOString(),
      });
    } else {
      removeSavedItem(`post:${post.id}`);
    }
    showToast(next ? "Пост сохранён в Избранное" : "Пост убран из Избранного");
    api.toggleSave(post.id).catch(() => {});
  }

  function react(emoji: string) {
    setReaction((prev) => (prev === emoji ? null : emoji));
    setShowReactions(false);
  }

  async function sharePost() {
    const url = `${window.location.origin}/feed?post=${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "NightGram", text: post.text ?? "Пост NightGram", url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      showToast("Ссылка скопирована");
    } catch {
      // User cancelled native share — no noisy error.
    }
  }


  async function toggleProfilePin() {
    const previous = pinnedOnProfile;
    setPinnedOnProfile(!previous);
    try {
      const res = await api.toggleProfilePostPin(post.id);
      setPinnedOnProfile(res.pinned);
      onPinned?.(post.id, res.pinned, res.pinnedAt ?? null);
      showToast(res.pinned ? "Пост закреплён в профиле" : "Пост откреплён", "success");
    } catch (error) {
      setPinnedOnProfile(previous);
      const message = error instanceof Error ? error.message : "Не удалось закрепить пост";
      showToast(message, "error");
    }
  }

  async function deletePost() {
    try {
      await api.deletePost(post.id);
      showToast("Пост удалён", "success");
      window.setTimeout(() => {
        setDeleted(true);
        onDeleted?.(post.id);
      }, 650);
    } catch {
      showToast("Не удалось удалить пост", "error");
    }
  }

  function handleDoubleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("button,a,input,textarea,video")) return;
    likeFromDoubleTap();
  }

  const authorUser = post.author.kind === "user" ? post.author.user : null;
  const authorChannel = post.author.kind === "channel" ? post.author.channel : null;
  const displayName = authorUser?.displayName ?? authorChannel?.name ?? "";
  const username = authorUser?.username ?? authorChannel?.handle ?? "";
  const avatar = authorUser?.avatarUrl ?? authorChannel?.avatarUrl ?? null;
  // В ленте каналы должны выглядеть как нейтральный белый профиль: без цветных boost-frame/glow.
  // Само оформление канала остаётся на странице канала и в настройках оформления.
  const glow = authorUser?.glowEffect ?? undefined;
  const frame = authorUser?.avatarFrame ?? undefined;
  const color = authorUser?.nameColor ?? (authorChannel ? "#ffffff" : "#a855f7");
  const authorHref = post.author.kind === "channel" ? `/channels/${username}` : `/profile/${username}`;
  const verified = authorChannel?.verified || authorUser?.isPremium;
  const canDeletePost = post.author.kind === "user"
    ? authorUser?.id === user?.id
    : authorChannel?.ownerId === user?.id || ["owner", "co_owner", "admin", "editor", "moderator"].includes(authorChannel?.myRole ?? "");

  const mediaItems: MediaViewerItem[] = (post.media ?? []).map((m, i) => ({
    id: m.id || `${post.id}-${i}`,
    type: m.type,
    url: m.url,
    thumbnailUrl: m.thumbnailUrl,
  }));

  if (deleted) return null;

  return (
    <motion.article
      ref={articleRef}
      onDoubleClick={handleDoubleClick}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.06, 0.3), ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      className="gradient-border rounded-4xl glass-strong overflow-visible"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() => router.push(authorHref)}
          className="shrink-0 transition hover:scale-105"
          title={displayName}
        >
          <GlowAvatar src={avatar} alt={displayName} size={46} glow={glow} frame={frame} ringColor={color} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => router.push(authorHref)}
              className="font-semibold truncate hover:underline"
              style={{ color }}
            >
              {displayName}
            </button>
            {(authorUser?.verified || authorUser?.avatarFrame === "verified") && <VerifiedBadge size={16} />}
            {authorUser?.isPremium && (
              <PremiumBadge size={16} />
            )}
            {authorUser?.role && authorUser.role !== "user" && (
              <RoleBadge role={authorUser.role} size={16} />
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/45">
            <button onClick={() => router.push(authorHref)} className="hover:opacity-80 transition">
              <ColoredUsername username={username} color={color} glow={false} />
            </button>
            <span>·</span>
            <span>{timeAgo(post.createdAt)}</span>
            {post.author.kind === "channel" && (
              <span className="ml-1 rounded-md bg-neon-purple/15 px-1.5 py-0.5 text-[10px] text-neon-purple">
                канал
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto">
          <PostMenu
            itemType="пост"
            isOwner={Boolean(canDeletePost)}
            isAdmin={["admin", "owner", "co_owner", "moderator"].includes(user?.role ?? "")}
            onDelete={deletePost}
            onPin={enableProfilePin && post.author.kind === "user" ? toggleProfilePin : undefined}
            pinned={pinnedOnProfile}
            onReport={(category, reason) => {
              api.createReport({ targetType: "post", targetId: post.id, category, reason }).catch(() => {});
              showToast("Жалоба отправлена", "success");
            }}
          />
        </div>
      </div>

      {pinnedOnProfile && enableProfilePin && (
        <div className="mx-4 mb-2 inline-flex w-max items-center gap-1 rounded-full border border-neon-purple/25 bg-neon-purple/10 px-2.5 py-1 text-[11px] font-semibold text-neon-purple">
          Закреплено в профиле
        </div>
      )}

      {/* Text — with "show more" for long posts */}
      {post.text && <PostText text={post.text} />}

      {/* Media */}
      {post.media && post.media.length > 0 && (
        <div className="relative px-4">
          <div className={cn("relative overflow-hidden rounded-3xl", post.media.length > 1 ? "grid grid-cols-2 gap-1" : "")}>
            {post.media.map((m) => (
              <div key={m.id} className="relative group">
                {m.type === "video" ? (
                  <VideoMedia src={m.url} poster={m.thumbnailUrl} onOpen={() => { setViewerIndex(post.media.findIndex((x) => x.id === m.id)); setViewerOpen(true); }} />
                ) : (
                  <motion.button
                    type="button"
                    onClick={() => {
                      setViewerIndex(post.media.findIndex((x) => x.id === m.id));
                      setViewerOpen(true);
                    }}
                    whileHover={{ scale: 1.03 }}
                    transition={{ type: "spring", stiffness: 200, damping: 18 }}
                    className="block w-full text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt=""
                      loading="lazy"
                      className="w-full max-h-[640px] object-cover rounded-3xl"
                    />
                  </motion.button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {post.tags.map((t) => (
            <span key={t} className="text-xs text-neon-purple/90 hover:text-neon-purple cursor-pointer">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 py-3">
        <div className="relative">
          <ActionButton
            active={liked}
            activeColor="#ec4899"
            onClick={toggleLike}
            onLongPress={() => setShowReactions((v) => !v)}
            icon={<Heart size={20} className={liked ? "fill-current" : ""} />}
            label={formatCount(likes)}
          />
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute bottom-12 left-0 z-20 flex max-w-[260px] flex-wrap gap-1 rounded-3xl glass-strong px-2 py-1.5 shadow-glow"
            >
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => react(e)}
                  className={cn("text-xl transition hover:scale-125", reaction === e && "scale-125")}
                >
                  {e}
                </button>
              ))}
            </motion.div>
          )}
          {reaction && (
            <span className="absolute -top-2 left-7 text-base">{reaction}</span>
          )}
        </div>

        <ActionButton
          icon={<MessageCircle size={20} />}
          label={formatCount(post.commentsCount)}
          onClick={() => setOnCommentOpen((v) => !v)}
        />
        <ActionButton icon={<Send size={20} />} label={formatCount(post.sharesCount)} onClick={sharePost} />

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/45">
            <Eye size={15} /> {formatCount(views)}
          </span>
          <button
            onClick={toggleSave}
            className={cn(
              "grid place-items-center h-9 w-9 rounded-xl transition",
              saved ? "text-neon-purple bg-neon-purple/10" : "text-white/55 hover:text-white",
            )}
          >
            <Bookmark size={20} className={saved ? "fill-current" : ""} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {heartBurst > 0 && (
          <motion.div
            key={heartBurst}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.35, 1.8], y: [10, -10, -30] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
          >
            <Heart size={86} className="fill-pink-500 text-pink-500 drop-shadow-[0_0_24px_rgba(236,72,153,0.9)]" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {onCommentOpen && (
          <CommentSheet postId={post.id} onClose={() => setOnCommentOpen(false)} />
        )}
      </AnimatePresence>

      <MediaViewer
        items={mediaItems}
        initialIndex={Math.max(0, viewerIndex)}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </motion.article>
  );
}

function ActionButton({
  icon,
  label,
  active,
  activeColor = "#a855f7",
  onClick,
  onLongPress,
}: {
  icon: React.ReactNode;
  label?: string;
  active?: boolean;
  activeColor?: string;
  onClick?: () => void;
  onLongPress?: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onLongPress?.();
      }}
      className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm transition hover:bg-white/5"
      style={{ color: active ? activeColor : undefined }}
    >
      {icon}
      {label && <span className="text-white/70">{label}</span>}
    </motion.button>
  );
}

function VideoMedia({ src, poster, onOpen }: { src: string; poster?: string; onOpen?: () => void }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-video w-full">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={src}
        poster={poster}
        controls={playing}
        playsInline
        className="h-full w-full rounded-3xl object-cover cursor-zoom-in"
        onPlay={() => setPlaying(true)}
        onDoubleClick={(e) => { e.stopPropagation(); onOpen?.(); }}
      />
      {!playing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const v = (e.currentTarget.previousElementSibling as HTMLVideoElement);
            v?.play();
          }}
          onDoubleClick={(e) => { e.stopPropagation(); onOpen?.(); }}
          className="absolute inset-0 grid place-items-center rounded-3xl bg-black/30"
        >
          <span className="grid place-items-center h-14 w-14 rounded-full btn-glow">
            <Play size={24} className="fill-white ml-1" />
          </span>
        </button>
      )}
    </div>
  );
}

// ---- PostText — collapsible long text (show more / show less) ----
const TEXT_COLLAPSE_THRESHOLD = 200; // chars

function PostText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > TEXT_COLLAPSE_THRESHOLD;
  const displayText = !expanded && isLong ? text.slice(0, TEXT_COLLAPSE_THRESHOLD).trimEnd() + "\u2026" : text;

  return (
    <div className="px-4 pb-3">
      <p className="text-[15px] text-white/85 leading-relaxed whitespace-pre-wrap break-words">
        {displayText}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs text-neon-purple hover:underline flex items-center gap-1 transition"
        >
          {expanded ? "\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u2191" : "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0431\u043e\u043b\u044c\u0448\u0435 \u2193"}
        </button>
      )}
    </div>
  );
}
