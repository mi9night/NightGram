"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/lib/socket";
import { readMessageOutbox, removeOutboxMessage, upsertOutboxMessage, type OutboxMessage } from "@/lib/messageOutbox";

const ACK_TIMEOUT_MS = 14_000;
const SEND_GAP_MS = 160;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function OutboxFlusher() {
  const { user, status } = useAuth();
  const flushingRef = useRef(false);
  const socket = getSocket();

  const sendOne = useCallback((message: OutboxMessage): Promise<void> => new Promise((resolve) => {
    if (!navigator.onLine || !socket.connected) {
      upsertOutboxMessage(user?.id, { ...message, status: "queued" });
      resolve();
      return;
    }

    const clientId = message.clientId || message.id;
    upsertOutboxMessage(user?.id, { ...message, clientId, status: "sending" });
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      resolve();
      return true;
    };
    const timeout = window.setTimeout(() => {
      if (!finish()) return;
      const statusAfterTimeout = navigator.onLine && socket.connected ? "failed" as const : "queued" as const;
      upsertOutboxMessage(user?.id, { ...message, clientId, status: statusAfterTimeout });
    }, ACK_TIMEOUT_MS);

    socket.emit("message:send", {
      conversationId: message.conversationId,
      clientId,
      text: message.text,
      type: message.type,
      attachmentUrl: message.attachmentUrl,
      replyTo: message.replyTo?.id,
    }, (ack) => {
      window.clearTimeout(timeout);
      if (!finish()) return;
      if (ack?.error) {
        upsertOutboxMessage(user?.id, { ...message, clientId, status: "failed" });
        return;
      }
      removeOutboxMessage(user?.id, clientId);
    });
  }), [socket, user?.id]);

  const flush = useCallback(async () => {
    if (status !== "authenticated" || flushingRef.current || !navigator.onLine || !socket.connected) return;
    const queued = readMessageOutbox(user?.id).filter((message) => message.status === "queued");
    if (queued.length === 0) return;

    flushingRef.current = true;
    try {
      for (const message of queued) {
        if (!navigator.onLine || !socket.connected) break;
        await sendOne(message);
        await pause(SEND_GAP_MS);
      }
    } finally {
      flushingRef.current = false;
    }
  }, [sendOne, socket, status, user?.id]);

  useEffect(() => {
    if (status !== "authenticated") return;
    for (const message of readMessageOutbox(user?.id)) {
      if (message.status === "sending") upsertOutboxMessage(user?.id, { ...message, status: "queued" });
    }

    const onReady = () => { void flush(); };
    socket.on("connect", onReady);
    window.addEventListener("online", onReady);
    window.addEventListener("nightgram:socket-ready", onReady);
    if (socket.connected) void flush();

    return () => {
      socket.off("connect", onReady);
      window.removeEventListener("online", onReady);
      window.removeEventListener("nightgram:socket-ready", onReady);
    };
  }, [flush, socket, status, user?.id]);

  return null;
}
