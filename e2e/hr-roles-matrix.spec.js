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

test.describe('HR approval/payment role matrix', () => {
  test('sales staff cannot HR-review; finance manager can HR-review + final-approve + pay', async ({ page }) => {
    const runTag = `pw-roles-${Date.now()}`;
    const staffUsername = `pw.roles.staff.${runTag}`;

    // Admin registers staff.
    await apiSignIn(page, 'admin', 'Admin@123');
    const register = await page.request.post('/api/hr/staff/register', {
      data: {
        username: staffUsername,
        displayName: `PW Roles Staff ${runTag}`,
        password: 'Staff@123456',
        roleKey: 'viewer',
        workspaceDepartment: 'hr',
        branchId: 'BR-KAD',
        employeeNo: `EMP-ROLES-${runTag}`,
        jobTitle: 'Roles tester',
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

    // Staff creates + submits a loan request.
    await apiSignIn(page, staffUsername, 'Staff@123456');
    const loanCreate = await page.request.post('/api/hr/requests', {
      data: {
        kind: 'loan',
        title: `Loan ${runTag}`,
        body: 'Roles matrix test loan.',
        payload: { amountNgn: 30_000, repaymentMonths: 3, deductionPerMonthNgn: 10_000, purpose: 'Test' },
      },
    });
    expect(loanCreate.status()).toBe(201);
    const loanId = (await loanCreate.json()).request?.id;
    expect(String(loanId)).toMatch(/^HRR-/);
    const submit = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/submit`);
    expect(submit.status()).toBe(200);
    await apiSignOut(page);

    // Sales staff cannot do HR review (should be 403).
    await apiSignIn(page, 'sales.staff', 'Sales@123');
    const hrReviewForbidden = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/hr-review`, {
      data: { approve: true, note: 'Attempt HR review' },
    });
    expect(hrReviewForbidden.status()).toBe(403);
    await apiSignOut(page);

    // HR manager performs HR review + final approval.
    await apiSignIn(page, 'hr.manager', 'HrManager@12345!');
    const hrApprove = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/hr-review`, {
      data: { approve: true, note: 'HR approve by HR manager', reasonCode: 'policy' },
    });
    expect(hrApprove.status()).toBe(200);
    // HR manager performs final approval (manager review) and provisions finance queue.
    const mgrApprove = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/manager-review`, {
      data: { approve: true, note: 'Final approve by HR manager', reasonCode: 'policy' },
    });
    if (mgrApprove.status() !== 200) {
      throw new Error(`Manager approve failed (${mgrApprove.status()}): ${await mgrApprove.text()}`);
    }

    const listLoans = await page.request.get('/api/hr/requests?kind=loan');
    expect(listLoans.status()).toBe(200);
    const listLoansJson = await listLoans.json();
    const loanRow = (listLoansJson.requests || []).find((r) => r.id === loanId);
    expect(loanRow).toBeTruthy();
    const paymentRequestId = loanRow?.payload?.financePaymentRequestId;
    expect(String(paymentRequestId || '')).toBeTruthy();

    await apiSignOut(page);

    // Approve + pay payment request (finance manager has finance.approve + finance.pay).
    await apiSignIn(page, 'finance.manager', 'Finance@123');
    const dec = await page.request.post(`/api/payment-requests/${encodeURIComponent(paymentRequestId)}/decision`, {
      data: { status: 'Approved', note: 'Approve loan payout' },
    });
    expect(dec.status()).toBe(200);

    const treasuryAccountId = await pickTreasuryAccountId(page);
    const pay = await page.request.post(`/api/payment-requests/${encodeURIComponent(paymentRequestId)}/pay`, {
      data: { treasuryAccountId, amountNgn: 30_000, reference: `PW-ROLES-${runTag}`, note: 'Pay loan' },
    });
    expect(pay.status()).toBe(201);
  });
});

