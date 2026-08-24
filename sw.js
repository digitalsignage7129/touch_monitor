const APP_SHELL_CACHE = "signage-app-v2";
const CONTENT_CACHE = "signage-content-v2";
const APP_SHELL = ["./", "./index.html"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(APP_SHELL_CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => ![APP_SHELL_CACHE, CONTENT_CACHE].includes(key))
    .map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const isManifest = url.origin === self.location.origin && url.pathname.endsWith("/manifest.json");
  const isMedia = url.pathname.includes("/media/");

  // Critical: manifest must be fetched from the network first. The prior
  // worker returned its cached manifest forever, which prevented updates.
  if (isManifest) {
    event.respondWith(fetch(event.request, { cache:"no-store" })
      .then(response => { caches.open(CONTENT_CACHE).then(cache => cache.put(event.request, response.clone())); return response; })
      .catch(() => caches.match(event.request)));
    return;
  }
  if (isMedia) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
    return;
  }
  event.respondWith(fetch(event.request)
    .then(response => { const copy = response.clone(); caches.open(APP_SHELL_CACHE).then(cache => cache.put(event.request, copy)); return response; })
    .catch(() => caches.match(event.request)));
});
