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

test.describe.configure({ timeout: 180_000 });

test.describe('HR payroll locking + exports', () => {
  test('locked run blocks recompute; exports return CSV with expected headers', async ({ page }) => {
    await apiSignIn(page, 'hr.manager', 'HrManager@12345!');
    const periodYyyymm = '202603';

    const createRun = await page.request.post('/api/hr/payroll-runs', { data: { periodYyyymm } });
    expect(createRun.status()).toBe(201);
    const runId = (await createRun.json()).id;

    const recompute = await page.request.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`);
    expect(recompute.status()).toBe(200);

    const lock = await page.request.patch(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`, {
      data: { status: 'locked' },
    });
    expect(lock.status()).toBe(200);

    const recomputeBlocked = await page.request.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`);
    expect(recomputeBlocked.status()).toBe(400);

    const treasury = await page.request.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/treasury-pack`);
    expect(treasury.status()).toBe(200);
    const treasuryCsv = await treasury.text();
    expect(treasuryCsv.split(/\r?\n/)[0]).toMatch(/^period_yyyymm,run_id,run_status,user_id,display_name,/);

    const payslips = await page.request.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/payslips-pack`);
    expect(payslips.status()).toBe(200);
    const payslipsCsv = await payslips.text();
    expect(payslipsCsv.split(/\r?\n/)[0]).toMatch(/^period_yyyymm,run_id,user_id,display_name,gross_ngn,/);

    const statutory = await page.request.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/statutory-pack`);
    expect(statutory.status()).toBe(200);
    const statutoryCsv = await statutory.text();
    expect(statutoryCsv.split(/\r?\n/)[0]).toBe('period_yyyymm,run_id,user_id,display_name,tax_ngn,pension_ngn');
  });
});

