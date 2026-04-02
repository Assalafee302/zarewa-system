import { expect } from '@playwright/test';

export async function signInViaUi(page, username, password) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/');
    try {
      await expect(page.getByRole('heading', { name: /open your workspace/i })).toBeVisible({
        timeout: 15_000,
      });
      break;
    } catch {
      if (attempt === 2) throw new Error('Login screen did not load (check Vite / module errors).');
      await page.waitForTimeout(400);
    }
  }
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /enter workspace/i }).click();
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 20_000 });
  await acceptRequiredHrPoliciesViaApi(page);
}

export async function signInViaApi(page, username, password) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /open your workspace/i })).toBeVisible({ timeout: 15_000 });

  const loginRes = await page.request.post('/api/session/login', { data: { username, password } });
  const loginBody = await loginRes.text();
  expect(loginRes.status(), loginBody).toBe(200);

  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 20_000 });
  await acceptRequiredHrPoliciesViaApi(page);
}

export async function csrfHeader(page) {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'zarewa_csrf')?.value || '';
  expect(csrf, 'Expected zarewa_csrf cookie after login').toBeTruthy();
  return { 'X-CSRF-Token': csrf };
}

/** Acknowledge required HR policies so policy modals do not block the main UI (e.g. Sales navigation). */
export async function acceptRequiredHrPoliciesViaApi(page, signatureName = 'Playwright E2E') {
  const reqs = await page.request.get('/api/hr/policy-requirements');
  if (reqs.status() !== 200) return;
  const json = await reqs.json().catch(() => null);
  const missing = json?.missing || [];
  if (missing.length === 0) return;
  const headers = await csrfHeader(page);
  for (const p of missing) {
    const ack = await page.request.post('/api/hr/policy-acknowledgements', {
      data: {
        policyKey: p.key,
        policyVersion: p.version,
        signatureName,
        context: { channel: 'e2e' },
      },
      headers,
    });
    expect(ack.status(), await ack.text()).toBe(201);
  }
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 20_000 });
}

