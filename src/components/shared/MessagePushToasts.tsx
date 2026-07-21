"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AtSign, MessageCircle, X } from "lucide-react";
import type { Message } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { GlowAvatar } from "./GlowAvatar";
import {
  playNotificationSound,
  safeNotificationPreview,
  shouldPresentMessageNotification,
  type MessageConversationKind,
} from "@/lib/notificationPreferences";

interface PushToast {
  id: string;
  conversationId: string;
  messageId: string;
  title: string;
  body: string;
  avatarUrl: string | null;
  mentioned: boolean;
}

function containsMention(text: string | undefined, username: string | undefined): boolean {
  if (!text || !username) return false;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,!?;:])`, "i").test(text);
}

export function MessagePushToasts() {
  const { user, status } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<PushToast[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setActiveConversationId(localStorage.getItem("ng_active_conversation"));
    read();
    const onActive = (e: Event) => setActiveConversationId(((e as CustomEvent<{ conversationId: string | null }>).detail?.conversationId) ?? null);
    window.addEventListener("nightgram:active-conversation", onActive);
    return () => window.removeEventListener("nightgram:active-conversation", onActive);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = getSocket();

    const openConversation = (conversationId: string, messageId: string) => {
      localStorage.setItem("ng_open_chat", conversationId);
      localStorage.setItem("ng_open_message", messageId);
      router.push("/messages");
    };

    const presentNative = async (item: PushToast) => {
      if (document.hasFocus() || user?.notificationSettings?.push === false) return;
      const body = safeNotificationPreview(user?.notificationSettings, item.body);
      if (window.nightgramDesktop) {
        await window.nightgramDesktop.showNotification({ title: item.title, body, silent: true });
        return;
      }
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const notification = new Notification(item.title, { body, icon: item.avatarUrl || "/icon.svg", tag: `nightgram:${item.conversationId}` });
      notification.onclick = () => {
        window.focus();
        openConversation(item.conversationId, item.messageId);
        notification.close();
      };
    };

    const onPush = ({
      conversationId,
      message,
      muted,
      conversationTitle,
      avatarUrl,
      conversationKind,
    }: {
      conversationId: string;
      message: Message;
      muted?: boolean;
      conversationTitle?: string;
      avatarUrl?: string | null;
      conversationKind?: MessageConversationKind;
    }) => {
      if (message.senderId === user?.id) return;
      const isActiveChat = activeConversationId === conversationId;
      if (!isActiveChat) {
        socket.emit("message:delivered", { messageId: message.id, conversationId });
        window.dispatchEvent(new CustomEvent("nightgram:message-unread", { detail: { muted: Boolean(muted), conversationId } }));
      }
      if (isActiveChat) return;

      const mentioned = Boolean(message.mentionedUserIds?.includes(user?.id || "")) || containsMention(message.text, user?.username);
      const allowed = shouldPresentMessageNotification({
        settings: user?.notificationSettings,
        kind: conversationKind || "group",
        mentioned,
        muted,
        focused: document.hasFocus(),
      });
      if (!allowed) return;

      const rawBody = message.text || (message.attachmentUrl ? "Медиафайл" : message.type === "poll" ? "Новый опрос" : "Новое сообщение");
      const item: PushToast = {
        id: `${conversationId}:${message.id}:${Date.now()}`,
        conversationId,
        messageId: message.id,
        title: conversationTitle || (mentioned ? "Вас упомянули" : "Новое сообщение"),
        body: safeNotificationPreview(user?.notificationSettings, rawBody),
        avatarUrl: avatarUrl ?? null,
        mentioned,
      };
      setItems((prev) => [...prev, item].slice(-6));
      if (mentioned) window.dispatchEvent(new CustomEvent("nightgram:mention-presented", { detail: { messageId: message.id } }));
      playNotificationSound(user?.notificationSettings, mentioned);
      void presentNative(item);
      window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== item.id)), 5200);
    };

    socket.on("message:push", onPush);
    return () => { socket.off("message:push", onPush); };
  }, [activeConversationId, router, status, user?.id, user?.notificationSettings, user?.username]);

  const visible = useMemo(() => items.slice(-3), [items]);

  function openConversation(item: PushToast) {
    localStorage.setItem("ng_open_chat", item.conversationId);
    localStorage.setItem("ng_open_message", item.messageId);
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    router.push("/messages");
  }

  return (
    <div className="fixed bottom-5 right-4 z-[10085] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {visible.map((item) => {
          const Icon = item.mentioned ? AtSign : MessageCircle;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 32, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 32, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              onClick={() => openConversation(item)}
              className="pointer-events-auto cursor-pointer ng-solid rounded-2xl p-3.5 shadow-glow-lg flex items-center gap-3"
            >
              <GlowAvatar src={item.avatarUrl} alt={item.title} size={40} glow={item.mentioned ? "gold" : "purple"} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                  <Icon size={13} className={item.mentioned ? "text-yellow-300" : "text-neon-purple"} /> {item.title}
                </div>
                <div className="text-xs text-white/60 truncate">{item.body}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setItems((prev) => prev.filter((x) => x.id !== item.id)); }} className="grid h-7 w-7 place-items-center rounded-lg glass text-white/45 hover:text-white">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
