"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Send, ServerOff, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/lib/socket";
import { readMessageOutbox, subscribeToOutbox } from "@/lib/messageOutbox";
import {
  getLatestServerHealth,
  probeServerHealth,
  requestConnectionRecovery,
  subscribeToServerHealth,
  type ServerHealthSnapshot,
} from "@/lib/serverHealth";
import { cn } from "@/lib/utils";

type ConnectionMode = "online" | "offline" | "connecting" | "restored";

export function NetworkStatusBar() {
  const { user, status } = useAuth();
  const [mode, setMode] = useState<ConnectionMode>(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
    return "connecting";
  });
  const [browserOnline, setBrowserOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [socketConnected, setSocketConnected] = useState(false);
  const [serverHealth, setServerHealth] = useState<ServerHealthSnapshot>(() => getLatestServerHealth());
  const [outboxCount, setOutboxCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [manualRecovery, setManualRecovery] = useState(false);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousModeRef = useRef<ConnectionMode>(mode);
  const previousHealthRef = useRef(serverHealth.status);

  const recover = useCallback(async (source = "manual") => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setManualRecovery(true);
    requestConnectionRecovery(source);
    try {
      await probeServerHealth({ reason: source, timeoutMs: 7_500 });
    } finally {
      setManualRecovery(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = getSocket();
    const updateOutbox = () => {
      const messages = readMessageOutbox(user?.id);
      setOutboxCount(messages.length);
      setQueuedCount(messages.filter((message) => message.status === "queued" || message.status === "sending").length);
    };
    updateOutbox();
    const unsubscribeOutbox = subscribeToOutbox(({ count, queuedCount: nextQueuedCount }) => {
      setOutboxCount(count);
      setQueuedCount(nextQueuedCount);
    });
    const unsubscribeHealth = subscribeToServerHealth((snapshot) => {
      const wasUnavailable = previousHealthRef.current === "unreachable" || previousHealthRef.current === "degraded";
      previousHealthRef.current = snapshot.status;
      setServerHealth(snapshot);
      if (snapshot.status === "healthy" && wasUnavailable) {
        if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
        previousModeRef.current = "restored";
        setMode("restored");
        requestConnectionRecovery("server-restored");
        window.dispatchEvent(new CustomEvent("nightgram:resume-sync"));
        restoreTimerRef.current = setTimeout(() => {
          previousModeRef.current = socket.connected ? "online" : "connecting";
          setMode(socket.connected ? "online" : "connecting");
        }, 2400);
      }
    });

    const setConnected = () => {
      setSocketConnected(true);
      const recovered = previousModeRef.current === "offline" || previousModeRef.current === "connecting";
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      if (recovered) {
        previousModeRef.current = "restored";
        setMode("restored");
        restoreTimerRef.current = setTimeout(() => {
          previousModeRef.current = "online";
          setMode("online");
        }, 2200);
      } else {
        previousModeRef.current = "online";
        setMode("online");
      }
    };
    const setOffline = () => {
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      setBrowserOnline(false);
      setSocketConnected(false);
      previousModeRef.current = "offline";
      setMode("offline");
    };
    const setConnecting = () => {
      setSocketConnected(false);
      if (!navigator.onLine) return setOffline();
      previousModeRef.current = "connecting";
      setMode("connecting");
    };
    const onOnline = () => {
      setBrowserOnline(true);
      setConnecting();
      void recover("browser-online");
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const age = Date.now() - (getLatestServerHealth().checkedAt || 0);
      if (age > 15_000) void recover("resume");
    };

    socket.on("connect", setConnected);
    socket.on("disconnect", setConnecting);
    socket.on("connect_error", setConnecting);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", setOffline);
    document.addEventListener("visibilitychange", onVisibility);

    setBrowserOnline(navigator.onLine);
    setSocketConnected(socket.connected);
    if (!navigator.onLine) setOffline();
    else if (socket.connected) setConnected();
    else setConnecting();

    const initialTimer = window.setTimeout(() => void probeServerHealth({ reason: "initial" }), 350);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const snapshot = getLatestServerHealth();
      const age = Date.now() - (snapshot.checkedAt || 0);
      const interval = snapshot.status === "healthy" ? 45_000 : 12_000;
      if (age >= interval) void probeServerHealth({ reason: "heartbeat" });
    }, 5_000);

    return () => {
      unsubscribeOutbox();
      unsubscribeHealth();
      socket.off("connect", setConnected);
      socket.off("disconnect", setConnecting);
      socket.off("connect_error", setConnecting);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", setOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(initialTimer);
      window.clearInterval(heartbeat);
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    };
  }, [recover, status, user?.id]);

  const presentation = useMemo(() => {
    if (!browserOnline || mode === "offline") return {
      icon: <WifiOff size={14} />,
      text: outboxCount > 0 ? `Нет интернета · в очереди ${outboxCount}` : "Нет интернета · показываем сохранённые данные",
      classes: "border-amber-300/25 bg-amber-950/90 text-amber-100",
      action: false,
    };
    if (serverHealth.status === "unreachable") return {
      icon: <ServerOff size={14} />,
      text: outboxCount > 0 ? `Сервер недоступен · в очереди ${outboxCount}` : (serverHealth.message || "Сервер NightGram временно недоступен"),
      classes: "border-red-300/25 bg-red-950/90 text-red-100",
      action: true,
    };
    if (serverHealth.status === "degraded") return {
      icon: <AlertTriangle size={14} />,
      text: serverHealth.message || "Сервер работает с ограничениями",
      classes: "border-amber-300/25 bg-amber-950/90 text-amber-100",
      action: true,
    };
    if (serverHealth.status === "checking" && serverHealth.lastHealthyAt === null) return {
      icon: <Loader2 size={14} className="animate-spin" />,
      text: "Проверяем доступность сервера…",
      classes: "border-white/15 bg-[#120d1d]/92 text-white/75",
      action: false,
    };
    if (!socketConnected || mode === "connecting") return {
      icon: <Loader2 size={14} className="animate-spin" />,
      text: outboxCount > 0 ? `Восстанавливаем сообщения · ожидают ${outboxCount}` : "API доступен · восстанавливаем сообщения…",
      classes: "border-white/15 bg-[#120d1d]/92 text-white/75",
      action: true,
    };
    if (mode === "restored") return {
      icon: outboxCount > 0 ? <Send size={14} /> : <Wifi size={14} />,
      text: queuedCount > 0 ? `Связь восстановлена · отправляем ${queuedCount}` : "Соединение восстановлено",
      classes: "border-emerald-300/25 bg-emerald-950/90 text-emerald-100",
      action: false,
    };
    if (queuedCount > 0) return {
      icon: <Send size={14} />,
      text: `Отправляем сообщения: ${queuedCount}`,
      classes: "border-neon-purple/25 bg-[#160d24]/92 text-purple-100",
      action: false,
    };
    if (outboxCount > 0) return {
      icon: <WifiOff size={14} />,
      text: `Не отправлено: ${outboxCount} · откройте чат для повтора`,
      classes: "border-red-300/25 bg-red-950/90 text-red-100",
      action: true,
    };
    return null;
  }, [browserOnline, mode, outboxCount, queuedCount, serverHealth, socketConnected]);

  if (status !== "authenticated" || !presentation) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[12000] flex justify-center px-3">
      <div className={cn("pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-2xl backdrop-blur-xl", presentation.classes)}>
        {presentation.icon}
        <span className="truncate">{presentation.text}</span>
        {presentation.action && (
          <button
            type="button"
            disabled={manualRecovery}
            onClick={() => void recover("manual")}
            className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-current/20 bg-white/5 px-2 py-1 text-[10px] font-semibold transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw size={11} className={manualRecovery ? "animate-spin" : ""} />
            Повторить
          </button>
        )}
      </div>
    </div>
  );
}
