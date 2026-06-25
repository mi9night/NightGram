"use client";

// =============================================================================
//  Messenger — left panel: chat list, search, folders, pinned
// =============================================================================

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Pin, Bookmark, Users, MessageCircle, ChevronLeft, MoreHorizontal, BellOff, Star, Sparkles, Inbox, VolumeX } from "lucide-react";
import type { ChatFolder, Conversation } from "@/types";
import type { LucideIcon } from "lucide-react";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { PremiumBadge, RoleBadge, VerifiedBadge } from "@/components/shared/RoleBadge";
import { cn, timeAgo } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

type SmartFolder = ChatFolder | "important" | "muted" | "requests";

const FOLDERS: { id: SmartFolder; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "Все", icon: MessageCircle },
  { id: "important", label: "Важные", icon: Sparkles },
  { id: "requests", label: "Запросы", icon: Inbox },
  { id: "unread", label: "Непрочитанные", icon: Users },
  { id: "favorites", label: "Избранное", icon: Bookmark },
  { id: "muted", label: "Без звука", icon: VolumeX },
  { id: "groups", label: "Группы", icon: Users },
];

function getConversationPeer(conv: Conversation, currentUserId?: string | null) {
  if (conv.type !== "direct") return null;
  const participant = conv.participants.find((p) => p.id && p.id !== currentUserId);
  if (participant) return participant;
  const sender = conv.lastMessage?.sender;
  if (sender && sender.id && sender.id !== currentUserId) return sender;
  return null;
}

function displayConversationTitle(conv: Conversation, currentUserId?: string | null) {
  const peer = getConversationPeer(conv, currentUserId);
  if (peer) return peer.displayName || peer.username || conv.title || "Чат";
  return conv.title && conv.title !== "Чат" ? conv.title : "Пользователь";
}

export function ChatList({
  conversations,
  activeId,
  onSelect,
  onBack,
  onCreateGroup,
  onTogglePin,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onBack?: () => void;
  onCreateGroup?: () => void;
  onTogglePin?: (id: string) => void;
}) {
  const { user } = useAuth();
  const [folder, setFolder] = useState<SmartFolder>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let list = conversations;
    if (folder === "important") list = list.filter((c) => (c.pinned || c.favorite || (c.unreadCount > 0 && !c.muted)) && c.id !== "__saved__" && c.requestStatus !== "pending");
    if (folder === "requests") list = list.filter((c) => c.type === "direct" && c.id !== "__saved__" && c.requestStatus === "pending");
    if (folder === "unread") list = list.filter((c) => c.unreadCount > 0);
    if (folder === "favorites") list = list.filter((c) => c.pinned || c.favorite);
    if (folder === "muted") list = list.filter((c) => c.muted);
    if (folder === "groups") list = list.filter((c) => c.type === "group");
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) => displayConversationTitle(c, user?.id).toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [conversations, folder, query, user?.id]);

  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const unreadMutedTotal = conversations.filter((c) => c.muted).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const importantTotal = conversations.filter((c) => (c.pinned || c.favorite || (c.unreadCount > 0 && !c.muted)) && c.id !== "__saved__" && c.requestStatus !== "pending").length;
  const requestTotal = conversations.filter((c) => c.type === "direct" && c.id !== "__saved__" && c.requestStatus === "pending").length;
  const mutedTotal = conversations.filter((c) => c.muted && c.unreadCount > 0).reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center gap-2 mb-3">
          {onBack && (
            <button onClick={onBack} className="md:hidden grid place-items-center h-8 w-8 rounded-lg glass">
              <ChevronLeft size={16} />
            </button>
          )}
          <h2 className="font-display font-bold text-xl flex-1">Сообщения</h2>
          {onCreateGroup && (
            <button
              onClick={onCreateGroup}
              className="grid place-items-center h-8 w-8 rounded-lg glass text-white/55 hover:text-white transition"
              title="Создать группу"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск чатов…"
            className="w-full rounded-xl glass pl-9 pr-3 py-2.5 text-sm outline-none focus:border-neon-purple/40"
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <button onClick={() => setFolder("important")} className="rounded-2xl glass px-2 py-2 text-left hover:brightness-110">
            <div className="text-[10px] text-white/35">Night Priority</div>
            <div className="text-sm font-bold text-neon-purple">{importantTotal}</div>
          </button>
          <button onClick={() => setFolder("requests")} className="rounded-2xl glass px-2 py-2 text-left hover:brightness-110">
            <div className="text-[10px] text-white/35">Запросы</div>
            <div className="text-sm font-bold text-white/80">{requestTotal}</div>
          </button>
          <button onClick={() => setFolder("muted")} className="rounded-2xl glass px-2 py-2 text-left hover:brightness-110">
            <div className="text-[10px] text-white/35">Без звука</div>
            <div className="text-sm font-bold text-white/55">{mutedTotal}</div>
          </button>
        </div>

        {/* Folders */}
        <div className="flex gap-1.5 mt-3 overflow-x-auto scrollbar-hide">
          {FOLDERS.map((f) => {
            const Icon = f.icon;
            const active = folder === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFolder(f.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap transition",
                  active
                    ? "bg-neon-purple/20 text-white border border-neon-purple/40"
                    : "glass text-white/55 hover:text-white",
                )}
              >
                <Icon size={12} /> {f.label}
                {f.id === "unread" && unreadTotal > 0 && (
                  <span className={cn("ml-1 grid min-w-[18px] h-[18px] place-items-center rounded-full px-1 text-[10px] font-bold", unreadMutedTotal === unreadTotal ? "bg-black/40 text-white/65" : "bg-white/85 text-midnight-950")}>
                    {unreadTotal > 99 ? "99+" : unreadTotal}
                  </span>
                )}
                {f.id === "important" && importantTotal > 0 && <span className="ml-1 text-[10px] text-neon-purple">{importantTotal}</span>}
                {f.id === "requests" && requestTotal > 0 && <span className="ml-1 text-[10px] text-white/70">{requestTotal}</span>}
                {f.id === "muted" && mutedTotal > 0 && <span className="ml-1 text-[10px] text-white/45">{mutedTotal}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="text-center text-white/40 text-sm py-10">Чатов не найдено</div>
        ) : (
          filtered.map((c) => (
            <ChatRow
              key={c.id}
              conv={c}
              active={c.id === activeId}
              onClick={() => onSelect(c.id)}
              onTogglePin={onTogglePin}
              currentUserId={user?.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ChatRow({
  conv,
  active,
  onClick,
  onTogglePin,
  currentUserId,
}: {
  conv: Conversation;
  active: boolean;
  onClick: () => void;
  onTogglePin?: (id: string) => void;
  currentUserId?: string;
}) {
  const isSaved = conv.id === "__saved__";
  const peer = getConversationPeer(conv, currentUserId);
  const title = isSaved ? conv.title : displayConversationTitle(conv, currentUserId);
  const avatarUrl = conv.type === "direct" ? (peer?.avatarUrl ?? conv.avatarUrl) : conv.avatarUrl;
  const nameColor = conv.type === "direct" ? (peer?.nameColor ?? "var(--accent-main)") : (conv.participants.find((p) => p.id !== "")?.nameColor ?? "var(--accent-main)");
  const avatarFrame = conv.type === "direct" ? (peer?.avatarFrame ?? conv.avatarFrame) : conv.avatarFrame;
  const isOnline = conv.type === "direct" ? Boolean(peer?.isOnline || conv.isOnline) : conv.isOnline;

  return (
    <motion.div
      layout
      whileHover={{ x: 2 }}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl p-2.5 text-left transition relative group",
        active ? "glass-strong shadow-glow" : "hover:bg-white/5",
      )}
    >
      
      {active && (
        <motion.span
          layoutId="chat-active"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-neon-purple"
          style={{ boxShadow: "0 0 10px var(--accent-main)" }}
        />
      )}
      {isSaved ? (
        <div className="h-12 w-12 rounded-full grid place-items-center glass-strong shadow-glow shrink-0">
          <Bookmark size={20} className="text-neon-purple" />
        </div>
      ) : (
        <GlowAvatar
          src={avatarUrl}
          alt={title}
          size={48}
          online={isOnline}
          glow={conv.lastMessage ? "purple" : undefined}
          frame={avatarFrame}
          ringColor={nameColor}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className={cn("font-semibold truncate text-sm", active && "text-white")}>
            {title}
          </span>
          {conv.pinned && <span title="Закреплённый чат"><Pin size={11} className="text-neon-purple shrink-0 fill-current" /></span>}
          {conv.favorite && <span title="Пользователь в избранном"><Star size={11} className="text-neon-gold shrink-0 fill-current" /></span>}
          {conv.muted && <span title="Чат заглушён"><BellOff size={11} className="text-white/35 shrink-0" /></span>}
          {conv.requestStatus === "pending" && <span className="rounded-full bg-amber-400/12 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">REQUEST</span>}
          {conv.verified && <VerifiedBadge size={14} />}
          {conv.appRole && conv.appRole !== "user" && <RoleBadge role={conv.appRole} size={14} />}
          {conv.isPremium && <PremiumBadge size={14} />}
        </div>
        <p className="text-xs text-white/45 truncate">
          {conv.nightStatusText && (!conv.nightStatusExpiresAt || new Date(conv.nightStatusExpiresAt).getTime() > Date.now())
            ? `${conv.nightStatusEmoji || "🌙"} ${conv.nightStatusText}`
            : conv.lastMessage?.text ?? (isSaved ? "Твой личный чат-сейф" : "Нет сообщений")}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {conv.lastMessage && (
          <span className="text-[10px] text-white/35">
            {timeAgo(conv.lastMessage.createdAt)}
          </span>
        )}
        {conv.unreadCount > 0 && (
          <span
            className={cn(
              "grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
              conv.muted ? "bg-black/40 text-white/65" : "bg-white/85 text-midnight-950",
            )}
            style={!conv.muted ? { boxShadow: "0 0 8px rgba(255,255,255,0.35)" } : undefined}
          >
            {conv.unreadCount}
          </span>
        )}
      </div>
      {!isSaved && onTogglePin && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(conv.id); }}
          className="relative z-10 grid h-7 w-7 place-items-center rounded-lg glass text-white/35 opacity-0 transition hover:text-neon-purple group-hover:opacity-100"
          title={conv.pinned ? "Открепить" : "Закрепить"}
        >
          <Pin size={13} className={conv.pinned ? "fill-current text-neon-purple" : ""} />
        </button>
      )}
    </motion.div>
  );
}
