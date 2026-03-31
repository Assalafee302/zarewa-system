import { test, expect } from '@playwright/test';

async function signIn(page, username, password) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /open your workspace/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /enter workspace/i }).click();
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Complete gate — module shells by role', () => {
  test('finance manager: Finance page and treasury tab', async ({ page }) => {
    await signIn(page, 'finance.manager', 'Finance@123');
    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Finance' }).click();
    await expect(page).toHaveURL(/\/accounts$/);
    await expect(page.getByRole('heading', { name: /finance & accounts/i })).toBeVisible();
    await page.getByRole('tab', { name: /^treasury$/i }).click();
    await expect(page.getByText(/total liquidity/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('operations: Store & production shell', async ({ page }) => {
    await signIn(page, 'operations', 'Ops@123');
    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Production' }).click();
    await expect(page).toHaveURL(/\/operations$/);
    await expect(page.getByRole('heading', { name: /store & production/i })).toBeVisible();
  });

  test('admin: Procurement purchases shell', async ({ page }) => {
    await signIn(page, 'admin', 'Admin@123');
    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Purchase' }).click();
    await expect(page).toHaveURL(/\/procurement$/);
    await expect(page.locator('h1').filter({ hasText: /^Purchases$/i })).toBeVisible();
  });

  test('admin: HR workspace overview (direct route)', async ({ page }) => {
    await signIn(page, 'admin', 'Admin@123');
    await page.goto('/hr');
    await expect(page.getByRole('heading', { name: /human resources/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /staff directory/i })).toBeVisible();
  });

  test('admin: branch workspace selector when live API lists branches', async ({ page }) => {
    await signIn(page, 'admin', 'Admin@123');
    const branchSelect = page.locator('#zarewa-branch-workspace');
    await expect(branchSelect).toBeVisible({ timeout: 15_000 });
    await expect(branchSelect.locator('option').first()).toBeAttached();
  });
});
