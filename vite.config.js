import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: false,
    environment: 'jsdom',
    environmentMatchGlobs: [['server/**', 'node']],
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.{test,spec}.{js,jsx}', 'server/**/*.test.js'],
    pool: 'forks',
    testTimeout: 15_000,
  },
})