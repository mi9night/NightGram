"use client";

// =============================================================================
//  NotificationBell — bell icon with unread badge + dropdown panel.
// =============================================================================

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Heart, MessageCircle, UserPlus, ShoppingBag, Info, Check, CheckCheck } from "lucide-react";
import type { NotificationType } from "@/types";
import { useNotifications } from "@/context/NotificationsContext";
import { GlowAvatar } from "./GlowAvatar";
import { timeAgo, cn } from "@/lib/utils";
import Link from "next/link";

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

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative grid place-items-center h-9 w-9 rounded-xl glass text-white/60 hover:text-white transition"
        title="Уведомления"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 grid place-items-center min-w-[16px] h-[16px] px-1 rounded-full bg-neon-pink text-[9px] font-bold text-white"
            style={{ boxShadow: "0 0 8px var(--accent-tertiary)" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-[70] w-80 max-w-[calc(100vw-2rem)] ng-solid rounded-2xl shadow-glow-lg"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b ng-divider">
              <span className="font-display font-bold text-sm">Уведомления</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-neon-purple hover:underline flex items-center gap-1"
                >
                  <CheckCheck size={12} /> Прочитать все
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-center text-white/40 text-sm py-8">
                  Нет уведомлений
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = ICONS[n.type];
                  const color = COLORS[n.type];
                  return (
                    <button
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={cn(
                        "ng-notif-item w-full flex items-center gap-3 px-4 py-3 text-left border-b ng-divider last:border-0",
                        !n.read && "is-unread",
                      )}
                    >
                      <div className="relative shrink-0">
                        <GlowAvatar src={n.avatarUrl ?? null} alt={n.title} size={38} />
                        <span
                          className="absolute -bottom-1 -right-1 grid place-items-center h-5 w-5 rounded-full border-2 border-midnight-900"
                          style={{ background: color }}
                        >
                          <Icon size={10} className="text-white" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <span className="font-semibold">{n.title}</span>{" "}
                          <span className="text-white/60">{n.body}</span>
                        </div>
                        <div className="text-[10px] text-white/35 mt-0.5">{timeAgo(n.createdAt)}</div>
                      </div>
                      {!n.read && (
                        <span className="h-2 w-2 rounded-full bg-neon-purple shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center py-2.5 text-xs text-neon-purple hover:bg-neon-purple/5 transition border-t ng-divider"
            >
              Все уведомления →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
