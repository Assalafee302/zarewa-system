import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
});
