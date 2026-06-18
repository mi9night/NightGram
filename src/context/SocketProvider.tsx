"use client";

// =============================================================================
//  NightGram Web — Socket.io provider
//  Connects the socket only when authenticated, disconnects on logout.
// =============================================================================

import { useEffect, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { connectSocket, disconnectSocket, getSocket } from "@/lib/socket";

export function SocketProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = connectSocket();
    // heartbeat / presence ping every 25s
    const interval = setInterval(() => socket.emit("presence:ping"), 25000);
    return () => {
      clearInterval(interval);
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
