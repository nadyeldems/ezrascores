// EZRASCORES service worker
// - App shell: network first, cached copy when offline.
// - Score data (/api/v1/ezra/*): network first, last good answer when offline.
// - Badges and player images (/api/image): cache first, they rarely change.
// - Push: shows goal / kickoff / full-time alerts and opens the app on tap.
// Bump SW_VERSION when this file's caching rules change.

const SW_VERSION = "2026-11-23a";
const SHELL_CACHE = `ezra-shell-${SW_VERSION}`;
const DATA_CACHE = "ezra-data-v1";
const IMAGE_CACHE = "ezra-images-v1";
const IMAGE_CACHE_LIMIT = 400;
const SHELL_URLS = ["/", "/index.html", "/styles.css", "/app.js", "/manifest.webmanifest", "/assets/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("ezra-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(cacheKey, response.clone()).catch(() => null);
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey, { ignoreSearch: cacheName === SHELL_CACHE });
    if (cached) return cached;
    throw err;
  }
}

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone()).catch(() => null);
    trimCache(cacheName, IMAGE_CACHE_LIMIT).catch(() => null);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept the admin tool, account calls or the live event stream.
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/v1/ezra/account") || url.pathname.startsWith("/api/v1/ezra/admin")) return;
  if (url.pathname === "/api/v1/ezra/live/stream") return;

  if (url.pathname === "/api/image") {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/index.html"));
    return;
  }
  if (/\.(?:js|css|webmanifest|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "EZRASCORES", body: event.data ? event.data.text() : "" };
  }
  const title = String(data.title || "EZRASCORES");
  const options = {
    body: String(data.body || ""),
    icon: data.icon || "/assets/icons/icon-192.png",
    badge: "/assets/icons/icon-192.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          if ("navigate" in client && client.url !== target) await client.navigate(target).catch(() => null);
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
