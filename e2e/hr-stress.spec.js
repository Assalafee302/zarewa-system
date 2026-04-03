import { test, expect } from '@playwright/test';
import { signInViaApi } from './helpers/auth.js';

async function pickTreasuryAccountId(page) {
  const boot = await page.request.get('/api/bootstrap');
  expect(boot.status()).toBe(200);
  const json = await boot.json();
  const id = Number(json.treasuryAccounts?.[0]?.id || 0);
  expect(id).toBeGreaterThan(0);
  return id;
}

test.describe.configure({ timeout: 300_000 });

test.describe('HR stress (opt-in)', () => {
  test.skip(!process.env.HR_STRESS, 'Set HR_STRESS=1 to run HR stress suite.');

  test('bulk staff loans end-to-end; payroll deductions consistent', async ({ page }) => {
    const runTag = `pw-stress-${Date.now()}`;
    const N = Math.max(5, Math.min(60, Number(process.env.HR_STRESS_N || 12)));
    const periodYyyymm = String(process.env.HR_STRESS_PERIOD || '202603').replace(/\D/g, '').slice(0, 6);
    const maxMs = Math.max(5_000, Number(process.env.HR_STRESS_MAX_MS || 120_000));
    expect(periodYyyymm).toMatch(/^\d{6}$/);

    await signInViaApi(page, 'admin', 'Admin@123');
    const treasuryAccountId = await pickTreasuryAccountId(page);

    const staff = [];
    const t0 = Date.now();
    for (let i = 0; i < N; i += 1) {
      const username = `pw.s${i}.${runTag}`;
      const displayName = `PW Stress ${i} ${runTag}`;
      const register = await page.request.post('/api/hr/staff/register', {
        data: {
          username,
          displayName,
          password: 'Staff@123456',
          roleKey: 'viewer',
          workspaceDepartment: 'hr',
          branchId: 'BR-KAD',
          employeeNo: `EMP-${i}-${runTag}`,
          jobTitle: 'Stress test',
          department: 'Operations',
          employmentType: 'permanent',
          dateJoinedIso: '2025-01-15',
          baseSalaryNgn: 220_000,
          housingAllowanceNgn: 0,
          transportAllowanceNgn: 0,
        },
      });
      if (register.status() !== 201) {
        throw new Error(`Staff register failed (${register.status()}): ${await register.text()}`);
      }
      const regJson = await register.json();
      staff.push({ userId: regJson.userId, username });
    }
    const tRegisterMs = Date.now() - t0;

    // Create + approve + disburse loans in bulk (admin acts as requester to avoid cookie juggling).
    // This still exercises the full backend workflow: HR request creation → submit → hr-review → manager-review → finance queue → approval → pay.
    const loanIds = [];
    const t1 = Date.now();
    for (let i = 0; i < staff.length; i += 1) {
      const s = staff[i];
      const loanCreate = await page.request.post('/api/hr/requests', {
        data: {
          kind: 'loan',
          title: `Stress loan ${i} ${runTag}`,
          body: 'Stress scenario loan.',
          payload: {
            amountNgn: 30_000,
            repaymentMonths: 3,
            deductionPerMonthNgn: 10_000,
            purpose: 'Stress test',
          },
        },
      });
      expect(loanCreate.status()).toBe(201);
      const loanJson = await loanCreate.json();
      const loanId = loanJson.request?.id;
      loanIds.push({ loanId, staffUserId: s.userId });

      const submit = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/submit`);
      expect(submit.status()).toBe(200);

      const hr = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/hr-review`, {
        data: { approve: true, note: 'Stress HR approve', reasonCode: 'policy' },
      });
      expect(hr.status()).toBe(200);

      const mgr = await page.request.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/manager-review`, {
        data: { approve: true, note: 'Stress manager approve', reasonCode: 'policy' },
      });
      if (mgr.status() !== 200) {
        throw new Error(`Manager approve failed (${mgr.status()}): ${await mgr.text()}`);
      }
    }
    const tApproveMs = Date.now() - t1;

    // Resolve finance queue: approve + pay each linked payment request.
    const listLoans = await page.request.get('/api/hr/requests?kind=loan');
    expect(listLoans.status()).toBe(200);
    const listLoansJson = await listLoans.json();
    const byId = new Map((listLoansJson.requests || []).map((r) => [r.id, r]));
    for (const { loanId } of loanIds) {
      const row = byId.get(loanId);
      expect(row).toBeTruthy();
      const prId = row.payload?.financePaymentRequestId;
      expect(String(prId || '')).toBeTruthy();

      const approve = await page.request.post(`/api/payment-requests/${encodeURIComponent(prId)}/decision`, {
        data: { status: 'Approved', note: 'Stress approve payout' },
      });
      expect(approve.status()).toBe(200);

      const pay = await page.request.post(`/api/payment-requests/${encodeURIComponent(prId)}/pay`, {
        data: {
          treasuryAccountId,
          amountNgn: 30_000,
          reference: `PW-STRESS-${runTag}-${loanId}`,
          note: 'Stress pay',
        },
      });
      expect(pay.status()).toBe(201);
    }
    const tDisburseMs = Date.now() - t1;

    // Payroll recompute: total other deductions should be >= sum of loan deductions.
    const t2 = Date.now();
    const createRun = await page.request.post('/api/hr/payroll-runs', { data: { periodYyyymm } });
    expect(createRun.status()).toBe(201);
    const runJson = await createRun.json();
    const runId = runJson.id;

    const recompute = await page.request.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`);
    expect(recompute.status()).toBe(200);

    const detail = await page.request.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`);
    expect(detail.status()).toBe(200);
    const detailJson = await detail.json();

    let totalLoanDed = 0;
    let totalOtherDed = 0;
    for (const line of detailJson.lines || []) {
      totalOtherDed += Math.round(Number(line.otherDeductionNgn) || 0);
      for (const ld of line.loanDeductions || []) {
        totalLoanDed += Math.round(Number(ld.amountNgn) || 0);
      }
    }
    // Each loan should contribute 10k/month as configured.
    expect(totalLoanDed).toBeGreaterThanOrEqual(N * 10_000);
    expect(totalOtherDed).toBeGreaterThanOrEqual(totalLoanDed);
    const tPayrollMs = Date.now() - t2;

    // Mark paid to push loan repayment counters.
    const lock = await page.request.patch(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`, {
      data: { status: 'locked' },
    });
    expect(lock.status()).toBe(200);
    const paid = await page.request.patch(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`, {
      data: { status: 'paid' },
    });
    expect(paid.status()).toBe(200);

    const listLoans2 = await page.request.get('/api/hr/requests?kind=loan');
    const listLoans2Json = await listLoans2.json();
    const rows2 = listLoans2Json.requests || [];
    for (const { loanId } of loanIds) {
      const row = rows2.find((r) => r.id === loanId);
      expect(row).toBeTruthy();
      expect(Number(row.payload?.loanMonthsDeducted || 0)).toBeGreaterThanOrEqual(1);
    }

    const totalMs = Date.now() - t0;
    // Soft performance gate: configurable. Helps detect regressions without being too flaky locally.
    expect(
      { totalMs, tRegisterMs, tApproveMs, tDisburseMs, tPayrollMs },
      `HR stress exceeded max duration ${maxMs}ms`
    ).toMatchObject({ totalMs: expect.any(Number) });
    expect(totalMs).toBeLessThanOrEqual(maxMs);
  });
});

