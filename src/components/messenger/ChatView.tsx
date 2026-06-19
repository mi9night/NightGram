"use client";

// =============================================================================
//  Messenger — center panel: real-time message thread
//  Socket.io events drive incoming messages; optimistic UI on send.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Paperclip,
  Smile,
  Phone,
  Video,
  ChevronLeft,
  Info,
  X,
  Reply,
  Image as ImageIcon,
} from "lucide-react";
import type { Conversation, Message } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { cn, clockTime, uid } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { useSocket } from "@/context/SocketProvider";
import { api } from "@/lib/api";

const STICKERS = ["🌙", "✨", "🔥", "💜", "😎", "🚀", "🌃", "💫", "🎧", "🦊", "👾", "💎"];
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "💯", "🙏"];

export function ChatView({
  conversation,
  onBack,
  onToggleInfo,
}: {
  conversation: Conversation;
  onBack: () => void;
  onToggleInfo: () => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const socket = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const other = conversation.participants[0];

  // Load history
  useEffect(() => {
    let active = true;
    api.getMessages(conversation.id).catch(() => []).then((data) => {
      if (active) setMessages(data);
    });
    return () => {
      active = false;
    };
  }, [conversation.id]);

  // Socket: incoming messages
  useEffect(() => {
    const handler = (msg: Message) => {
      if (msg.conversationId !== conversation.id) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    const typingHandler = ({ conversationId, isTyping: t }: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (conversationId === conversation.id) setTyping(t);
    };
    socket.on("message:new", handler);
    socket.on("typing", typingHandler);
    return () => {
      socket.off("message:new", handler);
      socket.off("typing", typingHandler);
    };
  }, [socket, conversation.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  // Demo simulated reply
  useEffect(() => {
    return; // no auto-reply in production
    const last = messages[messages.length - 1];
    if (last.senderId !== user?.id) return;
    const t = setTimeout(() => {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: uid("msg"),
            conversationId: conversation.id,
            senderId: other.id,
            text: ["хах 🔥", "точно!", "согласен ✨", "позже обсудим", "💜💜"][Math.floor(Math.random() * 5)],
            type: "text",
            reactions: [],
            status: "read",
            createdAt: new Date().toISOString(),
          },
        ]);
      }, 1400);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  function send(payload: Partial<Pick<Message, "text" | "type" | "attachmentUrl">>) {
    if (!user) return;
    const msg: Message = {
      id: uid("msg"),
      conversationId: conversation.id,
      senderId: user.id,
      text: payload.text,
      type: payload.type ?? "text",
      attachmentUrl: payload.attachmentUrl,
      replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, senderId: replyTo.senderId } : null,
      reactions: [],
      status: "sent",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, msg]);
    setText("");
    setReplyTo(null);
    setShowStickers(false);

    socket.emit("message:send", {
        conversationId: conversation.id,
        text: payload.text,
        type: payload.type,
        attachmentUrl: payload.attachmentUrl,
        replyTo: replyTo?.id,
      });
  }

  function onTyping() {
    socket.emit("typing", { conversationId: conversation.id, isTyping: true });
  }

  function reactToMessage(messageId: string, emoji: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const existing = m.reactions.find((r) => r.emoji === emoji);
        if (existing) {
          const has = existing.userIds.includes(user!.id);
          return {
            ...m,
            reactions: m.reactions.map((r) =>
              r.emoji === emoji
                ? { ...r, userIds: has ? r.userIds.filter((u) => u !== user!.id) : [...r.userIds, user!.id] }
                : r,
            ),
          };
        }
        return { ...m, reactions: [...m.reactions, { emoji, userIds: [user!.id] }] };
      }),
    );
    socket.emit("message:react", { messageId, emoji });
  }

  const groupedReactions = useMemo(
    () =>
      messages.flatMap((m) =>
        m.reactions.map((r) => ({ messageId: m.id, emoji: r.emoji, count: r.userIds.length })),
      ),
    [messages],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-white/5 glass-strong">
        <button onClick={onBack} className="md:hidden grid place-items-center h-9 w-9 rounded-lg glass">
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => router.push(`/profile/${conversation.participants[0]?.username ?? "you"}`)}
          className="shrink-0 transition hover:scale-105"
        >
          <GlowAvatar src={conversation.avatarUrl} alt={conversation.title} size={42} online={conversation.isOnline} glow="purple" />
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => router.push(`/profile/${conversation.participants[0]?.username ?? "you"}`)}
            className="font-semibold truncate hover:underline"
          >
            {conversation.title}
          </button>
          {other?.role && other.role !== "user" && other.role !== "member" && (
            <RoleBadge role={other.role} size={15} />
          )}
          <div className="text-xs text-white/45">
            {typing ? (
              <span className="text-neon-purple">печатает…</span>
            ) : conversation.isOnline ? (
              "в сети"
            ) : (
              "был(а) недавно"
            )}
          </div>
        </div>
        <button className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-white transition">
          <Phone size={17} />
        </button>
        <button className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-white transition">
          <Video size={17} />
        </button>
        <button
          onClick={onToggleInfo}
          className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-neon-purple transition"
        >
          <Info size={17} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((m, i) => {
          const mine = m.senderId === user?.id;
          const prev = messages[i - 1];
          const showAvatar = !mine && (!prev || prev.senderId !== m.senderId);
          return (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className={cn("flex items-end gap-2 group", mine ? "justify-end" : "justify-start")}
            >
              {!mine && (
                <div className="w-7 shrink-0">
                  {showAvatar && (
                    <GlowAvatar src={other.avatarUrl} alt={other.username} size={28} />
                  )}
                </div>
              )}

              <div className={cn("relative max-w-[75%]", mine && "items-end")}>
                {/* reply quote */}
                {m.replyTo && (
                  <div className="mb-1 rounded-lg border-l-2 border-neon-purple bg-neon-purple/10 px-2 py-1 text-xs text-white/60">
                    {m.replyTo.text}
                  </div>
                )}

                {/* attachment */}
                {m.type === "image" && m.attachmentUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.attachmentUrl} alt="" className="rounded-2xl max-h-60 mb-1" />
                )}

                <div
                  className={cn(
                    "px-3.5 py-2 text-sm break-words",
                    mine
                      ? "bg-gradient-to-br from-neon-purple to-neon-indigo text-white rounded-2xl rounded-br-md"
                      : "glass text-white/90 rounded-2xl rounded-bl-md",
                    m.type === "sticker" && "bg-transparent px-0 py-0 text-5xl",
                  )}
                >
                  {m.text}
                </div>

                {/* reactions */}
                {m.reactions.length > 0 && (
                  <div className={cn("flex gap-1 mt-0.5", mine ? "justify-end" : "justify-start")}>
                    {m.reactions.map((r) => (
                      <span key={r.emoji} className="rounded-full glass px-1.5 py-0.5 text-xs">
                        {r.emoji} {r.userIds.length}
                      </span>
                    ))}
                  </div>
                )}

                <div className={cn("flex items-center gap-1 mt-0.5 text-[10px] text-white/30", mine ? "justify-end" : "justify-start")}>
                  {clockTime(m.createdAt)}
                  {mine && <span>{m.status === "read" ? "✓✓" : "✓"}</span>}
                </div>

                {/* hover actions */}
                <div className={cn(
                  "absolute -top-3 opacity-0 group-hover:opacity-100 transition flex gap-0.5 rounded-full glass-strong px-1 py-0.5",
                  mine ? "right-0" : "left-0",
                )}>
                  {EMOJIS.slice(0, 4).map((e) => (
                    <button key={e} onClick={() => reactToMessage(m.id, e)} className="text-xs hover:scale-125 transition">
                      {e}
                    </button>
                  ))}
                  <button onClick={() => setReplyTo(m)} className="text-white/50 hover:text-white px-1">
                    <Reply size={11} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {typing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-end gap-2">
            <div className="w-7" />
            <div className="glass rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-white/60"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Sticker / emoji panels */}
      <AnimatePresence>
        {showStickers && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="p-3 grid grid-cols-6 gap-2">
              {STICKERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send({ text: s, type: "sticker" })}
                  className="text-3xl rounded-xl hover:bg-neon-purple/10 py-2 transition hover:scale-110"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {showEmojis && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="p-3 flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setText((t) => t + e)}
                  className="text-2xl rounded-xl hover:bg-neon-purple/10 p-1.5 transition hover:scale-110"
                >
                  {e}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply banner */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-neon-purple/5">
              <Reply size={14} className="text-neon-purple" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-neon-purple font-semibold">Ответ</div>
                <div className="text-xs text-white/50 truncate">{replyTo.text}</div>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-white/40 hover:text-white">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <div className="p-3 border-t border-white/5 glass-strong">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send({ text: text.trim() });
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) send({ text: "Фото", type: "image", attachmentUrl: URL.createObjectURL(f) });
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="grid place-items-center h-9 w-9 rounded-lg glass text-white/60 hover:text-neon-purple transition shrink-0"
          >
            <Paperclip size={17} />
          </button>
          <button
            type="button"
            onClick={() => setShowStickers((v) => !v)}
            className={cn(
              "grid place-items-center h-9 w-9 rounded-lg transition shrink-0",
              showStickers ? "bg-neon-purple/20 text-neon-purple" : "glass text-white/60 hover:text-neon-purple",
            )}
          >
            <ImageIcon size={17} />
          </button>
          <div className="flex-1 relative">
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                onTyping();
              }}
              placeholder="Сообщение…"
              className="w-full rounded-full glass pl-4 pr-10 py-2.5 text-sm outline-none focus:border-neon-purple/40"
            />
            <button
              type="button"
              onClick={() => {
                setShowEmojis((v) => !v);
                setShowStickers(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-neon-purple"
            >
              <Smile size={18} />
            </button>
          </div>
          <button
            type="submit"
            disabled={!text.trim()}
            className="grid place-items-center h-10 w-10 rounded-full btn-glow disabled:opacity-40 shrink-0"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
