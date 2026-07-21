"use client";

import { useState } from "react";

// =============================================================================
//  NightGram Web — Notifications page (full list)
// =============================================================================

import { motion } from "framer-motion";
import { Heart, MessageCircle, UserPlus, ShoppingBag, Info, Bell, CheckCheck } from "lucide-react";
import type { NotificationType } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { useNotifications } from "@/context/NotificationsContext";
import { timeAgo, cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { pushGlobalToast } from "@/lib/toast";
import { useRouter } from "next/navigation";

const ICONS: Record<NotificationType, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  mention: MessageCircle,
  store: ShoppingBag,
  system: Info,
  message: MessageCircle,
};

const COLORS: Record<NotificationType, string> = {
  like: "#ec4899",
  comment: "#a855f7",
  follow: "#22d3ee",
  mention: "#fbbf24",
  store: "#6366f1",
  system: "#a855f7",
  message: "#ec4899",
};

export default function NotificationsPage() {
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const router = useRouter();
  const [actionedIds, setActionedIds] = useState<Set<string>>(new Set());

  function notificationHref(n: { type: string; actorId?: string | null; actionType?: string | null }) {
    if (n.type === "follow" && n.actorId) return `/profile/${n.actorId}`;
    if (n.type === "message") return "/messages";
    if (n.type === "mention" && n.actionType?.startsWith("mention:")) return "/messages";
    if (n.type === "store") return "/store";
    if (n.type === "like" || n.type === "comment" || n.type === "mention") return "/feed";
    return "/notifications";
  }

  function openNotification(n: { id: string; type: string; actorId?: string | null; actionType?: string | null }) {
    markRead(n.id);
    if (n.type === "mention" && n.actionType?.startsWith("mention:")) {
      const [, conversationId, messageId] = n.actionType.split(":");
      if (conversationId) localStorage.setItem("ng_open_chat", conversationId);
      if (messageId) localStorage.setItem("ng_open_message", messageId);
    }
    router.push(notificationHref(n));
  }

  async function followBack(actorId?: string | null, notificationId?: string) {
    if (!actorId) return;
    try {
      const res = await api.socialAction("friend", actorId);
      pushGlobalToast(res.friends ? "Вы теперь друзья" : "Вы подписались в ответ", "success");
      if (notificationId) setActionedIds((prev) => new Set(prev).add(notificationId));
    } catch {
      pushGlobalToast("Не удалось добавить в ответ", "error");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-5"
      >
        <div className="flex items-center gap-2.5">
          <Bell size={22} className="text-neon-purple" />
          <div>
            <h1 className="font-display font-bold text-2xl">Уведомления</h1>
            <p className="text-sm text-white/45">
              {unreadCount > 0 ? `${unreadCount} непрочитанных` : "Все прочитано ✦"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="btn-ghost px-3.5 py-2 text-sm flex items-center gap-1.5"
          >
            <CheckCheck size={14} /> Прочитать все
          </button>
        )}
      </motion.div>

      <div className="space-y-2">
        {notifications.length === 0 ? (
          <div className="text-center py-20 text-white/40">
            <Bell size={40} className="mx-auto mb-4 opacity-50" />
            <p>Уведомлений пока нет</p>
          </div>
        ) : (
          notifications.map((n, i) => {
            const Icon = ICONS[n.type];
            const color = COLORS[n.type];
            return (
              <motion.button
                key={n.id}
                layout
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                onClick={() => openNotification(n)}
                className={cn(
                  "ng-notif-card w-full flex items-center gap-3.5 rounded-2xl p-3.5 text-left",
                  !n.read && "is-unread",
                )}
              >
                <div className="relative shrink-0">
                  <GlowAvatar src={n.avatarUrl ?? null} alt={n.title} size={48} glow={n.type === "system" ? "purple" : undefined} />
                  <span
                    className="absolute -bottom-1 -right-1 grid place-items-center h-6 w-6 rounded-full border-2 border-midnight-900"
                    style={{ background: color }}
                  >
                    <Icon size={12} className="text-white" />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-semibold">{n.title}</span>{" "}
                    <span className="text-white/65">{n.body}</span>
                  </div>
                  <div className="text-[11px] text-white/35 mt-0.5">{timeAgo(n.createdAt)}</div>
                  {n.actionType === "follow_back" && n.actorId && (
                    <span
                      onClick={(e) => { e.stopPropagation(); followBack(n.actorId, n.id); markRead(n.id); }}
                      className="mt-2 inline-flex rounded-lg bg-neon-purple/15 px-2.5 py-1 text-[11px] font-semibold text-neon-purple hover:bg-neon-purple/25"
                    >
                      {actionedIds.has(n.id) ? "Готово" : "Добавить в ответ"}
                    </span>
                  )}
                </div>
                {!n.read && (
                  <span className="h-2.5 w-2.5 rounded-full bg-neon-purple shrink-0" style={{ boxShadow: "0 0 8px var(--accent-main)" }} />
                )}
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}
