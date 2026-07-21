import { api } from "@/lib/api";

export type WebPushState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  serverEnabled: boolean;
  subscribed: boolean;
};

function base64UrlToApplicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0))).buffer as ArrayBuffer;
}

function platformName() {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios-pwa";
  if (/android/.test(ua)) return "android-pwa";
  if ((window as Window & { nightgramDesktop?: unknown }).nightgramDesktop) return "windows-electron";
  return "web";
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

export async function getWebPushState(): Promise<WebPushState> {
  if (window.nightgramNative?.isNative) return window.nightgramNative.getPushState();
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return { supported: false, permission: "unsupported", serverEnabled: false, subscribed: false };
  const [config, registration] = await Promise.all([api.getPushConfig().catch(() => ({ enabled: false, publicKey: null })), ensureServiceWorker()]);
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  return {
    supported: true,
    permission: Notification.permission,
    serverEnabled: Boolean(config.enabled && config.publicKey),
    subscribed: Boolean(subscription),
  };
}

export async function enableWebPush(): Promise<WebPushState> {
  if (window.nightgramNative?.isNative) return window.nightgramNative.enablePush();
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new Error("Push-уведомления не поддерживаются этим браузером");
  }
  const config = await api.getPushConfig();
  if (!config.enabled || !config.publicKey) throw new Error("Web Push не настроен на backend");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Уведомления заблокированы в браузере" : "Разрешение на уведомления не выдано");
  const registration = await ensureServiceWorker();
  if (!registration) throw new Error("Service Worker недоступен");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToApplicationServerKey(config.publicKey),
    });
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Браузер вернул неполную push-подписку");
  await api.savePushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    platform: platformName(),
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  });
  return { supported: true, permission, serverEnabled: true, subscribed: true };
}

export async function disableWebPush(): Promise<WebPushState> {
  if (window.nightgramNative?.isNative) return window.nightgramNative.disablePush();
  const registration = await navigator.serviceWorker?.ready;
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api.removePushSubscription(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe().catch(() => false);
  }
  return getWebPushState();
}

export async function syncExistingWebPush(): Promise<void> {
  if (window.nightgramNative?.isNative) {
    await window.nightgramNative.getPushState().catch(() => null);
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || Notification.permission !== "granted") return;
  const registration = await ensureServiceWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
  await api.savePushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    platform: platformName(),
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  }).catch(() => {});
}
