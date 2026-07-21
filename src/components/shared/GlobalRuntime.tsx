"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const NotificationToast = dynamic(() => import("@/components/shared/NotificationToast").then((m) => m.NotificationToast), { ssr: false });
const GlobalToast = dynamic(() => import("@/components/shared/GlobalToast").then((m) => m.GlobalToast), { ssr: false });
const MessagePushToasts = dynamic(() => import("@/components/shared/MessagePushToasts").then((m) => m.MessagePushToasts), { ssr: false });
const GlobalCallManager = dynamic(() => import("@/components/shared/GlobalCallManager").then((m) => m.GlobalCallManager), { ssr: false });
const DesktopBridge = dynamic(() => import("@/components/desktop/DesktopBridge").then((m) => m.DesktopBridge), { ssr: false });
const NetworkStatusBar = dynamic(() => import("@/components/shared/NetworkStatusBar").then((m) => m.NetworkStatusBar), { ssr: false });
const OutboxFlusher = dynamic(() => import("@/components/shared/OutboxFlusher").then((m) => m.OutboxFlusher), { ssr: false });

function useRuntimeIdleReady(enabled: boolean) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }

    let cancelled = false;
    const activate = () => {
      if (!cancelled) setReady(true);
    };

    const win = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(activate, { timeout: 1400 });
      return () => {
        cancelled = true;
        win.cancelIdleCallback?.(id);
      };
    }

    const timeout = win.setTimeout(activate, 650);
    return () => {
      cancelled = true;
      win.clearTimeout(timeout);
    };
  }, [enabled]);

  return ready;
}

export function GlobalRuntime() {
  const { status } = useAuth();
  const authenticated = status === "authenticated";
  const heavyRuntimeReady = useRuntimeIdleReady(authenticated);

  return (
    <>
      <GlobalToast />
      {authenticated && <NetworkStatusBar />}
      {authenticated && <OutboxFlusher />}
      {authenticated && <NotificationToast />}
      {authenticated && <DesktopBridge />}
      {heavyRuntimeReady && (
        <>
          <MessagePushToasts />
          <GlobalCallManager />
        </>
      )}
    </>
  );
}
