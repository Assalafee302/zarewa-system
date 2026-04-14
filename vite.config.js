import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 2400,
  },
  server: {
    // Listen on all interfaces so phones/tablets on the same LAN can reach the dev server.
    host: true,
    proxy: {
      '/api': {
        // Use IPv4 literal so Playwright (127.0.0.1:5173) and the API always hit the same process as e2e-web.
        target: `http://127.0.0.1:${process.env.E2E_API_PORT || 8787}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.E2E_API_PORT || 8787}`,
        changeOrigin: true,
      },
    },
  },
});