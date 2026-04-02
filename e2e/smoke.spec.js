import { test, expect } from '@playwright/test';
import { signInViaUi } from './helpers/auth';

test.describe.configure({ timeout: 60_000 });

test.describe('Authenticated app flows', () => {
  test('dashboard loads after sign-in with active user identity', async ({ page }) => {
    await signInViaUi(page, 'admin', 'Admin@123');
    await expect(page.getByRole('heading', { name: /operations dashboard/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('group', { name: /signed in as zarewa admin/i })).toBeVisible();
  });

  test('sidebar navigates through protected modules', async ({ page }) => {
    await signInViaUi(page, 'admin', 'Admin@123');

    const modulesNav = page.getByRole('navigation', { name: 'Modules' });

    await modulesNav.getByRole('link', { name: 'Sales' }).click();
    await expect(page).toHaveURL(/\/sales$/);

    await modulesNav.getByRole('link', { name: 'Purchase' }).click();
    await expect(page).toHaveURL(/\/procurement$/);

    await modulesNav.getByRole('link', { name: 'Production' }).click();
    await expect(page).toHaveURL(/\/operations$/);
    await expect(page.getByRole('heading', { name: /store & production/i })).toBeVisible();

    await modulesNav.getByRole('link', { name: 'Finance' }).click();
    await expect(page).toHaveURL(/\/accounts$/);
    await expect(page.getByRole('heading', { name: /finance & accounts/i })).toBeVisible();

    await modulesNav.getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/reports$/);

    await modulesNav.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\//);
  });

  test('settings exposes access profile and period lock controls', async ({ page }) => {
    await signInViaUi(page, 'admin', 'Admin@123');
    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
    const main = page.locator('#main-content');
    await expect(main.getByText(/current user/i)).toBeVisible();
    await expect(main.getByText(/^zarewa admin$/i).first()).toBeVisible();
    await expect(main.getByText(/^administrator$/i)).toBeVisible();

    await page.getByRole('tab', { name: /controls & audit/i }).click();
    await page.locator('input[type="month"]').fill('2099-12');
    await page.getByPlaceholder(/month-end close completed/i).fill('Playwright period lock');
    await page.getByRole('button', { name: /lock period/i }).click();
    await expect(main.getByText('2099-12', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /unlock/i }).click();
  });

  test('procurement role hides finance navigation', async ({ page }) => {
    await signInViaUi(page, 'procurement', 'Procure@123');
    await expect(page.getByRole('button', { name: /procurement officer/i })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Finance' })
    ).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Purchase' }).click();
    await expect(page).toHaveURL(/\/procurement$/);
  });

  test('invalid credentials stay on sign-in screen', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: /enter workspace/i }).click();
    await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  });

  test('settings master data workspace can add a colour', async ({ page }) => {
    await signInViaUi(page, 'admin', 'Admin@123');
    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: /data & pricing/i }).click();
    await expect(page.getByRole('heading', { name: /master lists/i })).toBeVisible();
    const colourName = `Playwright colour ${Date.now()}`;
    await page.getByRole('heading', { name: /master lists/i }).scrollIntoViewIfNeeded();
    const coloursForm = page
      .locator('#main-content form')
      .filter({ has: page.getByText('Colour name', { exact: true }) });
    await coloursForm.getByText('Colour name', { exact: true }).locator('..').getByRole('textbox').first().fill(colourName);
    await coloursForm.getByPlaceholder(/HMB \/ IV \/ TB/i).fill('PW');
    await coloursForm.getByRole('button', { name: /^save$/i }).click();
    await expect(
      page.getByRole('paragraph').filter({ hasText: `${colourName} (PW)` }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('sales refunds tab opens request modal with preview and payout guidance', async ({ page }) => {
    await signInViaUi(page, 'sales.staff', 'Sales@123');
    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Sales' }).click();
    await expect(page).toHaveURL(/\/sales$/);
    await page.getByRole('tab', { name: 'Refunds' }).click();
    await page.getByRole('button', { name: /new refund/i }).click();
    await expect(page.getByRole('heading', { name: 'Refund request' })).toBeVisible();
    await expect(page.getByText(/split a payout across more than one bank or cash account/i)).toBeVisible();
    await expect(page.getByText(/live preview/i)).toBeVisible();
  });
});
