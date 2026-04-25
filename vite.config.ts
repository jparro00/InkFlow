import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeServiceWorker } from './scripts/write-sw.ts'
import { nonBlockingCssLink } from './scripts/non-blocking-css.ts'

export default defineConfig({
  base: '/',
  // nonBlockingCssLink rewrites the HTML before writeServiceWorker so the
  // SW caches the rewritten copy.
  plugins: [react(), tailwindcss(), nonBlockingCssLink(), writeServiceWorker()],
  build: {
    // Vite walks the lazy-import graph and promotes any chunk reachable
    // from many lazy boundaries to a top-level <link rel="modulepreload">.
    // That defeats the point of lazy-loading large vendors — framer-motion
    // (~140 KB) and the Supabase SDK (~186 KB) end up downloaded with high
    // priority on every cold visit even though only post-login surfaces
    // need them. Filter them out so the cold critical path is just the
    // entry, react-vendor, and react-router.
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter((d) => !/framer-motion|supabase|gesture/.test(d)),
    },
    rollupOptions: {
      output: {
        // Split a small set of stable vendor packages into their own
        // chunks so:
        //   - the main bundle stays small (boot + login path)
        //   - vendor chunks cache across deploys (their hash only changes
        //     when the library itself changes, not when app code does)
        //
        // KNOWN TRAP: Vite 8 / Rolldown 1.0-rc does not strictly honor
        // manualChunks — if the function returns a chunk name for a
        // module that's also a transitive dep of another manualChunks
        // target, Rolldown may inline it. Specifically, splitting
        // framer-motion into its own chunk caused React's runtime
        // (createContext, useState) to get bundled INTO framer-motion,
        // forcing every JSX-using chunk to import framer-motion. We
        // verified this empirically. So we DO NOT split framer-motion,
        // supabase, gesture, or icons here — Rolldown's automatic
        // chunking handles them better, and modulePreload.resolveDeps
        // above keeps them off the cold preload list either way.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return 'react-vendor';
          }
          if (id.includes('react-router')) return 'react-router';
          if (id.includes('date-fns')) return 'date-fns';
        },
      },
    },
  },
})
