// =============================================================================
//  NightGram Web — Socket.io client (real-time messaging + presence)
//  Connects to the same backend that powers the mobile app, syncing events.
// =============================================================================

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/types";
import { getStoredAccessToken } from "@/lib/api";

export type NgSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const DEFAULT_SOCKET_URL = "https://nightgram-production-0ceb.up.railway.app";
const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL || DEFAULT_SOCKET_URL).replace(/\/$/, "");

let socket: NgSocket | null = null;

/** Singleton socket getter — authenticates with the stored JWT. */
export function getSocket(): NgSocket {
  if (socket) return socket;

  const token = getStoredAccessToken();

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.35,
    timeout: 15000,
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
  s.auth = { token: getStoredAccessToken() };
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

export function forceReconnectSocket() {
  const s = getSocket();
  s.auth = { token: getStoredAccessToken() };
  s.disconnect();
  s.connect();
  return s;
}

export function refreshSocketAuth() {
  if (!socket) return;
  socket.auth = { token: getStoredAccessToken() };
  if (socket.connected) {
    socket.disconnect();
    socket.connect();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("nightgram:auth-token-refresh", refreshSocketAuth);
}
