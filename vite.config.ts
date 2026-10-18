/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node' },
  // The messaging server (server/) holds the Meta tokens; the browser only talks to it through this proxy.
  server: { proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } } },
  build: { chunkSizeWarningLimit: 1200 },
})
