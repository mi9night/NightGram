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
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppNotification } from "@/types";
import { api } from "@/lib/api";
import { useAuth } from "./AuthContext";
import { playNotificationSound, shouldPresentAppNotification } from "@/lib/notificationPreferences";
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
  const { status, user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const recentlyPresentedMentions = useRef(new Map<string, number>());

  const pushNotification = useCallback((n: AppNotification) => {
    setNotifications((prev) => {
      if (prev.some((x) => x.id === n.id)) return prev;
      const next = [n, ...prev].slice(0, 100);
      try { localStorage.setItem("ng_notifications_cache", JSON.stringify(next.slice(0, 80))); } catch { /* optional cache */ }
      return next;
    });
    if (!shouldPresentAppNotification(n, user?.notificationSettings)) return;
    if (n.type === "mention" && n.actionType?.startsWith("mention:")) {
      const messageId = n.actionType.split(":")[2];
      const presentedAt = messageId ? recentlyPresentedMentions.current.get(messageId) : undefined;
      if (presentedAt && Date.now() - presentedAt < 10_000) {
        recentlyPresentedMentions.current.delete(messageId);
        return;
      }
    }
    setToast(n);
    playNotificationSound(user?.notificationSettings, n.type === "mention");
    setTimeout(() => setToast((current) => current?.id === n.id ? null : current), 6000);
  }, [user?.notificationSettings]);

  // Fetch real notifications when auth is ready. The provider is mounted before
  // auth hydration finishes, so doing this once on mount can miss the token.
  useEffect(() => {
    if (status !== "authenticated") {
      setNotifications([]);
      return;
    }

    let active = true;
    let timer: number | undefined;
    let idleId: number | undefined;

    try {
      const cached = localStorage.getItem("ng_notifications_cache");
      if (cached) setNotifications(JSON.parse(cached) as AppNotification[]);
    } catch { /* optional cache */ }

    const load = () => {
      api.getNotifications()
        .then((data) => {
          if (!active) return;
          setNotifications(data);
          try { localStorage.setItem("ng_notifications_cache", JSON.stringify(data.slice(0, 80))); } catch { /* optional cache */ }
        })
        .catch(() => {});
    };

    const win = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (win.requestIdleCallback) idleId = win.requestIdleCallback(load, { timeout: 1800 });
    else timer = window.setTimeout(load, 850);

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      if (idleId !== undefined) win.cancelIdleCallback?.(idleId);
    };
  }, [status]);

  useEffect(() => {
    const onMentionPresented = (event: Event) => {
      const messageId = (event as CustomEvent<{ messageId?: string }>).detail?.messageId;
      if (!messageId) return;
      recentlyPresentedMentions.current.set(messageId, Date.now());
      window.setTimeout(() => recentlyPresentedMentions.current.delete(messageId), 12_000);
    };
    window.addEventListener("nightgram:mention-presented", onMentionPresented);
    return () => window.removeEventListener("nightgram:mention-presented", onMentionPresented);
  }, []);

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
