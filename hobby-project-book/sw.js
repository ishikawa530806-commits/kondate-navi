// Service Worker: アプリ本体（HTML/CSS/JS）だけをキャッシュしてオフラインでも動くようにする。
// ユーザーのデータと写真は IndexedDB にあり、ここでは一切触らないので、アプリを更新しても消えない。
//
// 方針は「ネットワーク優先、だめならキャッシュ」。
// オンラインなら常に最新版が読み込まれるので、更新のたびに CACHE_VERSION を上げなくても反映される。
const CACHE_VERSION = 'v1';
const CACHE_NAME = `hobby-project-book-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/data.js',
  './js/ui.js',
  './js/photos.js',
  './js/backup.js',
  './js/views/home.js',
  './js/views/project-form.js',
  './js/views/project.js',
  './js/views/complete.js',
  './js/views/gallery.js',
  './js/views/gallery-detail.js',
  './js/views/ideas.js',
  './js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('hobby-project-book-') && k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
