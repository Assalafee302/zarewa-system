import { expect } from '@playwright/test';

export async function signInViaUi(page, username, password) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /open your workspace/i })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /enter workspace/i }).click();
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 20_000 });
}

export async function signInViaApi(page, username, password) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /open your workspace/i })).toBeVisible({ timeout: 15_000 });

  const loginRes = await page.request.post('/api/session/login', { data: { username, password } });
  const loginBody = await loginRes.text();
  expect(loginRes.status(), loginBody).toBe(200);

  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 20_000 });
}

export async function csrfHeader(page) {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'zarewa_csrf')?.value || '';
  expect(csrf, 'Expected zarewa_csrf cookie after login').toBeTruthy();
  return { 'X-CSRF-Token': csrf };
}

