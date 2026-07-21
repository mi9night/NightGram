"use client";

// =============================================================================
//  Messenger — left panel: chat list, search, folders, pinned
// =============================================================================

import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search, Pin, PinOff, Bookmark, Users, MessageCircle, ChevronLeft, MoreHorizontal, MoreVertical, Bell, BellOff, Star, Sparkles, Inbox, VolumeX, Archive, ArchiveRestore, Briefcase, Heart, Home, FolderOpen, Check, AtSign } from "lucide-react";
import type { ChatFolder, Conversation } from "@/types";
import type { LucideIcon } from "lucide-react";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { PremiumBadge, RoleBadge, VerifiedBadge } from "@/components/shared/RoleBadge";
import { cn, timeAgo } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useFixedVirtualList } from "@/hooks/useFixedVirtualList";
import { getAllChatDrafts, subscribeToChatDrafts } from "@/lib/chatDrafts";

type SmartFolder = ChatFolder | "important" | "muted" | "requests" | "mentions";
type OrganizationFolder = "all" | "work" | "friends" | "family";

const FOLDERS: { id: SmartFolder; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "Все", icon: MessageCircle },
  { id: "important", label: "Важные", icon: Sparkles },
  { id: "requests", label: "Запросы", icon: Inbox },
  { id: "unread", label: "Непрочитанные", icon: Users },
  { id: "mentions", label: "Упоминания", icon: AtSign },
  { id: "favorites", label: "Избранное", icon: Bookmark },
  { id: "work", label: "Работа", icon: Briefcase },
  { id: "friends", label: "Друзья", icon: Heart },
  { id: "family", label: "Семья", icon: Home },
  { id: "muted", label: "Без звука", icon: VolumeX },
  { id: "groups", label: "Группы", icon: Users },
  { id: "archived", label: "Архив", icon: Archive },
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

function normalizeSearchValue(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zа-яё0-9@]+/gi, " ")
    .trim();
}

function conversationSearchScore(conv: Conversation, query: string, currentUserId?: string | null, draftText = ""): number {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return 0;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const peer = getConversationPeer(conv, currentUserId);
  const title = normalizeSearchValue(displayConversationTitle(conv, currentUserId));
  const usernames = normalizeSearchValue([
    peer?.username,
    ...conv.participants.map((participant) => participant.username),
  ].filter(Boolean).join(" "));
  const participantNames = normalizeSearchValue(conv.participants
    .map((participant) => participant.displayName || participant.username)
    .join(" "));
  const lastMessage = normalizeSearchValue(conv.lastMessage?.text || "");
  const draft = normalizeSearchValue(draftText);
  const haystack = `${title} ${usernames} ${participantNames} ${lastMessage} ${draft}`;
  if (!tokens.every((token) => haystack.includes(token))) return -1;

  let score = 0;
  if (title === normalizedQuery) score += 180;
  else if (title.startsWith(normalizedQuery)) score += 130;
  else if (title.includes(normalizedQuery)) score += 95;
  if (usernames.includes(normalizedQuery)) score += 80;
  if (participantNames.includes(normalizedQuery)) score += 55;
  if (lastMessage.includes(normalizedQuery)) score += 20;
  if (draft.includes(normalizedQuery)) score += 30;
  if (conv.pinned) score += 8;
  if (conv.unreadCount > 0) score += 4;
  return score;
}

export function ChatList({
  conversations,
  activeId,
  onSelect,
  onBack,
  onCreateGroup,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onSetFolder,
  onPrefetch,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onBack?: () => void;
  onCreateGroup?: () => void;
  onTogglePin?: (id: string) => void;
  onToggleMute?: (id: string) => void;
  onToggleArchive?: (id: string) => void;
  onSetFolder?: (id: string, folder: OrganizationFolder) => void;
  onPrefetch?: (id: string) => void;
}) {
  const { user } = useAuth();
  const [folder, setFolder] = useState<SmartFolder>("all");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState(() => getAllChatDrafts(user?.id));
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const refresh = () => setDrafts(getAllChatDrafts(user?.id));
    refresh();
    return subscribeToChatDrafts(refresh);
  }, [user?.id]);

  const filtered = useMemo(() => {
    let list = conversations;
    if (folder === "archived") list = list.filter((c) => c.archived && c.id !== "__saved__");
    else list = list.filter((c) => !c.archived);

    if (folder === "important") list = list.filter((c) => (c.pinned || c.favorite || (c.unreadCount > 0 && !c.muted)) && c.id !== "__saved__" && c.requestStatus !== "pending");
    if (folder === "requests") list = list.filter((c) => c.type === "direct" && c.id !== "__saved__" && c.requestStatus === "pending");
    if (folder === "unread") list = list.filter((c) => c.unreadCount > 0);
    if (folder === "mentions") list = list.filter((c) => (c.mentionCount || 0) > 0);
    if (folder === "favorites") list = list.filter((c) => c.pinned || c.favorite);
    if (folder === "muted") list = list.filter((c) => c.muted);
    if (folder === "groups") list = list.filter((c) => c.type === "group");
    if (folder === "work" || folder === "friends" || folder === "family") list = list.filter((c) => c.folder === folder);
    if (deferredQuery.trim()) {
      return list
        .map((conversation) => ({
          conversation,
          score: conversationSearchScore(conversation, deferredQuery, user?.id, drafts[conversation.id]?.text || ""),
        }))
        .filter((entry) => entry.score >= 0)
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.conversation);
    }
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [conversations, drafts, folder, deferredQuery, user?.id]);

  const virtualList = useFixedVirtualList({
    items: filtered,
    rowHeight: 72,
    overscan: 7,
    threshold: 30,
  });

  const { unreadTotal, unreadMutedTotal, importantTotal, requestTotal, mutedTotal, archivedTotal, mentionTotal } = useMemo(() => {
    let unreadTotal = 0;
    let unreadMutedTotal = 0;
    let importantTotal = 0;
    let requestTotal = 0;
    let mutedTotal = 0;
    let archivedTotal = 0;
    let mentionTotal = 0;
    for (const c of conversations) {
      if (c.archived) {
        archivedTotal += 1;
        continue;
      }
      const unread = c.unreadCount || 0;
      unreadTotal += unread;
      mentionTotal += c.mentionCount || 0;
      if (c.muted) {
        unreadMutedTotal += unread;
        mutedTotal += 1;
      }
      if ((c.pinned || c.favorite || (unread > 0 && !c.muted)) && c.id !== "__saved__" && c.requestStatus !== "pending") importantTotal += 1;
      if (c.type === "direct" && c.id !== "__saved__" && c.requestStatus === "pending") requestTotal += 1;
    }
    return { unreadTotal, unreadMutedTotal, importantTotal, requestTotal, mutedTotal, archivedTotal, mentionTotal };
  }, [conversations]);

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

        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
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
          <button onClick={() => setFolder("archived")} className="rounded-2xl glass px-2 py-2 text-left hover:brightness-110">
            <div className="text-[10px] text-white/35">Архив</div>
            <div className="text-sm font-bold text-white/55">{archivedTotal}</div>
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
                {f.id === "mentions" && mentionTotal > 0 && <span className="ml-1 text-[10px] text-neon-purple">{mentionTotal}</span>}
                {f.id === "archived" && archivedTotal > 0 && <span className="ml-1 text-[10px] text-white/45">{archivedTotal}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* List — fixed-row virtualization activates automatically for long chat lists. */}
      <div
        ref={virtualList.containerRef}
        onScroll={virtualList.onScroll}
        className="flex-1 overflow-y-auto p-2"
      >
        {filtered.length === 0 ? (
          <div className="text-center text-white/40 text-sm py-10">Чатов не найдено</div>
        ) : virtualList.enabled ? (
          <div className="relative" style={{ height: virtualList.totalHeight }}>
            {virtualList.virtualItems.map(({ item: c, offset }) => (
              <div
                key={c.id}
                className="absolute inset-x-0 h-[72px] pb-1"
                style={{ transform: `translateY(${offset}px)` }}
              >
                <ChatRow
                  conv={c}
                  active={c.id === activeId}
                  onSelect={onSelect}
                  onTogglePin={onTogglePin}
                  onToggleMute={onToggleMute}
                  onToggleArchive={onToggleArchive}
                  onSetFolder={onSetFolder}
                  onPrefetch={onPrefetch}
                  currentUserId={user?.id}
                  draftText={drafts[c.id]?.text || ""}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((c) => (
              <ChatRow
                key={c.id}
                conv={c}
                active={c.id === activeId}
                onSelect={onSelect}
                onTogglePin={onTogglePin}
                onToggleMute={onToggleMute}
                onToggleArchive={onToggleArchive}
                onSetFolder={onSetFolder}
                onPrefetch={onPrefetch}
                currentUserId={user?.id}
                draftText={drafts[c.id]?.text || ""}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ChatRow = memo(function ChatRow({
  conv,
  active,
  onSelect,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onSetFolder,
  onPrefetch,
  currentUserId,
  draftText,
}: {
  conv: Conversation;
  active: boolean;
  onSelect: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleMute?: (id: string) => void;
  onToggleArchive?: (id: string) => void;
  onSetFolder?: (id: string, folder: OrganizationFolder) => void;
  onPrefetch?: (id: string) => void;
  currentUserId?: string;
  draftText?: string;
}) {
  const isSaved = conv.id === "__saved__";
  const peer = getConversationPeer(conv, currentUserId);
  const title = isSaved ? conv.title : displayConversationTitle(conv, currentUserId);
  const avatarUrl = conv.type === "direct" ? (peer?.avatarUrl ?? conv.avatarUrl) : conv.avatarUrl;
  const nameColor = conv.type === "direct" ? (peer?.nameColor ?? "var(--accent-main)") : (conv.participants.find((p) => p.id !== "")?.nameColor ?? "var(--accent-main)");
  const avatarFrame = conv.type === "direct" ? (peer?.avatarFrame ?? conv.avatarFrame) : conv.avatarFrame;
  const isOnline = conv.type === "direct" ? Boolean(peer?.isOnline || conv.isOnline) : conv.isOnline;
  const [menuOpen, setMenuOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => { setMenuOpen(false); setFolderMenuOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  function runAction(action?: () => void) {
    action?.();
    setFolderMenuOpen(false);
    setMenuOpen(false);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(conv.id)}
      onPointerEnter={() => onPrefetch?.(conv.id)}
      onPointerDown={() => onPrefetch?.(conv.id)}
      onFocus={() => onPrefetch?.(conv.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(conv.id);
        }
      }}
      className={cn(
        "ng-content-visibility h-[68px] w-full flex items-center gap-3 rounded-2xl p-2.5 text-left transition-transform relative group hover:translate-x-0.5",
        active ? "glass-strong shadow-glow" : "hover:bg-white/5",
      )}
    >
      
      {active && (
        <span
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
          {conv.archived && <span title="Чат в архиве"><Archive size={11} className="text-white/35 shrink-0" /></span>}
          {conv.folder === "work" && <span title="Работа"><Briefcase size={11} className="text-sky-300/80 shrink-0" /></span>}
          {conv.folder === "friends" && <span title="Друзья"><Heart size={11} className="text-pink-300/80 shrink-0" /></span>}
          {conv.folder === "family" && <span title="Семья"><Home size={11} className="text-amber-300/80 shrink-0" /></span>}
          {conv.requestStatus === "pending" && <span className="rounded-full bg-amber-400/12 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">REQUEST</span>}
          {conv.verified && <VerifiedBadge size={14} />}
          {conv.appRole && conv.appRole !== "user" && <RoleBadge role={conv.appRole} size={14} />}
          {conv.isPremium && <PremiumBadge size={14} />}
        </div>
        <p className="text-xs text-white/45 truncate">
          {draftText ? (
            <><span className="font-semibold text-neon-purple">Черновик:</span> {draftText}</>
          ) : conv.nightStatusText && (!conv.nightStatusExpiresAt || new Date(conv.nightStatusExpiresAt).getTime() > Date.now())
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
        {(conv.mentionCount || 0) > 0 && (
          <span className="grid min-w-[18px] h-[18px] place-items-center rounded-full bg-neon-purple/20 px-1 text-[10px] font-bold text-neon-purple" title="Непрочитанные упоминания">
            @{conv.mentionCount}
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
      {!isSaved && (onTogglePin || onToggleMute || onToggleArchive || onSetFolder) && (
        <div className="relative z-30">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); setMenuOpen((value) => !value); setFolderMenuOpen(false); }}
            className="grid h-8 w-8 place-items-center rounded-lg glass text-white/40 opacity-100 transition hover:text-white md:opacity-0 md:group-hover:opacity-100"
            title="Действия с чатом"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div onClick={(event) => event.stopPropagation()} className="absolute right-0 top-9 z-50 w-52 rounded-2xl border border-white/10 bg-[#17131f] p-1.5 text-xs shadow-2xl">
              <button type="button" onClick={() => runAction(() => onTogglePin?.(conv.id))} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-white/70 hover:bg-white/7 hover:text-white">
                {conv.pinned ? <PinOff size={14} /> : <Pin size={14} />} {conv.pinned ? "Открепить чат" : "Закрепить чат"}
              </button>
              <button type="button" onClick={() => runAction(() => onToggleMute?.(conv.id))} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-white/70 hover:bg-white/7 hover:text-white">
                {conv.muted ? <Bell size={14} /> : <BellOff size={14} />} {conv.muted ? "Включить звук" : "Без звука"}
              </button>
              <button type="button" onClick={() => runAction(() => onToggleArchive?.(conv.id))} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-white/70 hover:bg-white/7 hover:text-white">
                {conv.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {conv.archived ? "Вернуть из архива" : "В архив"}
              </button>
              <button type="button" onClick={() => setFolderMenuOpen((value) => !value)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-white/70 hover:bg-white/7 hover:text-white">
                <FolderOpen size={14} /> Папка <span className="ml-auto text-white/30">›</span>
              </button>
              {folderMenuOpen && (
                <div className="mt-1 border-t border-white/8 pt-1">
                  {([
                    ["all", "Без папки", MessageCircle],
                    ["work", "Работа", Briefcase],
                    ["friends", "Друзья", Heart],
                    ["family", "Семья", Home],
                  ] as const).map(([folderId, label, Icon]) => (
                    <button key={folderId} type="button" onClick={() => runAction(() => onSetFolder?.(conv.id, folderId))} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-white/65 hover:bg-white/7 hover:text-white">
                      <Icon size={13} /> {label} {conv.folder === folderId && <Check size={12} className="ml-auto text-neon-purple" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}, (prev, next) => prev.conv === next.conv && prev.active === next.active && prev.currentUserId === next.currentUserId && prev.onSelect === next.onSelect && prev.onTogglePin === next.onTogglePin && prev.onToggleMute === next.onToggleMute && prev.onToggleArchive === next.onToggleArchive && prev.onSetFolder === next.onSetFolder && prev.onPrefetch === next.onPrefetch && prev.draftText === next.draftText);
