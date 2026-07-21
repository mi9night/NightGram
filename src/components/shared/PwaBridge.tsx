"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { syncExistingWebPush } from "@/lib/pushNotifications";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaBridge() {
  const { status } = useAuth();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const ios = useMemo(() => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent), []);

  useEffect(() => {
    const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (window.nightgramNative?.isNative || capacitor?.isNativePlatform?.()) return;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    if (isStandalone() || localStorage.getItem("ng_pwa_install_dismissed") === "1") return;
    const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios && mobile) setVisible(true);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [ios]);

  useEffect(() => {
    if (status !== "authenticated" || !("serviceWorker" in navigator)) return;
    void syncExistingWebPush();

    const onMessage = (event: MessageEvent<{ type?: string; payload?: Record<string, unknown> }>) => {
      const payload = event.data?.payload;
      if (!payload) return;
      if (event.data?.type === "nightgram:push" || event.data?.type === "nightgram:notification-click") {
        if (payload.kind === "call") {
          window.dispatchEvent(new CustomEvent("nightgram:incoming-call", { detail: payload }));
          const notificationAction = String(payload.notificationAction || "");
          if (notificationAction === "accept-call") {
            window.setTimeout(() => window.dispatchEvent(new CustomEvent("nightgram:accept-call", { detail: payload })), 0);
          } else if (notificationAction === "reject-call") {
            window.setTimeout(() => window.dispatchEvent(new CustomEvent("nightgram:reject-call", { detail: payload })), 0);
          }
        } else {
          window.dispatchEvent(new CustomEvent("nightgram:toast", {
            detail: { message: String(payload.title || payload.body || "Новое уведомление"), type: "info" },
          }));
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [status]);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setVisible(false);
    setInstallPrompt(null);
  }

  function dismiss() {
    localStorage.setItem("ng_pwa_install_dismissed", "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[10080] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0b0814]/95 p-3 shadow-2xl backdrop-blur-xl">
      <button onClick={dismiss} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white" aria-label="Закрыть">
        <X size={14} />
      </button>
      <div className="flex items-center gap-3 pr-8">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-200">
          {ios && !installPrompt ? <Share2 size={18} /> : <Download size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">NightGram на телефоне</div>
          <div className="mt-0.5 text-xs leading-relaxed text-white/55">
            {ios && !installPrompt
              ? "В Safari нажми «Поделиться», затем «На экран Домой»."
              : "Установи мобильную PWA-версию как обычное приложение."}
          </div>
        </div>
        {installPrompt && <button onClick={install} className="rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white">Установить</button>}
      </div>
    </div>
  );
}
