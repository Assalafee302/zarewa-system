import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${process.env.E2E_UI_PORT || 5180}`,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/e2e-web.mjs',
    url: `http://127.0.0.1:${process.env.E2E_UI_PORT || 5180}`,
    env: {
      ZAREWA_DB: 'data/playwright.sqlite',
      E2E_UI_PORT: process.env.E2E_UI_PORT || '5180',
      E2E_API_PORT: process.env.E2E_API_PORT || '8788',
    },
    // Always prefer the Playwright stack (API + Vite with playwright.sqlite); reusing a dev server often points at the wrong DB.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
