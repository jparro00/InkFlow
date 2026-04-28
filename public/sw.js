// Ink Bloop Service Worker — DEV copy.
// Production builds overwrite this file in dist/ via the writeServiceWorker
// plugin in vite.config.ts, which injects a hashed CACHE_NAME and a list of
// precache URLs derived from the Vite manifest.
const CACHE_NAME = 'inkbloop-dev';
const PRECACHE_URLS = [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => (res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
      // Navigation Preload runs the network fetch for navigations in parallel
      // with SW boot, instead of waiting for the SW to wake up first. Saves
      // 250-500 ms on cold revisits when the SW is idle.
      self.registration.navigationPreload?.enable(),
    ]).then(() => self.clients.claim())
  );
});

// Network-first with timeout. Used for Supabase GETs so a slow Supabase
// doesn't stall the boot path indefinitely — falls back to cache after the
// configured timeout.
function networkFirstWithTimeout(request, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };

    const timer = setTimeout(async () => {
      const cached = await caches.match(request);
      if (cached) finish(cached);
    }, timeoutMs);

    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        finish(response);
      })
      .catch(async () => {
        clearTimeout(timer);
        const cached = await caches.match(request);
        finish(cached || Response.error());
      });
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase: stale-tolerant network-first for GETs (so a slow PostgREST
  // call doesn't block the boot path). Auth and write methods fall through
  // to the network unhandled — we never want to serve stale auth state.
  if (url.hostname.includes('supabase')) {
    if (request.method === 'GET' && !url.pathname.startsWith('/auth/')) {
      event.respondWith(networkFirstWithTimeout(request, 3000));
    }
    return;
  }

  // SPA navigation: serve cached shell instantly, revalidate in background —
  // EXCEPT when the URL carries `?app=consent`. The consent QR code is the
  // only navigation a client ever does (one scan per studio visit, weeks or
  // months apart between visits), and they MUST get the freshest shell so
  // newly-shipped branding / form copy / fixes land on the very next scan.
  // The artist's own app (no query param) stays cache-first for fast boot.
  if (request.mode === 'navigate') {
    const isConsentScan = url.searchParams.get('app') === 'consent';
    if (isConsentScan) {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Race the network against a 2 s timeout so a flaky cell connection
        // can still fall back to whatever shell was cached previously.
        const networkPromise = (async () => {
          const preloaded = await event.preloadResponse;
          return preloaded || fetch(request);
        })();
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(() => resolve(null), 2000),
        );
        try {
          const fresh = await Promise.race([networkPromise, timeoutPromise]);
          if (fresh && fresh.ok) {
            cache.put('/index.html', fresh.clone());
            return fresh;
          }
          const cached = await cache.match('/index.html');
          if (cached) return cached;
          // Timeout but no cache — keep waiting on the network as the last
          // resort instead of returning a hard error.
          return (await networkPromise) || Response.error();
        } catch {
          const cached = await cache.match('/index.html');
          return cached || Response.error();
        }
      })());
      return;
    }
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match('/index.html');
      if (cached) {
        // Background revalidate using the navigation preload response when
        // available — saves a redundant fetch when the browser already
        // started the network request in parallel with SW boot.
        event.waitUntil((async () => {
          try {
            const fresh = (await event.preloadResponse) || (await fetch(request));
            if (fresh && fresh.ok) cache.put('/index.html', fresh.clone());
          } catch {
            /* offline — keep cached shell */
          }
        })());
        return cached;
      }
      const preloaded = await event.preloadResponse;
      return preloaded || fetch(request);
    })());
    return;
  }

  // Cache-first for content-hashed static assets.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ttf|ico)$/))
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (cross-origin fonts, etc.): stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});

// Page → SW message channel: lazy vendor chunk precache.
// On first successful render, the page sends 'cacheVendors' with the URL
// list it knows are needed (from the dist manifest). The SW caches them
// without blocking install — so first install stays fast and the second
// cold load can serve all vendor JS from the cache instead of the network.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'cacheVendors' && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        data.urls.map((url) =>
          cache.match(url).then((hit) => {
            if (hit) return;
            return fetch(url, { cache: 'reload' })
              .then((res) => (res && res.ok ? cache.put(url, res) : null))
              .catch(() => null);
          })
        )
      );
    })());
  } else if (data.type === 'skipWaiting') {
    self.skipWaiting();
  }
});
