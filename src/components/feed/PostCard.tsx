"use client";

// =============================================================================
//  Feed — PostCard
//  Glassmorphism post card: author, media, text, reactions, comments,
//  views, save, share. Original NightGram layout (not an Instagram clone).
// =============================================================================

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Eye,
  MoreHorizontal,
  Play,
  BadgeCheck,
} from "lucide-react";
import type { Post } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { ColoredUsername } from "@/components/shared/Badges";
import { cn, formatCount, timeAgo } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { CommentSheet } from "./CommentSheet";

const QUICK_REACTIONS = ["🔥", "❤️", "😮", "✨", "💜"];

export function PostCard({ post, index = 0 }: { post: Post; index?: number }) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.liked);
  const [saved, setSaved] = useState(post.saved);
  const [likes, setLikes] = useState(post.likesCount);
  const [showReactions, setShowReactions] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [onCommentOpen, setOnCommentOpen] = useState(false);

  function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    api.toggleLike(post.id).catch(() => {});
  }

  function toggleSave() {
    const next = !saved;
    setSaved(next);
    api.toggleSave(post.id).catch(() => {});
  }

  function react(emoji: string) {
    setReaction((prev) => (prev === emoji ? null : emoji));
    setShowReactions(false);
  }

  const authorUser = post.author.kind === "user" ? post.author.user : null;
  const authorChannel = post.author.kind === "channel" ? post.author.channel : null;
  const displayName = authorUser?.displayName ?? authorChannel?.name ?? "";
  const username = authorUser?.username ?? authorChannel?.handle ?? "";
  const avatar = authorUser?.avatarUrl ?? authorChannel?.avatarUrl ?? null;
  const glow = authorUser?.glowEffect ?? undefined;
  const frame = authorUser?.avatarFrame ?? authorChannel?.verified ? "channel" : undefined;
  const color = authorUser?.nameColor ?? "#a855f7";
  const verified = authorChannel?.verified || authorUser?.isPremium;

  return (
    <motion.article
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.06, 0.3), ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      className="gradient-border rounded-4xl glass-strong overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() => router.push(`/profile/${username}`)}
          className="shrink-0 transition hover:scale-105"
          title={displayName}
        >
          <GlowAvatar src={avatar} alt={displayName} size={46} glow={glow} frame={frame} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => router.push(`/profile/${username}`)}
              className="font-semibold truncate hover:underline"
              style={{ color }}
            >
              {displayName}
            </button>
            {verified && <BadgeCheck size={15} className="text-neon-purple shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/45">
            <button onClick={() => router.push(`/profile/${username}`)} className="hover:opacity-80 transition">
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
        <button className="ml-auto grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition">
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Text — with "show more" for long posts */}
      {post.text && <PostText text={post.text} />}

      {/* Media */}
      {post.media && post.media.length > 0 && (
        <div className="relative px-4">
          <div className={cn("relative overflow-hidden rounded-3xl", post.media.length > 1 ? "grid grid-cols-2 gap-1" : "")}>
            {post.media.map((m) => (
              <div key={m.id} className="relative group">
                {m.type === "video" ? (
                  <VideoMedia src={m.url} poster={m.thumbnailUrl} />
                ) : (
                  <motion.div whileHover={{ scale: 1.03 }} transition={{ type: "spring", stiffness: 200, damping: 18 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.url}
                      alt=""
                      loading="lazy"
                      className="w-full max-h-[640px] object-cover rounded-3xl"
                    />
                  </motion.div>
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
              className="absolute bottom-12 left-0 z-20 flex gap-1 rounded-full glass-strong px-2 py-1.5 shadow-glow"
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
        <ActionButton icon={<Send size={20} />} label={formatCount(post.sharesCount)} />

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/45">
            <Eye size={15} /> {formatCount(post.viewsCount)}
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

      <AnimatePresence initial={false}>
        {onCommentOpen && (
          <CommentSheet postId={post.id} onClose={() => setOnCommentOpen(false)} />
        )}
      </AnimatePresence>
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
      onClick={onClick}
      onDoubleClick={onLongPress}
      className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm transition hover:bg-white/5"
      style={{ color: active ? activeColor : undefined }}
    >
      {icon}
      {label && <span className="text-white/70">{label}</span>}
    </motion.button>
  );
}

function VideoMedia({ src, poster }: { src: string; poster?: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-video w-full">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={src}
        poster={poster}
        controls={playing}
        playsInline
        className="h-full w-full rounded-3xl object-cover"
        onPlay={() => setPlaying(true)}
      />
      {!playing && (
        <button
          onClick={(e) => {
            const v = (e.currentTarget.previousElementSibling as HTMLVideoElement);
            v?.play();
          }}
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
