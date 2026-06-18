"use client";

// =============================================================================
//  NightGram Web — Notifications context
//  Holds the notification list, unread count, mark-as-read, and a toast.
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppNotification } from "@/types";
import { mockNotifications } from "@/lib/mock";

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  toast: AppNotification | null;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<AppNotification | null>(null);

  useEffect(() => {
    setNotifications(mockNotifications());
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  // Demo: show a toast notification after 8 seconds
  useEffect(() => {
    const t = setTimeout(() => {
      const demo: AppNotification = {
        id: "toast_demo",
        type: "like",
        title: "Nova Aurora",
        body: "оценил(а) твой пост 🔥",
        avatarUrl:
          "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop",
        read: false,
        createdAt: new Date().toISOString(),
      };
      setToast(demo);
      setNotifications((prev) => [demo, ...prev]);
      setTimeout(() => setToast(null), 6000);
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({ notifications, unreadCount, markAllRead, markRead, toast }),
    [notifications, unreadCount, markAllRead, markRead, toast],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within <NotificationsProvider>");
  return ctx;
}
