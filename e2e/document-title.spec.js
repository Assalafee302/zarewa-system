import { test, expect } from '@playwright/test';
import { acceptRequiredHrPoliciesViaApi, signInViaUi } from './helpers/auth';

test.describe.configure({ timeout: 60_000 });

test.describe('Document title (browser chrome)', () => {
  test('sign-in screen sets tab title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /open your workspace/i })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveTitle(/sign in/i);
  });

  test('unknown route shows page not found title', async ({ page }) => {
    await signInViaUi(page, 'admin', 'Admin@123');
    await page.goto('/this-route-does-not-exist-zarewa');
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveTitle(/page not found/i);
  });

  test('dashboard and HR child routes update tab title', async ({ page }) => {
    await signInViaUi(page, 'admin', 'Admin@123');
    await expect(page).toHaveTitle(/operations dashboard/i);
    await acceptRequiredHrPoliciesViaApi(page);
    await page.goto('/hr/payroll');
    await expect(page).toHaveTitle(/payroll/i);
    await page.goto('/settings/profile');
    await expect(page).toHaveTitle(/settings.*profile/i);
  });
});
