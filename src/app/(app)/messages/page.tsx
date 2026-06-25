"use client";

// =============================================================================
//  NightGram Web — Messages page (3-panel real-time chat)
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, Search, Users, X, Loader2, Check, Camera } from "lucide-react";
import type { Conversation } from "@/types";
import { ChatList } from "@/components/messenger/ChatList";
import { ChatView } from "@/components/messenger/ChatView";
import { ChatInfo } from "@/components/messenger/ChatInfo";
import { SavedChatView } from "@/components/messenger/SavedChatView";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { normalizeMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { uploadMedia } from "@/lib/upload";
import { pushGlobalToast } from "@/lib/toast";

const SAVED_CHAT_ID = "__saved__";

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedPinned, setSavedPinned] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  useEffect(() => {
    setSavedPinned(localStorage.getItem("ng_saved_chat_pinned") === "1");
  }, []);

  useEffect(() => {
    let active = true;
    api.getConversations()
      .then((data) => {
        if (!active) return;
        setConversations(data);
        const queued = localStorage.getItem("ng_open_chat");
        const queuedPayload = localStorage.getItem("ng_open_chat_payload");
        if (queuedPayload) {
          localStorage.removeItem("ng_open_chat_payload");
          try {
            const parsed = JSON.parse(queuedPayload) as Conversation;
            setConversations((prev) => prev.some((c) => c.id === parsed.id) ? prev : [parsed, ...prev]);
          } catch { /* ignore stale payload */ }
        }
        if (queued) {
          localStorage.removeItem("ng_open_chat");
          setActiveId(queued);
        } else {
          setActiveId(SAVED_CHAT_ID);
        }
      })
      .catch(() => {
        if (active) setConversations([]);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onPush = ({ conversationId, message, muted }: { conversationId: string; message: unknown; muted?: boolean }) => {
      const msg = normalizeMessage(message);
      setConversations((prev) => prev.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          lastMessage: msg,
          muted: muted ?? c.muted,
          unreadCount: activeId === conversationId ? c.unreadCount : c.unreadCount + 1,
        };
      }));
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
    socket.on("message:push", onPush);
    socket.on("presence:update", onPresence);
    return () => {
      socket.off("message:push", onPush);
      socket.off("presence:update", onPresence);
    };
  }, [activeId, user?.id]);

  const savedConversation = useMemo<Conversation>(() => ({
    id: SAVED_CHAT_ID,
    type: "direct",
    title: "Избранное",
    avatarUrl: null,
    participants: user ? [{ id: user.id, username: user.username, avatarUrl: user.avatarUrl, nameColor: user.nameColor, role: "owner", isOnline: true }] : [],
    lastMessage: null,
    unreadCount: 0,
    pinned: savedPinned,
    folder: "all",
    isOnline: false,
  }), [savedPinned, user]);

  const allConversations = useMemo(
    () => [savedConversation, ...conversations],
    [conversations, savedConversation],
  );

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const isSavedActive = activeId === SAVED_CHAT_ID;

  useEffect(() => {
    if (!activeId || isSavedActive || active || loading) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.getConversations()
        .then((data) => {
          if (cancelled) return;
          setConversations(data);
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
    setActiveId(conv.id);
    setGroupModalOpen(false);
  }

  const patchConversation = useCallback((id: string, patch: Partial<Conversation>) => {
    setConversations((prev) => {
      if (patch.requestStatus === "hidden" || patch.requestStatus === "blocked") return prev.filter((c) => c.id !== id);
      return prev.map((c) => c.id === id ? { ...c, ...patch } : c);
    });
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
              onSelect={setActiveId}
              onCreateGroup={() => setGroupModalOpen(true)}
              onTogglePin={async (id) => {
                try {
                  const res = await api.toggleConversationPin(id);
                  setConversations((prev) => prev.map((c) => c.id === id ? { ...c, pinned: res.pinned } : c));
                } catch {}
              }}
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
              onBack={() => setActiveId(null)}
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
