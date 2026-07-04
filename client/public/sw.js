// JWP Books service worker
// - App shell + hashed assets are cached so the app opens instantly.
// - GET /api responses are cached network-first, so recently viewed clients,
//   pianos, and invoices remain readable if the connection drops (read-only
//   offline; edits still require a connection).
const VERSION = "jwp-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const API_CACHE = `${VERSION}-api`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/", "/manifest.json"]))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function navigationHandler(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put("/", res.clone());
    }
    return res;
  } catch (err) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match("/");
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Uploaded photos can be large — always go to the network for them.
  if (url.pathname.startsWith("/uploads")) return;

  // Auth/session endpoints must never come from cache.
  if (url.pathname === "/api/login" || url.pathname === "/api/auth/user") return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // SPA navigations: network-first with the cached shell as offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Hashed build assets and fonts are immutable — cache-first.
  const isAsset =
    url.pathname.startsWith("/assets/") ||
    /\.(js|css|png|svg|ico|woff2?)$/.test(url.pathname) ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com";

  if (isAsset) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
