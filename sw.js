// Service Worker for 2026 World Cup Schedule PWA
const CACHE_NAME = 'worldcup2026-v1.0.0';
const OFFLINE_URL = '/worldcup2026/offline.html';

// 需要缓存的资源
const STATIC_ASSETS = [
  '/worldcup2026/',
  '/worldcup2026/index.html',
  '/worldcup2026/worldcup2026.html',
  '/worldcup2026/manifest.json'
];

// 预缓存列表（安装时缓存）
const PRECACHE_URLS = [
  './',
  './index.html',
  './worldcup2026.html',
  './manifest.json'
];

// ===== 安装事件 =====
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_URLS.filter(url => !url.startsWith('http')));
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.log('[SW] Precache failed:', err);
      })
  );
});

// ===== 激活事件 =====
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// ===== 请求拦截 =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理同源请求
  if (url.origin !== location.origin) {
    return;
  }

  // API 请求 - 网络优先，失败返回缓存
  if (url.hostname.includes('wc2026api.com') || url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 静态资源 - 缓存优先
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML页面 - 网络优先
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 默认：缓存优先
  event.respondWith(cacheFirst(request));
});

// ===== 缓存策略 =====

// 缓存优先
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    console.log('[SW] Cache hit:', request.url);
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Fetch failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// 网络优先
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // API请求失败时返回离线JSON
    if (request.headers.get('accept')?.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'offline', demo: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Offline', { status: 503 });
  }
}

// 判断是否为静态资源
function isStaticAsset(pathname) {
  const staticExts = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.webp'];
  return staticExts.some(ext => pathname.endsWith(ext));
}

// ===== 消息处理 =====
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'clearCache') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache cleared');
      event.ports[0].postMessage({ success: true });
    });
  }
});
