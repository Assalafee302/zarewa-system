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

async function apiAcceptRequiredPolicies(page, signatureName) {
  const reqs = await page.request.get('/api/hr/policy-requirements');
  if (reqs.status() !== 200) return;
  const json = await reqs.json().catch(() => null);
  const missing = Array.isArray(json?.missing) ? json.missing : [];
  for (const p of missing) {
    await page.request.post('/api/hr/policy-acknowledgements', {
      data: {
        policyKey: p.key,
        policyVersion: p.version,
        signatureName,
        context: { channel: 'playwright' },
      },
    });
  }
}

test.describe.configure({ timeout: 180_000 });

test.describe('HR attendance deductions', () => {
  test('attendance upload + late days produce expected attendanceDeductionNgn in payroll', async ({ page }) => {
    const runTag = `pw-att-${Date.now()}`;
    const periodYyyymm = '202603';
    const branchId = 'BR-KAD';
    const username = `pw.att.${runTag}`;

    // Admin creates staff with known salary.
    await apiSignIn(page, 'admin', 'Admin@123');
    await apiAcceptRequiredPolicies(page, 'Admin');
    const register = await page.request.post('/api/hr/staff/register', {
      data: {
        username,
        displayName: `PW Attendance ${runTag}`,
        password: 'Staff@123456',
        roleKey: 'viewer',
        workspaceDepartment: 'hr',
        branchId,
        employeeNo: `EMP-ATT-${runTag}`,
        jobTitle: 'Attendance tester',
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
    const staffUserId = (await register.json()).userId;

    // Upload attendance: absentDays=2.
    const upload = await page.request.post('/api/hr/attendance/upload', {
      data: {
        branchId,
        periodYyyymm,
        notes: `PW upload ${runTag}`,
        rows: [{ userId: staffUserId, absentDays: 2, minutesLate: 0 }],
      },
    });
    expect(upload.status()).toBe(201);

    // Daily roll: mark 3 late days within March 2026.
    const lateDays = ['2026-03-03', '2026-03-07', '2026-03-21'];
    for (const dayIso of lateDays) {
      const roll = await page.request.post('/api/hr/daily-roll', {
        data: {
          branchId,
          dayIso,
          rows: [{ userId: staffUserId, status: 'late' }],
          notes: `PW late day ${runTag}`,
        },
      });
      expect(roll.status()).toBe(200);
    }

    // Payroll recompute should reflect absent + late days.
    const createRun = await page.request.post('/api/hr/payroll-runs', { data: { periodYyyymm } });
    expect(createRun.status()).toBe(201);
    const runId = (await createRun.json()).id;
    const recompute = await page.request.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`);
    expect(recompute.status()).toBe(200);
    const detail = await page.request.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`);
    expect(detail.status()).toBe(200);
    const detailJson = await detail.json();
    const line = (detailJson.lines || []).find((l) => l.userId === staffUserId);
    expect(line).toBeTruthy();

    const dailyRate = Math.round(220_000 / 22);
    const expectedAttendanceDeduction = dailyRate * (2 + lateDays.length);
    expect(Math.round(Number(line.attendanceDeductionNgn) || 0)).toBe(expectedAttendanceDeduction);
  });
});

