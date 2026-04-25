const CACHE = 'study-invaders-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/game.js',
  '/modules/config.js',
  '/modules/sound.js',
  '/modules/leaderboard.js',
  '/modules/review.js',
  '/modules/drive.js',
  '/modules/gameplay.js',
  '/docs/studyinvaderslogo.png',
  '/docs/naulogo.png',
  '/docs/bgm.mp3',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // API 요청(Google)은 캐시 안 함 — 항상 네트워크
  if (e.request.url.includes('script.google.com') ||
      e.request.url.includes('googleapis.com') ||
      e.request.url.includes('fonts.g')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }
  // 나머지는 캐시 우선
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
