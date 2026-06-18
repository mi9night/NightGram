"use client";

// =============================================================================
//  Messenger — left panel: chat list, search, folders, pinned
// =============================================================================

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Pin, Star, Users, MessageCircle, ChevronLeft } from "lucide-react";
import type { ChatFolder, Conversation } from "@/types";
import type { LucideIcon } from "lucide-react";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { cn, timeAgo } from "@/lib/utils";

const FOLDERS: { id: ChatFolder; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "Все", icon: MessageCircle },
  { id: "unread", label: "Непрочитанные", icon: Users },
  { id: "favorites", label: "Избранные", icon: Star },
  { id: "groups", label: "Группы", icon: Users },
];

export function ChatList({
  conversations,
  activeId,
  onSelect,
  onBack,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onBack?: () => void;
}) {
  const [folder, setFolder] = useState<ChatFolder>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let list = conversations;
    if (folder === "unread") list = list.filter((c) => c.unreadCount > 0);
    if (folder === "favorites") list = list.filter((c) => c.pinned);
    if (folder === "groups") list = list.filter((c) => c.type === "group");
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q));
    }
    // pinned first
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [conversations, folder, query]);

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
}: {
  conv: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      layout
      whileHover={{ x: 2 }}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl p-2.5 text-left transition relative",
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
      <GlowAvatar
        src={conv.avatarUrl}
        alt={conv.title}
        size={48}
        online={conv.isOnline}
        glow={conv.lastMessage ? "purple" : undefined}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className={cn("font-semibold truncate text-sm", active && "text-white")}>
            {conv.title}
          </span>
          {conv.pinned && <Pin size={11} className="text-neon-purple shrink-0 fill-current" />}
        </div>
        <p className="text-xs text-white/45 truncate">
          {conv.lastMessage?.text ?? "Нет сообщений"}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {conv.lastMessage && (
          <span className="text-[10px] text-white/35">
            {timeAgo(conv.lastMessage.createdAt)}
          </span>
        )}
        {conv.unreadCount > 0 && (
          <span className="grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-neon-purple text-[10px] font-bold text-white"
                style={{ boxShadow: "0 0 8px var(--accent-main)" }}>
            {conv.unreadCount}
          </span>
        )}
      </div>
    </motion.button>
  );
}
