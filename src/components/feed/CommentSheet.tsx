"use client";

// =============================================================================
//  Feed — CommentSheet (expandable inline comments)
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Send, Loader2, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Comment } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { cn, timeAgo } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { uid } from "@/lib/utils";
import { RoleBadge, PremiumBadge } from "@/components/shared/RoleBadge";
import { PostMenu } from "./PostMenu";
import { pushGlobalToast } from "@/lib/toast";

export function CommentSheet({ postId, onClose, canModerate = false, commentsEnabled = true }: { postId: string; onClose: () => void; canModerate?: boolean; commentsEnabled?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getComments(postId).catch(() => []).then((data) => {
      if (active) {
        setComments(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [postId]);

  function showToast(message: string, kind: "default" | "success" | "error" = "default") {
    pushGlobalToast(message, kind);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const body = text.trim();
    setText("");
    setSending(true);

    // Optimistic insert
    const optimistic: Comment = {
      id: uid("c"),
      postId,
      parentId: replyTo?.id ?? null,
      author: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        nameColor: user.nameColor,
      },
      text: body,
      likesCount: 0,
      liked: false,
      createdAt: new Date().toISOString(),
    };
    setComments((c) => [...c, optimistic]);
    setReplyTo(null);

    try {
      const real = await api.addComment(postId, body, optimistic.parentId);
      setComments((c) => c.map((x) => (x.id === optimistic.id ? real : x)));
    } catch (error) {
      setComments((current) => current.filter((comment) => comment.id !== optimistic.id));
      setText(body);
      showToast(error instanceof Error ? error.message : "Не удалось отправить комментарий", "error");
    } finally {
      setSending(false);
    }
  }

  async function toggleCommentLike(commentId: string) {
    const current = comments.find((comment) => comment.id === commentId);
    setComments((prev) => prev.map((comment) => comment.id === commentId
      ? { ...comment, liked: !comment.liked, likesCount: Math.max(0, (comment.likesCount || 0) + (comment.liked ? -1 : 1)) }
      : comment));
    try {
      const res = await api.toggleCommentLike(commentId);
      setComments((prev) => prev.map((comment) => comment.id === commentId ? { ...comment, liked: res.liked, likesCount: res.likesCount } : comment));
    } catch {
      if (current) setComments((prev) => prev.map((comment) => comment.id === commentId ? current : comment));
      showToast("Не удалось поставить лайк", "error");
    }
  }


  async function toggleCommentPin(commentId: string) {
    const current = comments.find((comment) => comment.id === commentId);
    if (!current) return;
    const previous = { pinned: Boolean(current.pinned), pinnedAt: current.pinnedAt ?? null };
    setComments((prev) => prev
      .map((comment) => comment.id === commentId ? { ...comment, pinned: !previous.pinned, pinnedAt: !previous.pinned ? new Date().toISOString() : null } : comment)
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    try {
      const res = await api.toggleCommentPin(commentId);
      setComments((prev) => prev
        .map((comment) => comment.id === commentId ? { ...comment, pinned: res.pinned, pinnedAt: res.pinnedAt ?? null } : comment)
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      showToast(res.pinned ? "Комментарий закреплён" : "Комментарий откреплён", "success");
    } catch {
      setComments((prev) => prev.map((comment) => comment.id === commentId ? { ...comment, ...previous } : comment));
      showToast("Не удалось закрепить комментарий", "error");
    }
  }


  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="border-t border-white/5"
    >
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-white/40">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-white/40">
            <MessageSquare size={28} className="mb-2" />
            <span className="text-sm">Пока нет комментариев</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {comments.map((c) => {
              const parent = c.parentId ? comments.find((x) => x.id === c.parentId) : null;
              return (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex gap-2.5", c.parentId && "ml-8")}
              >
                <button
                  onClick={() => router.push(`/profile/${c.author.username}`)}
                  className="shrink-0 transition hover:scale-105"
                >
                  <GlowAvatar src={c.author.avatarUrl} alt={c.author.username} size={32} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="rounded-2xl glass px-3 py-2">
                    <button
                      onClick={() => router.push(`/profile/${c.author.username}`)}
                      className="hover:opacity-80 transition text-left w-full"
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold" style={{ color: c.author.nameColor }}>
                          {c.author.displayName}
                        </span>
                        {"role" in c.author && c.author.role && c.author.role !== "user" && (
                          <RoleBadge role={String(c.author.role)} size={14} />
                        )}
                        {"isPremium" in c.author && Boolean(c.author.isPremium) && (
                          <PremiumBadge size={14} />
                        )}
                        {c.pinned && <span className="rounded-full bg-neon-purple/15 px-1.5 py-0.5 text-[9px] font-bold text-neon-purple">PIN</span>}
                      </div>
                      <div className="text-[11px]" style={{ color: c.author.nameColor, opacity: 0.6 }}>
                        @{c.author.username}
                      </div>
                    </button>
                    {parent && (
                      <div className="mb-1 text-[11px] text-neon-purple/80">↳ ответ @{parent.author.username}</div>
                    )}
                    <p className="text-sm text-white/85 break-words mt-1">{c.text}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 ml-1 text-[11px] text-white/40">
                    <span>{timeAgo(c.createdAt)}</span>
                    <button onClick={() => toggleCommentLike(c.id)} className={cn("hover:text-white transition flex items-center gap-1", c.liked && "text-pink-300")}>
                      <Heart size={11} className={c.liked ? "fill-current" : ""} /> {c.likesCount || ""}
                    </button>
                    <button
                      className="hover:text-white transition"
                      onClick={() => {
                        setReplyTo(c);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                    >
                      Ответить
                    </button>
                    <div className="ml-auto">
                      <PostMenu
                        itemType="комментарий"
                        isOwner={c.author.id === user?.id}
                        isAdmin={canModerate || ["admin", "owner", "co_owner", "moderator"].includes(user?.role ?? "")}
                        onPin={c.author.id === user?.id || canModerate || ["admin", "owner", "co_owner", "moderator"].includes(user?.role ?? "") ? () => toggleCommentPin(c.id) : undefined}
                        pinned={Boolean(c.pinned)}
                        onDelete={() => {
                          api.deleteComment(c.id)
                            .then(() => setComments((prev) => prev.filter((x) => x.id !== c.id && x.parentId !== c.id)))
                            .catch(() => showToast("Не удалось удалить комментарий", "error"));
                        }}
                        onReport={(category: string, reason: string) => {
                          api.createReport({ targetType: "comment", targetId: c.id, category, reason }).catch(() => {});
                          showToast("Жалоба отправлена", "success");
                        }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            );})}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex items-center gap-2 rounded-2xl glass px-3 py-2 text-xs text-white/60"
            >
              <span className="text-neon-purple">Ответ @{replyTo.author.username}</span>
              <span className="min-w-0 flex-1 truncate">{replyTo.text}</span>
              <button onClick={() => setReplyTo(null)} className="text-white/40 hover:text-white">×</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Composer */}
        {!commentsEnabled && !canModerate ? (
          <div className="rounded-2xl bg-white/[0.035] px-4 py-3 text-center text-xs text-white/45">Комментарии в этом канале отключены</div>
        ) : <form onSubmit={send} className="flex items-center gap-2 pt-2">
          <GlowAvatar src={user?.avatarUrl ?? null} alt={user?.username ?? "me"} size={32} />
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={replyTo ? `Ответить @${replyTo.author.username}…` : "Добавить комментарий…"}
              className={cn(
                "w-full rounded-full glass px-4 py-2.5 pr-11 text-sm outline-none transition",
                "focus:border-neon-purple/50 focus:shadow-glow",
              )}
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center h-8 w-8 rounded-full bg-gradient-to-br from-neon-purple to-neon-indigo text-white shadow-glow transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </form>}
      </div>
    </motion.div>
  );
}
