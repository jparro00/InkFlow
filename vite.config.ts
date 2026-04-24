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
    rollupOptions: {
      output: {
        // Split heavy vendors into their own chunks so:
        //   - the main bundle stays small (boot + login path)
        //   - vendor chunks cache across deploys (their hash only changes
        //     when the library itself changes, not when app code does)
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('framer-motion')) return 'framer-motion';
          if (id.includes('@use-gesture')) return 'gesture';
          if (id.includes('date-fns')) return 'date-fns';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react-router')) return 'react-router';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }
        },
      },
    },
  },
})
