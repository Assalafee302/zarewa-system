import { test, expect } from '@playwright/test';
import { signInViaUi } from './helpers/auth';

test.describe.configure({ timeout: 90_000 });

test.describe('HQ Accounting workspace', () => {
  test('fixed assets, costing, and ledger views load for admin', async ({ page }) => {
    await signInViaUi(page, 'admin', 'Admin@123');

    await page.goto('/accounting/overview');
    await expect(page.getByRole('heading', { name: /^snapshot$/i })).toBeVisible({ timeout: 20_000 });

    await page.goto('/accounting/assets');
    await expect(page.getByRole('heading', { name: /fixed assets register/i })).toBeVisible({ timeout: 20_000 });

    await page.goto('/accounting/costing');
    await expect(page.getByRole('heading', { name: /product costing/i })).toBeVisible({ timeout: 20_000 });

    await page.goto('/accounting/ledger');
    await expect(page.getByRole('heading', { name: /general ledger/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /trial balance/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /chart of accounts/i })).toBeVisible({ timeout: 15_000 });

    await page.goto('/accounting/statements');
    await expect(page.getByRole('heading', { name: /financial statements/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /receipts & cash reconciliation/i })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('heading', { name: /cash flow — treasury by type/i })).toBeVisible({ timeout: 15_000 });

    await page.goto('/accounting/controls');
    await expect(page.getByRole('heading', { name: /period close and controls/i })).toBeVisible({ timeout: 20_000 });
  });
});
