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

async function pickTreasuryAccountId(page) {
  const boot = await page.request.get('/api/bootstrap');
  expect(boot.status()).toBe(200);
  const json = await boot.json();
  const id = Number(json.treasuryAccounts?.[0]?.id || 0);
  expect(id).toBeGreaterThan(0);
  return id;
}

test.describe.configure({ timeout: 180_000 });

test.describe('HR edge cases', () => {
  test('rejected HR request does not reach manager approval', async ({ page }) => {
    const runTag = `pw-edge-${Date.now()}`;
    const staffUsername = `pw.edge.staff.${runTag}`;

    await apiSignIn(page, 'admin', 'Admin@123');
    const register = await page.request.post('/api/hr/staff/register', {
      data: {
        username: staffUsername,
        displayName: `PW Edge Staff ${runTag}`,
        password: 'Staff@123456',
        roleKey: 'viewer',
        workspaceDepartment: 'hr',
        branchId: 'BR-KAD',
        employeeNo: `EMP-EDGE-${runTag}`,
        jobTitle: 'Edge tester',
        department: 'Operations',
        employmentType: 'permanent',
        dateJoinedIso: '2025-01-15',
        baseSalaryNgn: 220_000,
      },
    });
    if (register.status() !== 201) {
      throw new Error(`Staff register failed (${register.status()}): ${await register.text()}`);
    }
    await apiSignOut(page);

    await apiSignIn(page, staffUsername, 'Staff@123456');
    const create = await page.request.post('/api/hr/requests', {
      data: {
        kind: 'leave',
        title: `Leave ${runTag}`,
        body: 'Test rejection.',
        payload: {
          leaveType: 'annual',
          startDateIso: '2026-03-10',
          endDateIso: '2026-03-11',
          daysRequested: 2,
          handoverTo: 'Supervisor',
          contactDuringLeave: 'Yes',
        },
      },
    });
    expect(create.status()).toBe(201);
    const createJson = await create.json();
    const requestId = createJson.request?.id;
    expect(String(requestId)).toMatch(/^HRR-/);
    const submit = await page.request.patch(`/api/hr/requests/${encodeURIComponent(requestId)}/submit`);
    expect(submit.status()).toBe(200);
    await apiSignOut(page);

    await apiSignIn(page, 'admin', 'Admin@123');
    const reject = await page.request.patch(`/api/hr/requests/${encodeURIComponent(requestId)}/hr-review`, {
      data: { approve: false, note: 'Rejected by HR (Playwright edge)' },
    });
    expect(reject.status()).toBe(200);

    const list = await page.request.get('/api/hr/requests?kind=leave');
    expect(list.status()).toBe(200);
    const listJson = await list.json();
    const row = (listJson.requests || []).find((r) => r.id === requestId);
    expect(row).toBeTruthy();
    expect(row.status).toBe('rejected');

    // Manager approve should fail because it is no longer in manager_review.
    const mgr = await page.request.patch(`/api/hr/requests/${encodeURIComponent(requestId)}/manager-review`, {
      data: { approve: true, note: 'Should not be allowed' },
    });
    expect(mgr.status()).toBe(400);
  });

  test('multiple active loans are deducted together; closing one stops its deduction', async ({ page }) => {
    const runTag = `pw-edge-${Date.now()}`;
    const staffUsername = `pw.edge.loans.${runTag}`;
    const periodYyyymm = '202603';

    await apiSignIn(page, 'admin', 'Admin@123');
    const treasuryAccountId = await pickTreasuryAccountId(page);

    const register = await page.request.post('/api/hr/staff/register', {
      data: {
        username: staffUsername,
        displayName: `PW Edge Loans ${runTag}`,
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
    if (register.status() !== 201) {
      throw new Error(`Staff register failed (${register.status()}): ${await register.text()}`);
    }
    const regJson = await register.json();
    const staffUserId = regJson.userId;
    await apiSignOut(page);

    // Staff creates and submits 2 loans.
    await apiSignIn(page, staffUsername, 'Staff@123456');
    const mkLoan = async (idx, amountNgn, deductionPerMonthNgn) => {
      const c = await page.request.post('/api/hr/requests', {
        data: {
          kind: 'loan',
          title: `Loan ${idx} ${runTag}`,
          body: 'Multiple loans test.',
          payload: {
            amountNgn,
            repaymentMonths: 5,
            deductionPerMonthNgn,
            purpose: 'Edge test',
          },
        },
      });
      expect(c.status()).toBe(201);
      const cj = await c.json();
      const id = cj.request?.id;
      expect(String(id)).toMatch(/^HRR-/);
      const s = await page.request.patch(`/api/hr/requests/${encodeURIComponent(id)}/submit`);
      expect(s.status()).toBe(200);
      return id;
    };
    const loan1 = await mkLoan(1, 50_000, 10_000);
    const loan2 = await mkLoan(2, 40_000, 8_000);
    await apiSignOut(page);

    // Admin approves both and disburses them.
    await apiSignIn(page, 'admin', 'Admin@123');
    const approveLoan = async (loanId) => {
      const hr = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/hr-review`, {
        data: { approve: true, note: 'HR ok' },
      });
      expect(hr.status()).toBe(200);
      const mgr = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/manager-review`, {
        data: { approve: true, note: 'Exec ok' },
      });
      if (mgr.status() !== 200) {
        throw new Error(`Manager approve failed (${mgr.status()}): ${await mgr.text()}`);
      }
    };
    await approveLoan(loan1);
    await approveLoan(loan2);

    const listLoans = await page.request.get('/api/hr/requests?kind=loan');
    const listLoansJson = await listLoans.json();
    const row1 = (listLoansJson.requests || []).find((r) => r.id === loan1);
    const row2 = (listLoansJson.requests || []).find((r) => r.id === loan2);
    const pr1 = row1?.payload?.financePaymentRequestId;
    const pr2 = row2?.payload?.financePaymentRequestId;
    expect(String(pr1 || '')).toBeTruthy();
    expect(String(pr2 || '')).toBeTruthy();

    const approveAndPay = async (prId, amountNgn, ref) => {
      const dec = await page.request.post(`/api/payment-requests/${encodeURIComponent(prId)}/decision`, {
        data: { status: 'Approved', note: 'Approve payout' },
      });
      expect(dec.status()).toBe(200);
      const pay = await page.request.post(`/api/payment-requests/${encodeURIComponent(prId)}/pay`, {
        data: { treasuryAccountId, amountNgn, reference: ref, note: 'Pay loan' },
      });
      expect(pay.status()).toBe(201);
    };
    await approveAndPay(pr1, 50_000, `PW-EDGE-${runTag}-L1`);
    await approveAndPay(pr2, 40_000, `PW-EDGE-${runTag}-L2`);

    // Payroll run should show both loan deductions.
    const createRun = await page.request.post('/api/hr/payroll-runs', { data: { periodYyyymm } });
    expect(createRun.status()).toBe(201);
    const runId = (await createRun.json()).id;
    const recompute = await page.request.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`);
    expect(recompute.status()).toBe(200);
    const detail = await page.request.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`);
    const detailJson = await detail.json();
    const line = (detailJson.lines || []).find((l) => l.userId === staffUserId);
    expect(line).toBeTruthy();
    const loans = line.loanDeductions || [];
    const l1 = loans.find((x) => x.hrRequestId === loan1);
    const l2 = loans.find((x) => x.hrRequestId === loan2);
    expect(l1?.amountNgn).toBe(10_000);
    expect(l2?.amountNgn).toBe(8_000);
    expect(Number(line.otherDeductionNgn)).toBeGreaterThanOrEqual(18_000);

    // Close loan2 early; next recompute should stop deducting it.
    const close = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loan2)}/loan-maintenance`, {
      data: { closeLoan: true, note: 'Closed early (edge test)' },
    });
    expect(close.status()).toBe(200);

    // Unlock / recompute same draft run, then verify only loan1 is present.
    const unlock = await page.request.patch(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`, {
      data: { status: 'draft' },
    });
    expect(unlock.status()).toBe(200);
    const recompute2 = await page.request.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`);
    expect(recompute2.status()).toBe(200);
    const detail2 = await page.request.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`);
    const detail2Json = await detail2.json();
    const line2 = (detail2Json.lines || []).find((l) => l.userId === staffUserId);
    const loans2 = line2.loanDeductions || [];
    expect(loans2.find((x) => x.hrRequestId === loan1)).toBeTruthy();
    expect(loans2.find((x) => x.hrRequestId === loan2)).toBeFalsy();
  });
});

