import { test, expect } from '@playwright/test';

async function uiSignIn(page, username, password) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /open your workspace/i })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /enter workspace/i }).click();
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 20_000 });
}

test.describe.configure({ timeout: 180_000 });

test.describe('HR UI flows (targeted)', () => {
  test('HR payroll UI: create draft, recompute, lock', async ({ page }) => {
    await uiSignIn(page, 'hr.manager', 'HrManager@12345!');
    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'HR' }).click();
    await expect(page).toHaveURL(/\/hr(\/overview)?$/);

    await page.getByRole('link', { name: /^payroll$/i }).click();
    await expect(page).toHaveURL(/\/hr\/payroll$/);
    await expect(page.getByRole('heading', { name: /payroll runs/i })).toBeVisible();

    // Create draft for a future period to avoid collisions.
    await page.getByLabel(/new period/i).fill('209912');
    await page.getByRole('button', { name: /create draft/i }).first().click();
    await expect(page.getByText(/draft payroll run created/i)).toBeVisible({ timeout: 15_000 });

    // Recompute the newest draft (first row).
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.getByRole('button', { name: /recompute/i }).click();
    await expect(page.getByText(/payroll recomputed/i)).toBeVisible({ timeout: 15_000 });

    // Lock it.
    await firstRow.getByRole('button', { name: /lock/i }).click();
    await expect(page.getByText(/run updated/i)).toBeVisible({ timeout: 15_000 });
  });

  test('HR staff UI: open my file, edit job title, save', async ({ page }) => {
    await uiSignIn(page, 'hr.manager', 'HrManager@12345!');
    // Staff profiles can only be edited in HR mode (not self mode).
    await page.goto('/hr/staff/USR-ADMIN');
    await expect(page).toHaveURL(/\/hr\/staff\/USR-ADMIN$/);

    await expect(page.getByRole('button', { name: /edit file/i })).toBeVisible();
    await page.getByRole('button', { name: /edit file/i }).click();
    await expect(page.getByText('Edit HR file', { exact: true })).toBeVisible();

    const jobTitle = page.getByLabel(/job title/i);
    const nextTitle = `HR Manager (edited ${Date.now()})`;
    await jobTitle.fill(nextTitle);
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText('Edit HR file', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /edit file/i })).toBeVisible({ timeout: 15_000 });
    // Confirm UI refreshed to show the new title somewhere on the page.
    await expect(page.getByText(nextTitle).first()).toBeVisible({ timeout: 15_000 });
  });
});

