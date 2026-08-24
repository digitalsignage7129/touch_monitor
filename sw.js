// ==========================================================
// sw.js — キオスク表示用 Service Worker
// 役割:アプリ本体(HTML/CSS/JS)をキャッシュし、
//       ネット接続が無い/不安定な状態でも表示を継続させる。
// コンテンツ(manifest.json / media)の同期処理は
// メイン画面側(index.html の sync.js 相当)が担当する。
// ==========================================================

const APP_SHELL_CACHE = "app-shell-v1";
const CONTENT_CACHE = "signage-content-v1";

const APP_SHELL_FILES = [
  "./",
  "./index.html"
];

// インストール時:アプリ本体を先にキャッシュしておく
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

// 古いキャッシュの掃除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_SHELL_CACHE && k !== CONTENT_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// fetchハンドラ:
// - manifest.json / media 配下 → 「キャッシュ優先、なければネット」
//   (通信が遅くても、既にダウンロード済みのコンテンツはすぐ表示される)
// - それ以外(アプリ本体) → 「ネット優先、失敗したらキャッシュ」
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isContent = url.pathname.includes("/media/") || url.pathname.endsWith("manifest.json");

  if (isContent) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request);
      })
    );
  } else {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, resClone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
