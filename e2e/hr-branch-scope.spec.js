import { test, expect } from '@playwright/test';
import { acceptRequiredHrPoliciesViaApi } from './helpers/auth.js';

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

test.describe.configure({ timeout: 180_000 });

test.describe('HR branch scope', () => {
  test('attendance upload is blocked outside current workspace branch (non-viewAll)', async ({ page }) => {
    const runTag = `pw-branch-${Date.now()}`;
    const staffUsername = `pw.branch.staff.${runTag}`;
    const staffDisplay = `PW Branch Staff ${runTag}`;
    const yolaBranch = 'BR-YOL';
    const kadBranch = 'BR-KAD';

    // Admin creates staff in BR-YOL.
    await apiSignIn(page, 'admin', 'Admin@123');
    const reg = await page.request.post('/api/hr/staff/register', {
      data: {
        username: staffUsername,
        displayName: staffDisplay,
        password: 'Staff@123456',
        roleKey: 'viewer',
        workspaceDepartment: 'hr',
        branchId: yolaBranch,
        employeeNo: `EMP-BR-${runTag}`,
        jobTitle: 'Branch tester',
        department: 'Operations',
        employmentType: 'permanent',
        dateJoinedIso: '2025-01-15',
        baseSalaryNgn: 220_000,
      },
    });
    if (reg.status() !== 201) throw new Error(await reg.text());
    const staffUserId = (await reg.json()).userId;
    await apiSignOut(page);

    // HR officer is scoped to a single branch via workspace selection (default Kad/HQ in seeded data).
    await apiSignIn(page, 'hr.officer', 'HrOfficer@12345!');
    await acceptRequiredHrPoliciesViaApi(page);
    // Ensure workspace is Kaduna.
    const wsKad = await page.request.patch('/api/session/workspace', { data: { currentBranchId: kadBranch } });
    expect(wsKad.status()).toBe(200);

    const forbidden = await page.request.post('/api/hr/attendance/upload', {
      data: {
        branchId: yolaBranch,
        periodYyyymm: '202603',
        notes: 'Should fail outside scope',
        rows: [{ userId: staffUserId, absentDays: 1, minutesLate: 0 }],
      },
    });
    expect(forbidden.status()).toBe(403);

    // Switch workspace to BR-YOL then upload succeeds.
    const wsYol = await page.request.patch('/api/session/workspace', { data: { currentBranchId: yolaBranch } });
    expect(wsYol.status()).toBe(200);
    const ok = await page.request.post('/api/hr/attendance/upload', {
      data: {
        branchId: yolaBranch,
        periodYyyymm: '202603',
        notes: 'Should succeed in scope',
        rows: [{ userId: staffUserId, absentDays: 1, minutesLate: 0 }],
      },
    });
    expect(ok.status()).toBe(201);
  });
});

