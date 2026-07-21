/*
 * Service Worker — Motor de Autoridade (MVP)
 * Estratégia conservadora: app-shell em cache, network-first para navegação,
 * fallback offline limitado. Vídeos NUNCA são cacheados (permanecem locais).
 */
const VERSION = "v1";
const SHELL_CACHE = `motor-shell-${VERSION}`;
const SHELL_ASSETS = ["/", "/hoje", "/offline", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Nunca interceptar API, auth ou mídia.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/auth")) return;

  // Navegação: network-first com fallback ao shell/offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/offline")))
    );
    return;
  }

  // Estáticos: cache-first.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// Web Push (habilitado na Fase 5). Estrutura pronta.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Motor de Autoridade", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Motor de Autoridade", {
      body: payload.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: payload.data || {},
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/hoje";
  event.waitUntil(self.clients.openWindow(target));
});
