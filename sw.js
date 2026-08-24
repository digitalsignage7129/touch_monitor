// ==========================================================
// sw.js — キオスク表示用 Service Worker(v2)
// 重要な修正点:
//  ・manifest.json は「キャッシュ優先」ではなく「ネットワーク優先」に変更。
//    以前の版はキャッシュ優先だったため、更新が反映されない不具合があった。
//  ・実際の更新チェック・差分ダウンロードはメイン画面(index.html)側で行う。
//    このService Workerはアプリ本体のオフライン表示だけを担当する。
// ==========================================================

const APP_SHELL_CACHE = "app-shell-v2";

const APP_SHELL_FILES = [
  "./",
  "./index.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== APP_SHELL_CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isManifest = url.pathname.endsWith("manifest.json");

  if (isManifest) {
    // manifest.json は常にネットワークを優先(キャッシュしない)。
    event.respondWith(fetch(event.request).catch(() => new Response(null, { status: 503 })));
    return;
  }

  // アプリ本体(HTML/CSS/JS):ネット優先、失敗したらキャッシュ
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
