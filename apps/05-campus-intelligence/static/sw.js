/**
 * Smart Campus – Service Worker
 * Provides offline support and asset caching for PWA functionality.
 */

const CACHE_NAME = "smart-campus-v1";
const OFFLINE_URL = "/offline";

// Assets to cache on install (app shell)
const PRECACHE_ASSETS = [
  "/",
  "/offline",
  "/static/style.css",
  "/static/dark-mode.css",
  "/static/shared.js",
  "/static/auth.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("SW: some assets failed to pre-cache", err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't intercept non-GET or cross-origin API calls
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin && !url.href.includes("cdnjs")) return;

  // API requests: network-first, no cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ success: false, message: "You are offline" }),
          { headers: { "Content-Type": "application/json" }, status: 503 }
        )
      )
    );
    return;
  }

  // Static assets: cache-first
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
        );
      })
    );
    return;
  }

  // HTML pages: network-first, fall back to offline page
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
  );
});

// ── Push notifications (future-ready) ─────────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "Smart Campus";
  const options = {
    body:    data.body || "You have a new notification",
    icon:    "/static/icons/icon-192.png",
    badge:   "/static/icons/badge-72.png",
    data:    { url: data.url || "/" },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList.find((c) => c.url === targetUrl && "focus" in c);
        if (existing) return existing.focus();
        return clients.openWindow(targetUrl);
      })
  );
});
