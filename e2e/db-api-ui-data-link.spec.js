/**
 * Verifies Postgres (e.g. Supabase) ↔ Express API ↔ browser: health/bootstrap, then create + edit
 * customer via API, then confirm the row appears in the Sales UI.
 *
 * Runs under Playwright’s webServer (`scripts/e2e-web.mjs`) with `DATABASE_URL` pointing at your DB
 * (local Postgres, Supabase pooler, or CI service).
 */
import { test, expect } from '@playwright/test';
import { signInViaApi, csrfHeader } from './helpers/auth';

test.describe.configure({ timeout: 90_000 });

async function waitForBootstrapReady(page, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await page.request.get('/api/bootstrap-status');
    if (r.status() === 200) {
      const j = await r.json().catch(() => ({}));
      if (j?.phase === 'ready') return;
      if (j?.phase === 'failed') {
        throw new Error(`Bootstrap failed: ${JSON.stringify(j)}`);
      }
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  throw new Error('Timed out waiting for bootstrap phase ready');
}

test.describe('Database ↔ API ↔ UI data link', () => {
  test('health + bootstrap, API create/edit customer, UI reflects name', async ({ page }) => {
    const health = await page.request.get('/api/health');
    expect(health.status(), await health.text()).toBe(200);
    const healthJson = await health.json();
    expect(healthJson?.service).toBe('zarewa-api');

    await waitForBootstrapReady(page);

    await signInViaApi(page, 'admin', 'Admin@123');
    const headers = await csrfHeader(page);

    const stamp = Date.now();
    const name = `E2E DB link ${stamp}`;
    const phone = `080${String(10000000 + (stamp % 89999999)).padStart(8, '0')}`;

    const create = await page.request.post('/api/customers', {
      headers,
      data: { name, phoneNumber: phone, tier: 'Standard' },
    });
    expect(create.status(), await create.text()).toBe(201);
    const created = await create.json();
    expect(created.ok, JSON.stringify(created)).toBeTruthy();
    const customerId = created.customerID;
    expect(customerId).toBeTruthy();

    const patch = await page.request.patch(`/api/customers/${customerId}`, {
      headers,
      data: { tier: 'Premium', phoneNumber: phone },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    const patched = await patch.json();
    expect(patched.ok, JSON.stringify(patched)).toBeTruthy();

    const one = await page.request.get(`/api/customers/${customerId}`);
    expect(one.status(), await one.text()).toBe(200);
    const detail = await one.json();
    expect(detail.customer?.tier).toBe('Premium');

    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Sales' }).click();
    await expect(page).toHaveURL(/\/sales$/);
    await page.getByRole('tab', { name: 'Customers' }).click();
    await page.getByPlaceholder(/search name, phone, id, tier/i).fill(name);
    await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 20_000 });
  });
});
