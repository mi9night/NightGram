"use client";

// =============================================================================
//  Feed — CommentSheet (expandable inline comments)
// =============================================================================

import { useEffect, useState } from "react";
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

export function CommentSheet({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

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

    try {
      const real = await api.addComment(postId, body);
      setComments((c) => c.map((x) => (x.id === optimistic.id ? real : x)));
    } catch {
      /* keep optimistic */
    } finally {
      setSending(false);
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
            {comments.map((c) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2.5"
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
                      </div>
                      <div className="text-[11px]" style={{ color: c.author.nameColor, opacity: 0.6 }}>
                        @{c.author.username}
                      </div>
                    </button>
                    <p className="text-sm text-white/85 break-words mt-1">{c.text}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 ml-1 text-[11px] text-white/40">
                    <span>{timeAgo(c.createdAt)}</span>
                    <button className="hover:text-white transition flex items-center gap-1">
                      <Heart size={11} /> {c.likesCount || ""}
                    </button>
                    <button className="hover:text-white transition">Ответить</button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {/* Composer */}
        <form onSubmit={send} className="flex items-center gap-2 pt-2">
          <GlowAvatar src={user?.avatarUrl ?? null} alt={user?.username ?? "me"} size={32} />
          <div className="flex-1 relative">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Добавить комментарий…"
              className={cn(
                "w-full rounded-full glass px-4 py-2.5 pr-11 text-sm outline-none transition",
                "focus:border-neon-purple/50 focus:shadow-glow",
              )}
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center h-8 w-8 rounded-full btn-glow disabled:opacity-40"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
