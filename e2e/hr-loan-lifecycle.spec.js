import { test, expect } from '@playwright/test';
import { csrfHeader, signInViaApi } from './helpers/auth.js';

async function apiSignOut(page) {
  try {
    const headers = await csrfHeader(page);
    await page.request.post('/api/session/logout', { headers });
  } catch {
    /* no session */
  }
  await page.context().setExtraHTTPHeaders({});
  await page.context().clearCookies();
}

async function pickTreasuryAccountId(page) {
  const boot = await page.request.get('/api/bootstrap');
  expect(boot.status()).toBe(200);
  const json = await boot.json();
  const id = Number(json.treasuryAccounts?.[0]?.id || 0);
  expect(id).toBeGreaterThan(0);
  return id;
}

test.describe.configure({ timeout: 180_000 });

test.describe('HR loan lifecycle', () => {
  test('principal outstanding caps payroll deduction amount', async ({ page }) => {
    const runTag = `pw-loan-${Date.now()}`;
    const staffUsername = `pw.loan.staff.${runTag}`;
    const periodYyyymm = '202603';

    await signInViaApi(page, 'admin', 'Admin@123');
    const register = await page.request.post('/api/hr/staff/register', {
      data: {
        username: staffUsername,
        displayName: `PW Loan Staff ${runTag}`,
        password: 'Staff@123456',
        roleKey: 'viewer',
        workspaceDepartment: 'hr',
        branchId: 'BR-KAD',
        employeeNo: `EMP-LOAN-${runTag}`,
        jobTitle: 'Loan tester',
        department: 'Operations',
        employmentType: 'permanent',
        dateJoinedIso: '2025-01-15',
        baseSalaryNgn: 220_000,
      },
    });
    if (register.status() !== 201) throw new Error(await register.text());
    const staffUserId = (await register.json()).userId;
    await apiSignOut(page);

    await signInViaApi(page, staffUsername, 'Staff@123456');
    const create = await page.request.post('/api/hr/requests', {
      data: {
        kind: 'loan',
        title: `Loan ${runTag}`,
        body: 'Cap test',
        payload: { amountNgn: 50_000, repaymentMonths: 5, deductionPerMonthNgn: 10_000, purpose: 'Test' },
      },
    });
    expect(create.status()).toBe(201);
    const loanId = (await create.json()).request?.id;
    const submit = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/submit`);
    expect(submit.status()).toBe(200);
    await apiSignOut(page);

    await signInViaApi(page, 'hr.manager', 'HrManager@12345!');
    expect(
      (
        await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/hr-review`, {
          data: { approve: true, note: 'HR ok', reasonCode: 'policy' },
        })
      )
        .status()
    ).toBe(200);
    expect(
      (
        await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/manager-review`, {
          data: { approve: true, note: 'Approve', reasonCode: 'policy' },
        })
      ).status()
    ).toBe(200);

    const list = await page.request.get('/api/hr/requests?kind=loan');
    const listJson = await list.json();
    const row = (listJson.requests || []).find((r) => r.id === loanId);
    const prId = row?.payload?.financePaymentRequestId;
    expect(String(prId || '')).toBeTruthy();
    await apiSignOut(page);

    await signInViaApi(page, 'finance.manager', 'Finance@123');
    expect(
      (await page.request.post(`/api/payment-requests/${encodeURIComponent(prId)}/decision`, { data: { status: 'Approved' } }))
        .status()
    ).toBe(200);
    const treasuryAccountId = await pickTreasuryAccountId(page);
    expect(
      (
        await page.request.post(`/api/payment-requests/${encodeURIComponent(prId)}/pay`, {
          data: { treasuryAccountId, amountNgn: 50_000, reference: `PW-${runTag}` },
        })
      ).status()
    ).toBe(201);
    await apiSignOut(page);

    await signInViaApi(page, 'hr.manager', 'HrManager@12345!');
    const maint = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/loan-maintenance`, {
      data: { principalOutstandingNgn: 5_000, deductionPerMonthNgn: 10_000, note: 'Cap principal for test' },
    });
    expect(maint.status()).toBe(200);

    const createRun = await page.request.post('/api/hr/payroll-runs', { data: { periodYyyymm } });
    expect(createRun.status()).toBe(201);
    const runId = (await createRun.json()).id;
    expect((await page.request.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`)).status()).toBe(200);
    const detail = await page.request.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`);
    const detailJson = await detail.json();
    const line = (detailJson.lines || []).find((l) => l.userId === staffUserId);
    const loanDed = (line.loanDeductions || []).find((d) => d.hrRequestId === loanId);
    expect(Number(loanDed.amountNgn)).toBe(5_000);
  });
});
