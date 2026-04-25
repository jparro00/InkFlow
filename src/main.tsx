import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (latin subset, woff2). Served from our origin so the
// browser skips the Google Fonts DNS/TLS/fetch and the FOUT is shorter.
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/dm-serif-display/latin-400.css'
import './index.css'
import App from './App'

// Prevent pinch-to-zoom globally (iOS ignores viewport meta)
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('gesturestart', (e) => {
  e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for offline caching & fast loads. Once the SW is
// active, hand it the list of asset URLs the page actually used so it can
// lazily cache them — first install stays fast (shell-only precache),
// second cold load serves vendor + route chunks from cache instead of the
// network.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(async () => {
        // Wait for an active SW. On first install this comes after the
        // controllerchange event; on subsequent loads it's already active.
        const reg = await navigator.serviceWorker.ready;
        const sw = reg.active;
        if (!sw) return;
        const urls = new Set<string>();
        document.querySelectorAll('link[rel="modulepreload"][href]').forEach((el) => {
          const href = el.getAttribute('href');
          if (href) urls.add(new URL(href, location.origin).pathname);
        });
        document.querySelectorAll('link[rel="stylesheet"][href]').forEach((el) => {
          const href = el.getAttribute('href');
          if (href && href.startsWith('/assets/')) urls.add(href);
        });
        document.querySelectorAll('script[type="module"][src]').forEach((el) => {
          const src = el.getAttribute('src');
          if (src && src.startsWith('/assets/')) urls.add(src);
        });
        if (urls.size > 0) {
          sw.postMessage({ type: 'cacheVendors', urls: [...urls] });
        }
      })
      .catch(() => {});
  });
}
