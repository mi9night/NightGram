"use client";

// =============================================================================
//  NightGram Web — Notifications context
//  Holds the notification list, unread count, mark-as-read, and a toast.
//  Fetches real notifications from the API and listens for Socket.io pushes.
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
import { api } from "@/lib/api";
import { useAuth } from "./AuthContext";
import { getSocket } from "@/lib/socket";

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  toast: AppNotification | null;
  pushNotification: (n: AppNotification) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<AppNotification | null>(null);

  const pushNotification = useCallback((n: AppNotification) => {
    setNotifications((prev) => {
      if (prev.some((x) => x.id === n.id)) return prev;
      return [n, ...prev];
    });
    setToast(n);
    setTimeout(() => setToast(null), 6000);
  }, []);

  // Fetch real notifications when auth is ready. The provider is mounted before
  // auth hydration finishes, so doing this once on mount can miss the token.
  useEffect(() => {
    if (status !== "authenticated") {
      setNotifications([]);
      return;
    }

    let active = true;
    api.getNotifications()
      .then((data) => {
        if (active) setNotifications(data);
      })
      .catch(() => {
        if (active) setNotifications([]);
      });

    return () => {
      active = false;
    };
  }, [status]);

  // Realtime notifications from backend/admin broadcasts.
  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = getSocket();
    socket.on("notification:new", pushNotification);
    return () => {
      socket.off("notification:new", pushNotification);
    };
  }, [pushNotification, status]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    api.markAllNotificationsRead().catch(() => {});
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    api.markNotificationRead(id).catch(() => {});
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({ notifications, unreadCount, markAllRead, markRead, toast, pushNotification }),
    [notifications, unreadCount, markAllRead, markRead, toast, pushNotification],
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
