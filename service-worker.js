/* PWA Service Worker - App Shell caching */
const CACHE_VERSION = 'time-list-v93';

// 仅缓存静态资源（API 走网络）
const APP_SHELL = [
  '/',
  '/index.html',
  '/calendar.html',
  '/summary.html',
  '/login.html',
  '/admin.html', // 新增后台管理页
  '/css/style.css',
  '/css/fab.css',
  '/css/style-table-menu.css',
  '/css/category.css',
  '/js/auth.js',
  '/js/storage.js',
  '/js/template.js',
  '/js/taskList.js',
  '/js/calendar.js',
  '/js/summary.js',
  '/js/charts.js',
  '/js/pwa.js',
  '/icons/icon.svg',
  '/icons/maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k === CACHE_VERSION ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只处理同源请求
  if (url.origin !== self.location.origin) return;

  // manifest：网络优先，避免因缓存导致安装信息不更新
  if (url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 图标：网络优先（图标更新时避免被旧缓存“卡住”）
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // API：网络优先（失败再回退缓存/离线）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // HTML：网络优先，离线回退缓存
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/index.html')))
    );
    return;
  }

  // 其他静态资源：缓存优先
  // 排除 JS 文件，改用网络优先（避免业务逻辑缓存过久）
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    // ...
  }

  // JS 文件：网络优先
  if (url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // CSS 文件：网络优先（避免样式被旧缓存“卡住”）
  if (url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 其他静态资源（CSS/Images）：缓存优先
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      });
    })
  );
});


