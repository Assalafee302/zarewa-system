import { test, expect } from '@playwright/test';
import { signInViaApi } from './helpers/auth';

test.describe.configure({ timeout: 90_000 });

test.describe('Role-based access (API + UI)', () => {
  test('viewer: customers API forbidden; reports summary allowed', async ({ page }) => {
    await signInViaApi(page, 'viewer', 'Viewer@123456!');
    const customers = await page.request.get('/api/customers');
    expect(customers.status()).toBe(403);
    const body = await customers.json();
    expect(body.code).toBe('FORBIDDEN');

    const summary = await page.request.get('/api/reports/summary');
    expect(summary.status()).toBe(200);
    const sumJson = await summary.json();
    expect(sumJson.ok).toBe(true);
    expect(sumJson.counts).toBeTruthy();
    expect(typeof sumJson.counts.customersTotal).toBe('number');
  });

  test('viewer: employment letters API forbidden', async ({ page }) => {
    await signInViaApi(page, 'viewer', 'Viewer@123456!');
    const res = await page.request.get('/api/hr/employment-letters');
    expect(res.status()).toBe(403);
  });

  test('viewer: Reports shows count-only overview', async ({ page }) => {
    await signInViaApi(page, 'viewer', 'Viewer@123456!');
    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole('heading', { name: /count-only overview/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('procurement: customers forbidden; suppliers allowed', async ({ page }) => {
    await signInViaApi(page, 'procurement', 'Procure@123');
    const customers = await page.request.get('/api/customers');
    expect(customers.status()).toBe(403);

    const suppliers = await page.request.get('/api/suppliers');
    expect(suppliers.status()).toBe(200);
    const body = await suppliers.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.suppliers)).toBe(true);
  });

  test('procurement: ledger endpoint forbidden', async ({ page }) => {
    await signInViaApi(page, 'procurement', 'Procure@123');
    // Use in-page fetch so the session cookie is always sent (page.request can miss cookies after policy reload).
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/ledger', { credentials: 'include' });
      return r.status;
    });
    expect(status).toBe(403);
  });
});
