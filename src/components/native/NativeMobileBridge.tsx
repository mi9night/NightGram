"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

type NativeToken = { value: string; platform: "android" | "ios"; voip?: boolean };
type NativePushState = { supported: boolean; permission: NotificationPermission | "unsupported"; serverEnabled: boolean; subscribed: boolean };

const TOKEN_KEY = "nightgram_native_push_token";
const VOIP_TOKEN_KEY = "nightgram_native_voip_token";
const PUSH_ENABLED_KEY = "nightgram_native_push_enabled";

function emitToast(message: string, type: "info" | "success" | "error" = "info") {
  window.dispatchEvent(new CustomEvent("nightgram:toast", { detail: { message, type } }));
}

function routeNativeUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return;
  try {
    const url = new URL(raw, window.location.origin);
    let path = `${url.pathname}${url.search}${url.hash}`;
    if (url.protocol === "nightgram:") path = `/${url.host}${url.pathname}${url.search}${url.hash}`.replace(/\/+/g, "/");
    if (!path.startsWith("/")) path = `/${path}`;
    window.location.assign(path);
  } catch {
    if (raw.startsWith("/")) window.location.assign(raw);
  }
}

function dispatchPushPayload(payload: Record<string, unknown>, actionId?: string) {
  const normalizedAction = String(actionId || payload.notificationAction || "");
  if (payload.kind === "call" || payload.callId) {
    const detail = { ...payload, notificationAction: normalizedAction };
    window.dispatchEvent(new CustomEvent("nightgram:incoming-call", { detail }));
    if (/accept|answer/i.test(normalizedAction)) {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("nightgram:accept-call", { detail })), 0);
    } else if (/reject|decline|end/i.test(normalizedAction)) {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("nightgram:reject-call", { detail })), 0);
    }
  }
  const url = payload.url || payload.deepLink;
  if (url) routeNativeUrl(url);
}

export function NativeMobileBridge() {
  const { status, user } = useAuth();

  useEffect(() => {
    let disposed = false;
    const removers: Array<() => void> = [];
    let nativeToken: NativeToken | null = null;
    let voipToken: NativeToken | null = null;
    let deviceId = "";
    let appVersion = "3.4.0";
    let platform: "android" | "ios" = "android";
    const registrationWaiters: Array<{ resolve: (token: NativeToken) => void; reject: (error: Error) => void }> = [];

    async function init() {
      const [{ Capacitor, registerPlugin }, { App }, { Device }, { Haptics, ImpactStyle }, { Network }, { Preferences }, { PushNotifications }, { Share }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
        import("@capacitor/core"),
        import("@capacitor/app"),
        import("@capacitor/device"),
        import("@capacitor/haptics"),
        import("@capacitor/network"),
        import("@capacitor/preferences"),
        import("@capacitor/push-notifications"),
        import("@capacitor/share"),
        import("@capacitor/splash-screen"),
        import("@capacitor/status-bar"),
      ]);
      if (!Capacitor.isNativePlatform() || disposed) return;

      platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
      document.documentElement.classList.add("nightgram-native", `nightgram-native-${platform}`);
      await Promise.allSettled([
        StatusBar.setStyle({ style: Style.Light }),
        StatusBar.setOverlaysWebView({ overlay: true }),
        platform === "android" ? StatusBar.setBackgroundColor({ color: "#08070f" }) : Promise.resolve(),
        SplashScreen.hide(),
      ]);

      const [device, appInfo, storedToken, storedVoip] = await Promise.all([
        Device.getId().catch(() => ({ identifier: "unknown" })),
        App.getInfo().catch(() => ({ version: "3.4.0", build: "30400", name: "NightGram", id: "app.nightgram.mobile" })),
        Preferences.get({ key: TOKEN_KEY }),
        Preferences.get({ key: VOIP_TOKEN_KEY }),
      ]);
      deviceId = device.identifier;
      appVersion = `${appInfo.version} (${appInfo.build})`;
      if (storedToken.value) nativeToken = { value: storedToken.value, platform };
      if (storedVoip.value) voipToken = { value: storedVoip.value, platform: "ios", voip: true };

      async function saveToken(token: NativeToken) {
        const enabled = (await Preferences.get({ key: PUSH_ENABLED_KEY })).value !== "0";
        if (!enabled || status !== "authenticated") return;
        await api.saveNativePushToken({
          token: token.value,
          platform: token.platform,
          deviceId,
          appVersion,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          voip: Boolean(token.voip),
        }).catch(() => {});
      }

      const registrationHandle = await PushNotifications.addListener("registration", async (token) => {
        nativeToken = { value: token.value, platform };
        await Preferences.set({ key: TOKEN_KEY, value: token.value });
        await Preferences.set({ key: PUSH_ENABLED_KEY, value: "1" });
        await saveToken(nativeToken);
        for (const waiter of registrationWaiters.splice(0)) waiter.resolve(nativeToken);
      });
      removers.push(() => void registrationHandle.remove());

      const registrationErrorHandle = await PushNotifications.addListener("registrationError", (error) => {
        const failure = new Error(String((error as { error?: string }).error || "Не удалось зарегистрировать push"));
        for (const waiter of registrationWaiters.splice(0)) waiter.reject(failure);
        emitToast(failure.message, "error");
      });
      removers.push(() => void registrationErrorHandle.remove());

      const receivedHandle = await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        const data = (notification.data || {}) as Record<string, unknown>;
        window.dispatchEvent(new CustomEvent("nightgram:native-push", { detail: data }));
        if (data.kind !== "call") emitToast(String(notification.title || notification.body || "Новое уведомление"));
      });
      removers.push(() => void receivedHandle.remove());

      const actionHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        dispatchPushPayload((action.notification.data || {}) as Record<string, unknown>, action.actionId);
      });
      removers.push(() => void actionHandle.remove());

      const urlHandle = await App.addListener("appUrlOpen", ({ url }) => routeNativeUrl(url));
      removers.push(() => void urlHandle.remove());

      const stateHandle = await App.addListener("appStateChange", ({ isActive }) => {
        window.dispatchEvent(new CustomEvent("nightgram:native-app-state", { detail: { isActive } }));
      });
      removers.push(() => void stateHandle.remove());

      if (platform === "android") {
        const backHandle = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack || window.history.length > 1) window.history.back();
          else void App.minimizeApp();
        });
        removers.push(() => void backHandle.remove());
      }

      const networkHandle = await Network.addListener("networkStatusChange", (network) => {
        window.dispatchEvent(new CustomEvent("nightgram:native-network", { detail: network }));
      });
      removers.push(() => void networkHandle.remove());

      if (platform === "android") {
        const callService = registerPlugin<{
          start(options: { title: string; video: boolean }): Promise<{ active: boolean }>;
          stop(): Promise<{ active: boolean }>;
        }>("NightGramCallService");
        const startService = (event: Event) => {
          const detail = (event as CustomEvent<{ title?: string; video?: boolean }>).detail || {};
          void callService.start({ title: detail.title || "Звонок NightGram", video: Boolean(detail.video) }).catch(() => {});
        };
        const stopService = () => { void callService.stop().catch(() => {}); };
        window.addEventListener("nightgram:call-service-start", startService);
        window.addEventListener("nightgram:call-service-stop", stopService);
        removers.push(() => {
          window.removeEventListener("nightgram:call-service-start", startService);
          window.removeEventListener("nightgram:call-service-stop", stopService);
          stopService();
        });
      }

      const voipListener = (event: Event) => {
        const value = String((event as CustomEvent<{ token?: string }>).detail?.token || "");
        if (!value) return;
        voipToken = { value, platform: "ios", voip: true };
        void Preferences.set({ key: VOIP_TOKEN_KEY, value });
        void saveToken(voipToken);
      };
      window.addEventListener("nightgram:native-voip-token", voipListener);
      removers.push(() => window.removeEventListener("nightgram:native-voip-token", voipListener));

      const nativeCallListener = (event: Event) => {
        const detail = (event as CustomEvent<Record<string, unknown>>).detail || {};
        dispatchPushPayload(detail, String(detail.action || ""));
      };
      window.addEventListener("nightgram:native-call-action", nativeCallListener);
      removers.push(() => window.removeEventListener("nightgram:native-call-action", nativeCallListener));

      async function permissionState(): Promise<NotificationPermission | "unsupported"> {
        const state = await PushNotifications.checkPermissions();
        if (state.receive === "granted") return "granted";
        if (state.receive === "denied") return "denied";
        return "default";
      }

      async function getPushState(): Promise<NativePushState> {
        const permission = await permissionState();
        const enabled = (await Preferences.get({ key: PUSH_ENABLED_KEY })).value !== "0";
        const config = await api.getNativePushConfig().catch(() => ({ enabled: false, android: false, ios: false, voip: false }));
        return {
          supported: true,
          permission,
          serverEnabled: platform === "ios" ? config.ios : config.android,
          subscribed: enabled && permission === "granted" && Boolean(nativeToken?.value),
        };
      }

      async function enablePush(): Promise<NativePushState> {
        let permission = await PushNotifications.checkPermissions();
        if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") permission = await PushNotifications.requestPermissions();
        if (permission.receive !== "granted") throw new Error("Разрешение на уведомления не выдано");
        await Preferences.set({ key: PUSH_ENABLED_KEY, value: "1" });
        if (!nativeToken) {
          const tokenPromise = new Promise<NativeToken>((resolve, reject) => {
            const waiter = { resolve, reject };
            registrationWaiters.push(waiter);
            window.setTimeout(() => {
              const index = registrationWaiters.indexOf(waiter);
              if (index >= 0) registrationWaiters.splice(index, 1);
              reject(new Error("Система не вернула push-токен. Проверьте Firebase/APNs."));
            }, 15000);
          });
          await PushNotifications.register();
          nativeToken = await tokenPromise;
        }
        await saveToken(nativeToken);
        if (voipToken) await saveToken(voipToken);
        return getPushState();
      }

      async function disablePush(): Promise<NativePushState> {
        await Preferences.set({ key: PUSH_ENABLED_KEY, value: "0" });
        if (nativeToken) await api.removeNativePushToken({ token: nativeToken.value, deviceId }).catch(() => {});
        if (voipToken) await api.removeNativePushToken({ token: voipToken.value, deviceId }).catch(() => {});
        return getPushState();
      }

      window.nightgramNative = {
        isNative: true,
        platform,
        enablePush,
        disablePush,
        getPushState,
        async haptic(kind = "light") {
          const style = kind === "heavy" ? ImpactStyle.Heavy : kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light;
          await Haptics.impact({ style }).catch(() => {});
        },
        async share(payload) {
          await Share.share(payload);
        },
      };

      window.dispatchEvent(new CustomEvent("nightgram:native-ready", { detail: { platform, deviceId, appVersion } }));
      if (status === "authenticated") {
        if (nativeToken) await saveToken(nativeToken);
        if (voipToken) await saveToken(voipToken);
      }
    }

    void init().catch((error) => console.error("[NativeMobile] init", error));
    return () => {
      disposed = true;
      for (const remove of removers.splice(0)) remove();
      if (window.nightgramNative) delete window.nightgramNative;
      document.documentElement.classList.remove("nightgram-native", "nightgram-native-android", "nightgram-native-ios");
    };
  }, [status, user?.id]);

  return null;
}
