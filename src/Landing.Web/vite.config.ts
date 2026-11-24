import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Built into the API's wwwroot, so one container serves page and API from the same origin.
// In dev, Vite serves the page and proxies /api and /health to the API on :8080 (ASP.NET's default).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../Landing.Api/wwwroot',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/health': 'http://127.0.0.1:8080',
    },
  },
})
