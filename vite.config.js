import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
  test: {
    globals: false,
    pool: 'forks',
    projects: [
      {
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/**/*.{test,spec}.{js,jsx}'],
          setupFiles: './src/test/setup.js',
          testTimeout: 45_000,
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['server/**/*.test.js', 'shared/**/*.test.js'],
          testTimeout: 30_000,
          hookTimeout: 45_000,
        },
      },
    ],
  },
})