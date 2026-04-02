import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        // Use IPv4 literal so Playwright (127.0.0.1:5173) and the API always hit the same process as e2e-web.
        target: `http://127.0.0.1:${process.env.E2E_API_PORT || 8787}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: false,
    environment: 'jsdom',
    environmentMatchGlobs: [['server/**', 'node']],
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.{test,spec}.{js,jsx}', 'server/**/*.test.js', 'shared/**/*.test.js'],
    pool: 'forks',
    testTimeout: 15_000,
  },
})