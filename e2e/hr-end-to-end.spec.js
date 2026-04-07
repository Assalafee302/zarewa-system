import { test, expect } from '@playwright/test';

async function apiSignIn(page, username, password) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /open your workspace/i })).toBeVisible({
    timeout: 15_000,
  });
  const loginRes = await page.request.post('/api/session/login', { data: { username, password } });
  const bodyText = await loginRes.text();
  expect(loginRes.status(), bodyText).toBe(200);
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible({ timeout: 20_000 });
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'zarewa_csrf')?.value;
  expect(String(csrf || '')).toBeTruthy();
  await page.context().setExtraHTTPHeaders({ 'x-csrf-token': csrf });
  const sess = await page.request.get('/api/session');
  expect(sess.status(), await sess.text()).toBe(200);
}

async function apiSignOut(page) {
  await page.request.post('/api/session/logout');
  await page.context().setExtraHTTPHeaders({});
  await page.context().clearCookies();
}

async function apiAcceptRequiredPolicies(page, signatureName) {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'zarewa_csrf')?.value;
  const headers = csrf ? { 'x-csrf-token': csrf } : {};
  const reqs = await page.request.get('/api/hr/policy-requirements');
  if (reqs.status() !== 200) return;
  const json = await reqs.json().catch(() => null);
  const missing = Array.isArray(json?.missing) ? json.missing : [];
  for (const p of missing) {
    const ack = await page.request.post('/api/hr/policy-acknowledgements', {
      data: {
        policyKey: p.key,
        policyVersion: p.version,
        signatureName,
        context: { channel: 'playwright' },
      },
      headers,
    });
    expect(ack.status(), await ack.text()).toBe(201);
  }
}

async function pickTreasuryAccountId(page) {
  const boot = await page.request.get('/api/bootstrap');
  expect(boot.status()).toBe(200);
  const json = await boot.json();
  expect(json.ok).toBe(true);
  const id = Number(json.treasuryAccounts?.[0]?.id || 0);
  expect(id).toBeGreaterThan(0);
  return id;
}

test.describe.configure({ timeout: 180_000 });

test.describe('HR end-to-end (staff → requests → approvals → disbursement → payroll deductions)', () => {
  test('loan is disbursed then automatically deducted on payroll paid', async ({ page }) => {
    const runTag = `pw-${Date.now()}`;
    const staffUsername = `pw.staff.${runTag}`;
    const staffDisplayName = `Playwright Staff ${runTag}`;

    // Admin registers staff with a payrollable salary.
    await apiSignIn(page, 'admin', 'Admin@123');
    await apiAcceptRequiredPolicies(page, 'Admin');
    const register = await page.request.post('/api/hr/staff/register', {
      data: {
        username: staffUsername,
        displayName: staffDisplayName,
        password: 'Staff@123456',
        roleKey: 'viewer',
        workspaceDepartment: 'hr',
        branchId: 'BR-KAD',
        employeeNo: `EMP-${runTag}`,
        jobTitle: 'Test operator',
        department: 'Operations',
        employmentType: 'permanent',
        dateJoinedIso: '2025-01-15',
        baseSalaryNgn: 220_000,
        housingAllowanceNgn: 20_000,
        transportAllowanceNgn: 10_000,
      },
    });
    if (register.status() !== 201) {
      throw new Error(`Staff register failed (${register.status()}): ${await register.text()}`);
    }
    const regJson = await register.json();
    expect(regJson.ok).toBe(true);
    const staffUserId = regJson.userId;
    expect(String(staffUserId)).toBeTruthy();
    const tenurePatch = await page.request.patch(`/api/hr/staff/${encodeURIComponent(staffUserId)}`, {
      data: { dateJoinedIso: '2018-01-15' },
    });
    expect(tenurePatch.status()).toBe(200);

    await apiSignOut(page);

    // Staff creates + submits loan + leave requests.
    await apiSignIn(page, staffUsername, 'Staff@123456');

    const loanCreate = await page.request.post('/api/hr/requests', {
      data: {
        kind: 'loan',
        title: `Loan request ${runTag}`,
        body: 'Need support for urgent expense.',
        payload: {
          amountNgn: 50_000,
          repaymentMonths: 5,
          deductionPerMonthNgn: 10_000,
          purpose: 'Emergency',
        },
      },
    });
    expect(loanCreate.status()).toBe(201);
    const loanJson = await loanCreate.json();
    expect(loanJson.ok).toBe(true);
    const loanRequestId = loanJson.request?.id;
    expect(String(loanRequestId)).toMatch(/^HRR-/);

    const loanSubmit = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanRequestId)}/submit`);
    expect(loanSubmit.status()).toBe(200);

    const leaveCreate = await page.request.post('/api/hr/requests', {
      data: {
        kind: 'leave',
        title: `Leave request ${runTag}`,
        body: 'Annual leave.',
        payload: {
          leaveType: 'annual',
          startDateIso: '2026-03-10',
          endDateIso: '2026-03-14',
          // Policy: leave recompute blocks negative balances unless adjusted. Keep within default accrual.
          daysRequested: 2,
          handoverTo: 'Supervisor',
          contactDuringLeave: 'Yes',
        },
      },
    });
    expect(leaveCreate.status()).toBe(201);
    const leaveJson = await leaveCreate.json();
    expect(leaveJson.ok).toBe(true);
    const leaveRequestId = leaveJson.request?.id;
    expect(String(leaveRequestId)).toMatch(/^HRR-/);

    const leaveSubmit = await page.request.patch(`/api/hr/requests/${encodeURIComponent(leaveRequestId)}/submit`);
    expect(leaveSubmit.status()).toBe(200);

    await apiSignOut(page);

    // Admin approves requests (HR review + executive review).
    await apiSignIn(page, 'admin', 'Admin@123');
    await apiAcceptRequiredPolicies(page, 'Admin');

    const hrApproveLoan = await page.request.patch(
      `/api/hr/requests/${encodeURIComponent(loanRequestId)}/hr-review`,
      { data: { approve: true, note: 'HR reviewed (Playwright)', reasonCode: 'policy' } }
    );
    expect(hrApproveLoan.status()).toBe(200);

    const mgrApproveLoan = await page.request.patch(
      `/api/hr/requests/${encodeURIComponent(loanRequestId)}/manager-review`,
      { data: { approve: true, note: 'Approved (Playwright)', reasonCode: 'policy' } }
    );
    expect(mgrApproveLoan.status()).toBe(200);
    const gmApproveLoan = await page.request.patch(
      `/api/hr/requests/${encodeURIComponent(loanRequestId)}/manager-review`,
      { data: { approve: true, note: 'GM ok (Playwright)', reasonCode: 'policy' } }
    );
    expect(gmApproveLoan.status()).toBe(200);

    const hrApproveLeave = await page.request.patch(
      `/api/hr/requests/${encodeURIComponent(leaveRequestId)}/hr-review`,
      { data: { approve: true, note: 'HR reviewed leave (Playwright)', reasonCode: 'policy' } }
    );
    expect(hrApproveLeave.status()).toBe(200);

    const mgrApproveLeave = await page.request.patch(
      `/api/hr/requests/${encodeURIComponent(leaveRequestId)}/manager-review`,
      { data: { approve: true, note: 'Approved leave (Playwright)', reasonCode: 'policy' } }
    );
    expect(mgrApproveLeave.status()).toBe(200);
    const gmApproveLeave = await page.request.patch(
      `/api/hr/requests/${encodeURIComponent(leaveRequestId)}/manager-review`,
      { data: { approve: true, note: 'GM leave ok (Playwright)', reasonCode: 'policy' } }
    );
    expect(gmApproveLeave.status()).toBe(200);

    // Leave balances: recompute for the leave start month and assert usedDays reflects the approved leave.
    const leaveRecompute = await page.request.post('/api/hr/leave/recompute', {
      data: { periodYyyymm: '202603', leaveType: 'annual', accrualPerMonthDays: 2 },
    });
    expect(leaveRecompute.status()).toBe(200);
    const leaveBalances = await page.request.get(
      `/api/hr/leave/balances?userId=${encodeURIComponent(staffUserId)}&leaveType=annual&periodYyyymm=202603`
    );
    expect(leaveBalances.status()).toBe(200);
    const leaveBalancesJson = await leaveBalances.json();
    expect(leaveBalancesJson.ok).toBe(true);
    const bal = (leaveBalancesJson.balances || [])[0];
    expect(bal).toBeTruthy();
    expect(Number(bal.usedDays)).toBe(2);
    expect(Number(bal.closingDays)).toBeGreaterThanOrEqual(0);

    // Loan approval provisions a finance payment request; approve + pay it to mark the loan disbursed.
    const listLoans = await page.request.get('/api/hr/requests?kind=loan');
    expect(listLoans.status()).toBe(200);
    const listLoansJson = await listLoans.json();
    const loanRow = (listLoansJson.requests || []).find((r) => r.id === loanRequestId);
    expect(loanRow).toBeTruthy();
    const paymentRequestId = loanRow?.payload?.financePaymentRequestId;
    expect(String(paymentRequestId || '')).toBeTruthy();

    const approvePayReq = await page.request.post(
      `/api/payment-requests/${encodeURIComponent(paymentRequestId)}/decision`,
      { data: { status: 'Approved', note: 'Approve staff loan payout (Playwright)' } }
    );
    if (approvePayReq.status() !== 200) {
      throw new Error(`Payment request decision failed (${approvePayReq.status()}): ${await approvePayReq.text()}`);
    }

    const treasuryAccountId = await pickTreasuryAccountId(page);
    const payReq = await page.request.post(
      `/api/payment-requests/${encodeURIComponent(paymentRequestId)}/pay`,
      {
        data: {
          treasuryAccountId,
          amountNgn: 50_000,
          reference: `PW-LOAN-${runTag}`,
          note: 'Disburse staff loan (Playwright)',
        },
      }
    );
    expect(payReq.status()).toBe(201);

    // Payroll run recompute should include the active loan deduction.
    const periodYyyymm = '202603';
    const createRun = await page.request.post('/api/hr/payroll-runs', { data: { periodYyyymm } });
    expect(createRun.status()).toBe(201);
    const runJson = await createRun.json();
    expect(runJson.ok).toBe(true);
    const runId = runJson.id;
    expect(String(runId)).toMatch(/^HRP-/);

    const recompute = await page.request.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`);
    expect(recompute.status()).toBe(200);
    const recomputeJson = await recompute.json();
    expect(recomputeJson.ok).toBe(true);

    const runDetail = await page.request.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`);
    expect(runDetail.status()).toBe(200);
    const runDetailJson = await runDetail.json();
    const staffLine = (runDetailJson.lines || []).find((l) => l.userId === staffUserId);
    expect(staffLine, 'Expected payroll line for the newly registered staff user').toBeTruthy();
    const loanDed = (staffLine.loanDeductions || []).find((d) => d.hrRequestId === loanRequestId);
    expect(loanDed, 'Expected loan line to be present in payroll loan deductions').toBeTruthy();
    expect(Number(loanDed.amountNgn)).toBe(10_000);
    expect(Number(staffLine.otherDeductionNgn)).toBeGreaterThanOrEqual(10_000);

    // Payroll math invariants (rounded NGN integers):
    // gross = base + housing + transport + bonus - attendanceDeduction
    // net = gross - tax - pension - otherDeduction
    const round = (v) => Math.round(Number(v) || 0);
    const expectedGross =
      round(220_000) + round(20_000) + round(10_000) + round(staffLine.bonusNgn) - round(staffLine.attendanceDeductionNgn);
    expect(round(staffLine.grossNgn)).toBe(expectedGross);
    expect(round(staffLine.otherDeductionNgn)).toBeGreaterThanOrEqual(round(loanDed.amountNgn));
    const expectedNet =
      round(staffLine.grossNgn) - round(staffLine.taxNgn) - round(staffLine.pensionNgn) - round(staffLine.otherDeductionNgn);
    expect(round(staffLine.netNgn)).toBe(expectedNet);
    expect(round(staffLine.netNgn)).toBeGreaterThan(0);

    // Mark run paid: this is where the system increments loan repayment counters / principal.
    const lock = await page.request.patch(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`, {
      data: { status: 'locked' },
    });
    expect(lock.status()).toBe(200);
    const paid = await page.request.patch(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`, {
      data: { status: 'paid' },
    });
    expect(paid.status()).toBe(200);

    // Verify HR loan payload updated after payroll paid.
    const listLoans2 = await page.request.get('/api/hr/requests?kind=loan');
    expect(listLoans2.status()).toBe(200);
    const listLoans2Json = await listLoans2.json();
    const loanRow2 = (listLoans2Json.requests || []).find((r) => r.id === loanRequestId);
    expect(loanRow2).toBeTruthy();
    expect(Number(loanRow2.payload?.loanMonthsDeducted || 0)).toBeGreaterThanOrEqual(1);
    if (Number.isFinite(Number(loanRow2.payload?.principalOutstandingNgn))) {
      expect(Number(loanRow2.payload?.principalOutstandingNgn)).toBeLessThan(50_000);
    }
  });
});

