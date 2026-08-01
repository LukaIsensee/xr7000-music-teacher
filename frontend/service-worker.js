const CACHE_NAME = "xr7000-teacher-shell-v2";

// Relative so the app works from a GitHub Pages subdirectory as well as root.
const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./music-theory.js",
  "./theory-context.js",
  "./local-memory.js",
  "./llm-engine.js",
  "./manifest.json",
  "./icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never touch cross-origin traffic: WebLLM streams ~1 GB of model weights from
  // a CDN and manages its own cache. Intercepting that would duplicate the
  // storage and blow past iOS's origin quota.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
