"use client";

// =============================================================================
//  NightGram Web — Socket.io provider
//  Connects the socket only when authenticated, disconnects on logout.
// =============================================================================

import { useEffect, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { CONNECTION_RECOVERY_EVENT } from "@/lib/serverHealth";
import { connectSocket, disconnectSocket, forceReconnectSocket, getSocket } from "@/lib/socket";

export function SocketProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== "authenticated") return;

    let lastConnectedAt = 0;
    const socket = getSocket();

    const announceReconnect = () => {
      const now = Date.now();
      const wasReconnect = lastConnectedAt > 0;
      lastConnectedAt = now;
      socket.emit("presence:ping");
      window.dispatchEvent(new CustomEvent("nightgram:socket-ready", {
        detail: { reconnected: wasReconnect, connectedAt: now },
      }));
    };

    const ensureConnected = () => {
      if (!navigator.onLine) return;
      const live = connectSocket();
      if (live.connected) announceReconnect();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      ensureConnected();
      window.dispatchEvent(new CustomEvent("nightgram:resume-sync"));
    };
    const onOnline = () => {
      ensureConnected();
      window.dispatchEvent(new CustomEvent("nightgram:resume-sync"));
    };
    const onForcedRecovery = () => {
      if (!navigator.onLine) return;
      forceReconnectSocket();
    };

    socket.on("connect", announceReconnect);
    const timer = window.setTimeout(ensureConnected, 450);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && socket.connected) socket.emit("presence:ping");
    }, 25000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener(CONNECTION_RECOVERY_EVENT, onForcedRecovery);

    return () => {
      window.clearTimeout(timer);
      if (interval) clearInterval(interval);
      socket.off("connect", announceReconnect);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(CONNECTION_RECOVERY_EVENT, onForcedRecovery);
    };
  }, [status]);

  // Fully disconnect when the user logs out.
  useEffect(() => {
    if (status === "unauthenticated") disconnectSocket();
  }, [status]);

  return <>{children}</>;
}

/** Convenience hook to access the live socket. */
export function useSocket() {
  return getSocket();
}
