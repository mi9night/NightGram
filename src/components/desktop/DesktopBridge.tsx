"use client";

import { useEffect } from "react";
import { useNotifications } from "@/context/NotificationsContext";
import { useAuth } from "@/context/AuthContext";
import { safeNotificationPreview } from "@/lib/notificationPreferences";

export function DesktopBridge() {
  const { toast } = useNotifications();
  const { user } = useAuth();

  useEffect(() => {
    if (!toast || document.hasFocus()) return;
    const body = safeNotificationPreview(user?.notificationSettings, toast.body || "Новое уведомление");
    if (window.nightgramDesktop) {
      void window.nightgramDesktop.showNotification({
        title: toast.title || "NightGram",
        body,
        silent: true,
      });
      return;
    }
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const notification = new Notification(toast.title || "NightGram", {
      body,
      tag: `nightgram:notification:${toast.id}`,
    });
    notification.onclick = () => {
      window.focus();
      window.location.href = "/notifications";
      notification.close();
    };
  }, [toast, user?.notificationSettings]);

  return null;
}
