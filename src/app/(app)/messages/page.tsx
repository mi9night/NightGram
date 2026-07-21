"use client";

// =============================================================================
//  NightGram Web — Messages page (3-panel real-time chat)
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, Search, Users, X, Loader2, Check, Camera } from "lucide-react";
import type { Conversation } from "@/types";
import { ChatList } from "@/components/messenger/ChatList";
import { ChatView } from "@/components/messenger/ChatView";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { normalizeMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { uploadMedia } from "@/lib/upload";
import { pushGlobalToast } from "@/lib/toast";
import { cacheKey, readClientCache, writeClientCache } from "@/lib/clientCache";
import { invalidateConversationPrefetch, prefetchConversation } from "@/lib/conversationPrefetch";
import { reconcileConversationList } from "@/lib/conversationReconcile";

const ChatInfo = dynamic(
  () => import("@/components/messenger/ChatInfo").then((module) => module.ChatInfo),
  { ssr: false, loading: () => <div className="p-5 text-sm text-white/40">Загрузка информации…</div> },
);

const SavedChatView = dynamic(
  () => import("@/components/messenger/SavedChatView").then((module) => module.SavedChatView),
  { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-white/40">Загрузка Избранного…</div> },
);

const SAVED_CHAT_ID = "__saved__";
const CONVERSATIONS_CACHE_MAX_AGE = 30 * 60 * 1000;
const CONVERSATIONS_STALE_MAX_AGE = 3 * 24 * 60 * 60 * 1000;

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessageId, setInitialMessageId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedPinned, setSavedPinned] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  useEffect(() => {
    setSavedPinned(localStorage.getItem("ng_saved_chat_pinned") === "1");
  }, []);

  useEffect(() => {
    let active = true;
    const key = cacheKey(user?.id, "conversations");
    const cached = readClientCache<Conversation[]>(key, CONVERSATIONS_CACHE_MAX_AGE, CONVERSATIONS_STALE_MAX_AGE);
    if (cached) {
      setConversations(cached);
      setLoading(false);
    }

    // Resolve the requested/default chat immediately instead of waiting for
    // the conversations network request to finish.
    const queuedAtStart = localStorage.getItem("ng_open_chat");
    const queuedMessageAtStart = localStorage.getItem("ng_open_message");
    const queuedPayloadAtStart = localStorage.getItem("ng_open_chat_payload");
    if (queuedMessageAtStart) {
      localStorage.removeItem("ng_open_message");
      setInitialMessageId(queuedMessageAtStart);
    }
    if (queuedPayloadAtStart) {
      localStorage.removeItem("ng_open_chat_payload");
      try {
        const parsed = JSON.parse(queuedPayloadAtStart) as Conversation;
        setConversations((prev) => prev.some((conversation) => conversation.id === parsed.id) ? prev : [parsed, ...prev]);
      } catch { /* ignore stale search payload */ }
    }
    if (queuedAtStart) {
      localStorage.removeItem("ng_open_chat");
      setActiveId(queuedAtStart);
    } else setActiveId(SAVED_CHAT_ID);

    api.getConversations()
      .then((data) => {
        if (!active) return;
        setConversations((previous) => reconcileConversationList(previous, data));
        writeClientCache(key, data);
        // Keep the chat selected before the request. Global search may have
        // already supplied a lightweight conversation payload for instant open.
        setActiveId((current) => current ?? SAVED_CHAT_ID);
      })
      .catch(() => {
        if (active && !cached) setConversations([]);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const socket = getSocket();
    const onPush = ({ conversationId, message, muted }: { conversationId: string; message: unknown; muted?: boolean }) => {
      const msg = normalizeMessage(message);
      invalidateConversationPrefetch(user?.id, conversationId);
      setConversations((prev) => {
        const index = prev.findIndex((conversation) => conversation.id === conversationId);
        if (index < 0) return prev;
        const current = prev[index];
        const updated: Conversation = {
          ...current,
          lastMessage: msg,
          muted: muted ?? current.muted,
          unreadCount: msg.senderId === user?.id || activeId === conversationId ? 0 : current.unreadCount + 1,
        };
        const next = [...prev];
        next.splice(index, 1);
        const insertAt = updated.pinned ? 0 : next.findIndex((conversation) => !conversation.pinned);
        next.splice(insertAt < 0 ? next.length : insertAt, 0, updated);
        return next;
      });
    };
    const onMention = ({ conversationId }: { conversationId: string; messageId: string; senderId: string }) => {
      setConversations((prev) => prev.map((conversation) => (
        conversation.id === conversationId
          ? { ...conversation, mentionCount: activeId === conversationId ? 0 : (conversation.mentionCount || 0) + 1 }
          : conversation
      )));
    };
    const onPresence = ({ userId, isOnline, lastSeen }: { userId: string; isOnline: boolean; lastSeen?: string }) => {
      setConversations((prev) => prev.map((c) => {
        const hasUser = c.participants.some((p) => p.id === userId);
        if (!hasUser) return c;
        return {
          ...c,
          isOnline: c.participants.some((p) => p.id === userId && p.id !== user?.id) ? isOnline : c.isOnline,
          lastSeen: c.participants.some((p) => p.id === userId && p.id !== user?.id) ? (lastSeen ?? c.lastSeen) : c.lastSeen,
          participants: c.participants.map((p) => p.id === userId ? { ...p, isOnline, lastSeen: lastSeen ?? p.lastSeen } : p),
        };
      }));
    };
    const onConversationChanged = ({ conversationId, conversation, removed }: { conversationId: string; conversation?: Partial<Conversation> & { id: string }; removed?: boolean }) => {
      invalidateConversationPrefetch(user?.id, conversationId);
      setConversations((prev) => {
        const index = prev.findIndex((item) => item.id === conversationId);
        if (removed) return index < 0 ? prev : [...prev.slice(0, index), ...prev.slice(index + 1)];
        if (!conversation) return prev;
        if (index < 0) return conversation.title && conversation.type && conversation.participants ? [conversation as Conversation, ...prev] : prev;
        const next = [...prev];
        next[index] = { ...prev[index], ...conversation };
        return next;
      });
      if (removed && activeId === conversationId) {
        setActiveId(null);
        setShowInfo(false);
      }
    };
    socket.on("message:push", onPush);
    socket.on("mention:new", onMention);
    socket.on("presence:update", onPresence);
    socket.on("conversation:changed", onConversationChanged);
    return () => {
      socket.off("message:push", onPush);
      socket.off("mention:new", onMention);
      socket.off("presence:update", onPresence);
      socket.off("conversation:changed", onConversationChanged);
    };
  }, [activeId, user?.id]);


  useEffect(() => {
    if (loading) return;
    const persist = () => writeClientCache(cacheKey(user?.id, "conversations"), conversations);
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(persist, { timeout: 1200 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(persist, 250);
    return () => window.clearTimeout(timer);
  }, [conversations, loading, user?.id]);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations((previous) => reconcileConversationList(previous, data));
      writeClientCache(cacheKey(user?.id, "conversations"), data);
    } catch {
      // Keep cached conversations visible while the network recovers.
    }
  }, [user?.id]);

  useEffect(() => {
    const sync = () => { void refreshConversations(); };
    window.addEventListener("nightgram:socket-ready", sync);
    window.addEventListener("nightgram:resume-sync", sync);
    return () => {
      window.removeEventListener("nightgram:socket-ready", sync);
      window.removeEventListener("nightgram:resume-sync", sync);
    };
  }, [refreshConversations]);

  const savedConversation = useMemo<Conversation>(() => ({
    id: SAVED_CHAT_ID,
    type: "direct",
    title: "Избранное",
    avatarUrl: null,
    participants: user ? [{ id: user.id, username: user.username, avatarUrl: user.avatarUrl, nameColor: user.nameColor, role: "owner", isOnline: true }] : [],
    lastMessage: null,
    unreadCount: 0,
    mentionCount: 0,
    pinned: savedPinned,
    archived: false,
    folder: "all",
    isOnline: false,
  }), [savedPinned, user]);

  const allConversations = useMemo(
    () => [savedConversation, ...conversations],
    [conversations, savedConversation],
  );

  const conversationsById = useMemo(() => new Map(conversations.map((conversation) => [conversation.id, conversation])), [conversations]);
  const active = activeId ? conversationsById.get(activeId) ?? null : null;
  const isSavedActive = activeId === SAVED_CHAT_ID;

  useEffect(() => {
    if (!activeId || activeId === SAVED_CHAT_ID) return;
    setConversations((current) => current.map((conversation) => conversation.id === activeId && (conversation.mentionCount || 0) > 0 ? { ...conversation, mentionCount: 0 } : conversation));
  }, [activeId]);

  useEffect(() => {
    if (!activeId || isSavedActive || active || loading) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.getConversations()
        .then((data) => {
          if (cancelled) return;
          setConversations((previous) => reconcileConversationList(previous, data));
        })
        .catch(() => {});
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [active, activeId, isSavedActive, loading]);

  function toggleSavedPinned() {
    setSavedPinned((prev) => {
      const next = !prev;
      localStorage.setItem("ng_saved_chat_pinned", next ? "1" : "0");
      return next;
    });
  }

  function onGroupCreated(conv: Conversation) {
    setConversations((prev) => [conv, ...prev]);
    setInitialMessageId(null);
    setActiveId(conv.id);
    setGroupModalOpen(false);
  }

  const patchConversation = useCallback((id: string, patch: Partial<Conversation>) => {
    setConversations((prev) => {
      const index = prev.findIndex((conversation) => conversation.id === id);
      if (index < 0) return prev;
      if (patch.requestStatus === "hidden" || patch.requestStatus === "blocked") {
        return [...prev.slice(0, index), ...prev.slice(index + 1)];
      }
      const next = [...prev];
      next[index] = { ...prev[index], ...patch };
      return next;
    });
  }, []);

  const prefetchChat = useCallback((id: string) => {
    prefetchConversation(user?.id, id);
  }, [user?.id]);

  useEffect(() => {
    if (loading || conversations.length === 0) return;
    const visibleConversations = conversations.filter((conversation) => !conversation.archived);
    const candidate = visibleConversations.find((conversation) => conversation.unreadCount > 0)
      ?? visibleConversations[0];
    if (!candidate) return;

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(() => prefetchChat(candidate.id), { timeout: 2500 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(() => prefetchChat(candidate.id), 1200);
    return () => window.clearTimeout(timer);
  }, [conversations, loading, prefetchChat]);

  const selectConversation = useCallback((id: string) => {
    prefetchChat(id);
    setInitialMessageId(null);
    setActiveId(id);
    setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, mentionCount: 0 } : conversation));
    setShowInfo(false);
  }, [prefetchChat]);

  const toggleConversationPin = useCallback(async (id: string) => {
    try {
      const res = await api.toggleConversationPin(id);
      setConversations((prev) => prev.map((c) => c.id === id ? { ...c, pinned: res.pinned } : c));
    } catch {
      // Keep the current local state when the server is temporarily unavailable.
    }
  }, []);

  const toggleConversationMute = useCallback(async (id: string) => {
    try {
      const res = await api.toggleConversationMute(id);
      setConversations((prev) => prev.map((c) => c.id === id ? { ...c, muted: res.muted } : c));
      pushGlobalToast(res.muted ? "Уведомления чата отключены" : "Уведомления чата включены", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось изменить уведомления", "error");
    }
  }, []);

  const toggleConversationArchive = useCallback(async (id: string) => {
    try {
      const res = await api.toggleConversationArchive(id);
      setConversations((prev) => prev.map((c) => c.id === id ? { ...c, archived: res.archived } : c));
      pushGlobalToast(res.archived ? "Чат перемещён в архив" : "Чат возвращён из архива", "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось изменить архив", "error");
    }
  }, []);

  const setConversationFolder = useCallback(async (id: string, folder: "all" | "work" | "friends" | "family") => {
    try {
      const res = await api.setConversationFolder(id, folder);
      setConversations((prev) => prev.map((c) => c.id === id ? { ...c, folder: res.folder } : c));
      const labels = { all: "Без папки", work: "Работа", friends: "Друзья", family: "Семья" };
      pushGlobalToast(`Папка: ${labels[res.folder]}`, "success");
    } catch (error) {
      pushGlobalToast(error instanceof Error ? error.message : "Не удалось изменить папку", "error");
    }
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 pb-24 md:pb-4">
      <div className={`grid gap-4 h-[calc(100vh-7rem)] ${
        showInfo && !isSavedActive
          ? "md:grid-cols-[340px_1fr] lg:grid-cols-[340px_1fr_300px]"
          : "md:grid-cols-[340px_1fr]"
      }`}>
        {/* Left — chat list */}
        <div className={`glass-strong rounded-3xl overflow-hidden min-w-0 ${activeId ? "hidden md:block" : ""}`}>
          {loading ? (
            <ChatListSkeleton />
          ) : (
            <ChatList
              conversations={allConversations}
              activeId={activeId}
              onSelect={selectConversation}
              onCreateGroup={() => setGroupModalOpen(true)}
              onTogglePin={toggleConversationPin}
              onToggleMute={toggleConversationMute}
              onToggleArchive={toggleConversationArchive}
              onSetFolder={setConversationFolder}
              onPrefetch={prefetchChat}
            />
          )}
        </div>

        {/* Center — chat view */}
        <div className={`glass-strong rounded-3xl overflow-hidden min-w-0 ${!activeId ? "hidden md:block" : ""}`}>
          {isSavedActive ? (
            <SavedChatView
              pinned={savedPinned}
              onTogglePinned={toggleSavedPinned}
              onBack={() => setActiveId(null)}
            />
          ) : active ? (
            <ChatView
              key={active.id}
              conversation={active}
              initialMessageId={initialMessageId}
              onInitialMessageHandled={() => setInitialMessageId(null)}
              onBack={() => { setInitialMessageId(null); setActiveId(null); }}
              onToggleInfo={() => setShowInfo((v) => !v)}
              onConversationPatch={patchConversation}
            />
          ) : (
            <EmptyChat />
          )}
        </div>

        {/* Right — chat info */}
        <div className={`glass-strong rounded-3xl overflow-hidden min-w-0 hidden lg:block ${showInfo && !isSavedActive ? "lg:block" : "lg:hidden"}`}>
          {active && <ChatInfo conversation={active} onConversationPatch={patchConversation} />}
        </div>
      </div>

      <AnimatePresence>
        {showInfo && active && !isSavedActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9500] lg:hidden">
            <button type="button" aria-label="Закрыть информацию о чате" onClick={() => setShowInfo(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 300 }} className="absolute inset-y-0 right-0 w-full max-w-sm ng-solid shadow-2xl">
              <ChatInfo conversation={active} onConversationPatch={patchConversation} onClose={() => setShowInfo(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <NewGroupModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onCreated={onGroupCreated}
      />
    </div>
  );
}

function NewGroupModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown>[]>([]);
  const [creating, setCreating] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.searchUsers(query).then((data) => setResults(data as Record<string, unknown>[])).catch(() => setResults([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [open, query]);

  function toggleUser(user: Record<string, unknown>) {
    const id = String(user.id);
    setSelected((prev) => prev.some((u) => String(u.id) === id) ? prev.filter((u) => String(u.id) !== id) : [...prev, user]);
  }

  async function pickAvatar(file?: File) {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadMedia(file, "avatars");
      setAvatarUrl(url);
    } catch {
      pushGlobalToast("Не удалось загрузить аватар группы", "error");
    }
    setUploadingAvatar(false);
  }

  async function create() {
    if (selected.length === 0) return;
    setCreating(true);
    try {
      const conv = await api.createGroupConversation({
        title: title.trim() || "Новая группа",
        description: description.trim(),
        avatarUrl,
        userIds: selected.map((u) => String(u.id)),
      });
      setTitle("");
      setDescription("");
      setAvatarUrl(null);
      setQuery("");
      setSelected([]);
      if ((conv.skippedPrivacyCount ?? 0) > 0) pushGlobalToast(`Не добавлено из-за приватности: ${conv.skippedPrivacyCount}`, "info");
      onCreated(conv);
    } catch {
      // keep modal open
    }
    setCreating(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white transition"><X size={16} /></button>
            <h3 className="font-display font-bold text-xl flex items-center gap-2 mb-4"><Users size={18} className="text-neon-purple" /> Создать группу</h3>
            <div className="flex gap-4 mb-4">
              <button onClick={() => avatarInput.current?.click()} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-3xl glass grid place-items-center hover:brightness-110 transition">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : uploadingAvatar ? <Loader2 size={22} className="animate-spin text-white/45" /> : <Camera size={24} className="text-white/45" />}
              </button>
              <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => pickAvatar(e.target.files?.[0])} />
              <div className="flex-1 space-y-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название группы" className="w-full rounded-xl glass px-4 py-3 text-sm outline-none focus:border-neon-purple/40" />
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание группы" className="w-full rounded-xl glass px-4 py-3 text-sm outline-none focus:border-neon-purple/40" />
              </div>
            </div>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти пользователей по username…" className="w-full rounded-xl glass pl-9 pr-3 py-3 text-sm outline-none focus:border-neon-purple/40" />
            </div>
            {selected.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {selected.map((u) => (
                  <button key={String(u.id)} onClick={() => toggleUser(u)} className="rounded-full glass px-3 py-1.5 text-xs text-white/70 hover:text-red-300">
                    @{String(u.username ?? "")} ×
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-1.5 max-h-56 overflow-y-auto mb-4">
              {results.map((u) => {
                const active = selected.some((s) => String(s.id) === String(u.id));
                return (
                  <button key={String(u.id)} onClick={() => toggleUser(u)} className="w-full flex items-center gap-3 rounded-2xl glass px-3 py-2.5 text-left hover:brightness-110 transition">
                    {String(u.avatarUrl ?? u.avatar_url ?? "") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={String(u.avatarUrl ?? u.avatar_url)} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : <div className="h-9 w-9 rounded-full bg-neon-purple/15 grid place-items-center">✦</div>}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{String(u.displayName ?? u.display_name ?? u.username ?? "")}</div>
                      <div className="text-xs text-white/40 truncate">@{String(u.username ?? "")}</div>
                    </div>
                    {active && <Check size={16} className="text-neon-purple" />}
                  </button>
                );
              })}
            </div>
            <button onClick={create} disabled={creating || selected.length === 0} className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />} Создать
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EmptyChat() {
  return (
    <div className="h-full grid place-items-center p-8 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="h-20 w-20 rounded-full gradient-border grid place-items-center shadow-glow">
          <MessageSquare size={32} className="text-neon-purple" />
        </div>
        <div>
          <h3 className="font-display font-bold text-xl">Выбери чат</h3>
          <p className="text-white/50 text-sm mt-1 max-w-xs">
            Твои сообщения в реальном времени — синхронизированы с мобильным приложением.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function ChatListSkeleton() {
  return (
    <div className="p-4">
      <div className="skeleton h-7 w-32 rounded-lg mb-4" />
      <div className="skeleton h-10 rounded-xl mb-3" />
      <div className="flex gap-1.5 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-7 w-20 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="skeleton h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-24 rounded-full" />
              <div className="skeleton h-2.5 w-40 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
