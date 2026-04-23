import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeServiceWorker } from './scripts/write-sw.ts'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), writeServiceWorker()],
})
