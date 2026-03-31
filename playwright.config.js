import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/e2e-web.mjs',
    url: 'http://127.0.0.1:5173',
    env: {
      ZAREWA_DB: 'data/playwright.sqlite',
    },
    reuseExistingServer: process.env.CI !== 'true',
    timeout: 180_000,
  },
});
