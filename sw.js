// Service Worker для кэширования карты
const CACHE_NAME = 'spiders-map-cache-v1';
const TILE_CACHE_NAME = 'map-tiles-cache-v1';

// Файлы для кэширования
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/spiders.db',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm'
];

// Установка Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Кэширование файлов приложения');
        return cache.addAll(urlsToCache.filter(url => !url.includes('wasm')));
      })
      .catch(err => console.log('Ошибка кэширования:', err))
  );
  self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== TILE_CACHE_NAME) {
            console.log('Удаление старого кэша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Перехват запросов
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Кэширование тайлов карты OpenStreetMap
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          if (response) {
            // Возвращаем из кэша
            return response;
          }
          
          // Загружаем и кэшируем
          return fetch(event.request).then(networkResponse => {
            // Кэшируем только успешные ответы
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Если нет сети, возвращаем из кэша (если есть)
            return cache.match(event.request);
          });
        });
      })
    );
    return;
  }
  
  // Для остальных запросов - сначала кэш, потом сеть
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
      
      return fetch(event.request).then(networkResponse => {
        // Кэшируем GET запросы
        if (event.request.method === 'GET' && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    }).catch(() => {
      // Если нет ни кэша, ни сети
      return new Response('Нет подключения к сети', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    })
  );
});
