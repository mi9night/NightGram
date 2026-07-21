const STATIC_CACHE = "nightgram-static-v3.4.0";
const STATIC_ASSETS = [
  "/manifest.json",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/apple-touch-icon.png",
  "/offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("nightgram-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  const isStatic = url.pathname.startsWith("/_next/static/") || STATIC_ASSETS.includes(url.pathname);
  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      });
      return cached || network;
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: "NightGram", body: event.data?.text() || "Новое событие" }; }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visible = windows.find((client) => client.visibilityState === "visible");
    if (visible) {
      visible.postMessage({ type: "nightgram:push", payload });
      return;
    }
    const isCall = payload.kind === "call";
    await self.registration.showNotification(payload.title || "NightGram", {
      body: payload.body || "Новое событие",
      icon: payload.icon || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      image: payload.image || undefined,
      tag: payload.tag || (isCall ? `call:${payload.callId || "incoming"}` : "nightgram"),
      renotify: isCall,
      requireInteraction: Boolean(payload.requireInteraction || isCall),
      silent: false,
      vibrate: isCall ? [300, 120, 300, 120, 500] : [120, 60, 120],
      actions: isCall ? [
        { action: "accept-call", title: "Ответить" },
        { action: "reject-call", title: "Отклонить" },
      ] : [{ action: "open", title: "Открыть" }],
      data: payload,
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const payload = { ...(event.notification.data || {}), notificationAction: event.action || "open" };
  const baseUrl = payload.url || "/messages";
  const target = new URL(baseUrl, self.location.origin);
  if (payload.kind === "call" && event.action) target.searchParams.set("callAction", event.action === "reject-call" ? "reject" : "accept");
  const targetUrl = target.toString();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if ("navigate" in client) await client.navigate(targetUrl).catch(() => {});
        await client.focus();
        client.postMessage({ type: "nightgram:notification-click", payload });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const payload = event.data.payload || {};
    event.waitUntil(self.registration.showNotification(payload.title || "NightGram", {
      body: payload.body || "Новое событие",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag || "nightgram-local",
      data: payload,
    }));
  }
});
