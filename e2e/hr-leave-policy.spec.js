import { test, expect } from '@playwright/test';

async function apiSignIn(page, username, password) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /open your workspace/i })).toBeVisible({
    timeout: 15_000,
  });
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

test.describe('HR leave policy enforcement', () => {
  test('recompute blocks negative balances until HR adjustment is applied', async ({ page }) => {
    const runTag = `pw-leave-${Date.now()}`;
    const staffUsername = `pw.leave.staff.${runTag}`;
    const periodYyyymm = '202603';

    // Admin registers staff.
    await apiSignIn(page, 'admin', 'Admin@123');
    const register = await page.request.post('/api/hr/staff/register', {
      data: {
        username: staffUsername,
        displayName: `PW Leave Staff ${runTag}`,
        password: 'Staff@123456',
        roleKey: 'viewer',
        workspaceDepartment: 'hr',
        branchId: 'BR-KAD',
        employeeNo: `EMP-LEAVE-${runTag}`,
        jobTitle: 'Leave tester',
        department: 'Operations',
        employmentType: 'permanent',
        dateJoinedIso: '2025-01-15',
        baseSalaryNgn: 220_000,
      },
    });
    if (register.status() !== 201) {
      throw new Error(`Staff register failed (${register.status()}): ${await register.text()}`);
    }
    const staffUserId = (await register.json()).userId;
    await apiSignOut(page);

    // Staff submits a leave request that would go negative (30 days used vs default accrual 2 days).
    await apiSignIn(page, staffUsername, 'Staff@123456');
    const create = await page.request.post('/api/hr/requests', {
      data: {
        kind: 'leave',
        title: `Big leave ${runTag}`,
        body: 'Leave policy test.',
        payload: {
          leaveType: 'annual',
          startDateIso: '2026-03-01',
          endDateIso: '2026-03-30',
          daysRequested: 30,
          handoverTo: 'Supervisor',
          contactDuringLeave: 'Yes',
        },
      },
    });
    expect(create.status()).toBe(201);
    const requestId = (await create.json()).request?.id;
    const submit = await page.request.patch(`/api/hr/requests/${encodeURIComponent(requestId)}/submit`);
    expect(submit.status()).toBe(200);
    await apiSignOut(page);

    // HR manager approves leave.
    await apiSignIn(page, 'hr.manager', 'HrManager@12345!');
    const hr = await page.request.patch(`/api/hr/requests/${encodeURIComponent(requestId)}/hr-review`, {
      data: { approve: true, note: 'HR ok', reasonCode: 'policy' },
    });
    expect(hr.status()).toBe(200);
    const mgr = await page.request.patch(`/api/hr/requests/${encodeURIComponent(requestId)}/manager-review`, {
      data: { approve: true, note: 'Final ok', reasonCode: 'policy' },
    });
    expect(mgr.status()).toBe(200);
    const gm = await page.request.patch(`/api/hr/requests/${encodeURIComponent(requestId)}/manager-review`, {
      data: { approve: true, note: 'GM ok', reasonCode: 'policy' },
    });
    expect(gm.status()).toBe(200);

    // Recompute should be blocked due to negative balances.
    const recompute = await page.request.post('/api/hr/leave/recompute', {
      data: { periodYyyymm, leaveType: 'annual', accrualPerMonthDays: 2 },
    });
    expect(recompute.status()).toBe(400);
    const recomputeJson = await recompute.json();
    expect(recomputeJson.code).toBe('NEGATIVE_LEAVE_BALANCE');

    // Apply an adjustment to cover the deficit (+30 days).
    const adjust = await page.request.post('/api/hr/leave/adjust', {
      data: { userId: staffUserId, periodYyyymm, leaveType: 'annual', days: 30, note: 'Override entitlement' },
    });
    expect(adjust.status()).toBe(201);

    // Recompute should now succeed.
    const recompute2 = await page.request.post('/api/hr/leave/recompute', {
      data: { periodYyyymm, leaveType: 'annual', accrualPerMonthDays: 2 },
    });
    expect(recompute2.status()).toBe(200);

    const balances = await page.request.get(
      `/api/hr/leave/balances?userId=${encodeURIComponent(staffUserId)}&leaveType=annual&periodYyyymm=${periodYyyymm}`
    );
    expect(balances.status()).toBe(200);
    const balJson = await balances.json();
    const row = (balJson.balances || [])[0];
    expect(Number(row.usedDays)).toBe(30);
    expect(Number(row.closingDays)).toBeGreaterThanOrEqual(0);
  });
});

