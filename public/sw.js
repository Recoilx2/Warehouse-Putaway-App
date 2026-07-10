const CACHE_NAME = 'warehouse-putaway-v3';

// Assets array cached immediately during software deployment step
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/config.json',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js',
  // --- CRITICAL ADDITIONS: FORCE CACHING THE WEB WORKER & DICTIONARY ---
  'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/worker.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js',
  'https://tessdata.projectnaptha.com/4.0.0_best/eng.traineddata.gz'
];

// Installs and downloads files into the permanent machine memory vault
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Downloading application assets to storage vaults...");
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Clears historical old caches when system updates go live
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network Interceptor: Serves out of hardware memory if network is unreachable
self.addEventListener('fetch', (event) => {
  // Ignore API logging requests and let cloud endpoint process them directly
  if (event.request.url.includes('/api/extract')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Fallback network fetch if asset wasn't initially pre-cached
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        
        // Dynamically cache any extra internal language files Tesseract fetches on first start
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return networkResponse;
      }).catch(() => {
        // If everything fails and route match is index.html, force rendering
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});