// =============================================================================
//  NightGram Web — Socket.io client (real-time messaging + presence)
//  Connects to the same backend that powers the mobile app, syncing events.
// =============================================================================

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/types";

export type NgSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

let socket: NgSocket | null = null;

/** Singleton socket getter — authenticates with the stored JWT. */
export function getSocket(): NgSocket {
  if (socket) return socket;

  const token =
    typeof window !== "undefined" ? localStorage.getItem("ng_access_token") : null;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    autoConnect: false,
  });

  socket.on("connect", () => {
    // eslint-disable-next-line no-console
    console.log("[NightGram] socket connected:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    // eslint-disable-next-line no-console
    console.log("[NightGram] socket disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    // eslint-disable-next-line no-console
    console.warn("[NightGram] socket connect error:", err.message);
  });

  return socket;
}

/** Connect (called from the SocketProvider after login). */
export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

/** Disconnect + drop the reference (called on logout). */
export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
