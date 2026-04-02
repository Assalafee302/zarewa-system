import { test, expect } from '@playwright/test';

async function apiSignIn(page, username, password) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /open your workspace/i })).toBeVisible({ timeout: 15_000 });
  const loginRes = await page.request.post('/api/session/login', { data: { username, password } });
  const bodyText = await loginRes.text();
  expect(loginRes.status(), bodyText).toBe(200);
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'zarewa_csrf')?.value;
  expect(String(csrf || '')).toBeTruthy();
  await page.context().setExtraHTTPHeaders({ 'x-csrf-token': csrf });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 20_000 });
}

async function apiSignOut(page) {
  await page.request.post('/api/session/logout');
  await page.context().setExtraHTTPHeaders({});
  await page.context().clearCookies();
}

test.describe.configure({ timeout: 120_000 });

test.describe('HR compliance/observability access control', () => {
  test('viewer forbidden; HR manager allowed', async ({ page }) => {
    await apiSignIn(page, 'viewer', 'Viewer@123456!');
    expect((await page.request.get('/api/hr/policy-acknowledgements')).status()).toBe(403);
    expect((await page.request.get('/api/hr/observability')).status()).toBe(403);
    expect((await page.request.get('/api/hr/data-cleanup-queue')).status()).toBe(403);
    await apiSignOut(page);

    await apiSignIn(page, 'hr.manager', 'HrManager@12345!');
    expect((await page.request.get('/api/hr/policy-acknowledgements')).status()).toBe(200);
    expect((await page.request.get('/api/hr/observability')).status()).toBe(200);
    expect((await page.request.get('/api/hr/data-cleanup-queue')).status()).toBe(200);
  });

  test('HR officer cannot see unmasked sensitive staff fields without IT security ack', async ({ page }) => {
    await apiSignIn(page, 'hr.officer', 'HrOfficer@12345!');
    const staff = await page.request.get('/api/hr/staff');
    expect(staff.status()).toBe(200);
    const json = await staff.json();
    const row = (json.staff || [])[0];
    expect(row).toBeTruthy();
    expect(row.taxId === '***' || row.taxId == null || row.taxId === '').toBe(true);
    expect(row.pensionRsaPin === '***' || row.pensionRsaPin == null || row.pensionRsaPin === '').toBe(true);
    expect(row.bankAccountNoMasked === '***' || row.bankAccountNoMasked == null || row.bankAccountNoMasked === '').toBe(
      true
    );
  });
});

