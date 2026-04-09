import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createDatabase } from './db.js';
import { createApp } from './app.js';

describe.sequential('Zarewa API', () => {
  let app;
  let agent;
  let db;

  async function loginAs(client, username = 'admin', password = 'Admin@123') {
    const res = await client.post('/api/session/login').send({ username, password });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    return res;
  }

  async function acceptAllRequiredPolicies(client, signatureName = 'Test User') {
    const reqs = await client.get('/api/hr/policy-requirements');
    expect(reqs.status).toBe(200);
    for (const p of reqs.body.missing || []) {
      const ack = await client.post('/api/hr/policy-acknowledgements').send({
        policyKey: p.key,
        policyVersion: p.version,
        signatureName,
        context: { channel: 'api.test' },
      });
      expect(ack.status).toBe(201);
    }
  }

  beforeEach(async () => {
    db = createDatabase(':memory:');
    app = createApp(db);
    agent = request.agent(app);
    await loginAs(agent);
  });

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/ai/status reports disabled when no AI key is set', async () => {
    const res = await agent.get('/api/ai/status');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.enabled).toBe(false);
  });

  it('POST /api/ai/chat returns 503 when AI is not configured', async () => {
    const res = await agent.post('/api/ai/chat').send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });

  it('GET /api/bootstrap requires authentication', async () => {
    const res = await request(app).get('/api/bootstrap');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('POST /api/session/login and GET /api/bootstrap return session payload', async () => {
    const loginRes = await request(app).post('/api/session/login').send({
      username: 'admin',
      password: 'Admin@123',
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.username).toBe('admin');
    expect(loginRes.body.user.department).toBe('it');

    const signedAgent = request.agent(app);
    await loginAs(signedAgent);
    const res = await signedAgent.get('/api/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.session.authenticated).toBe(true);
    expect(res.body.session.user.username).toBe('admin');
    expect(Array.isArray(res.body.customers)).toBe(true);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(Array.isArray(res.body.purchaseOrders)).toBe(true);
    expect(res.body.ledgerEntries).toBeDefined();
    expect(Array.isArray(res.body.advanceInEvents)).toBe(true);
    expect(Array.isArray(res.body.treasuryMovements)).toBe(true);
    expect(Array.isArray(res.body.productionJobs)).toBe(true);
    expect(Array.isArray(res.body.productionJobCoils)).toBe(true);
    expect(res.body.masterData).toBeDefined();
    expect(Array.isArray(res.body.masterData.quoteItems)).toBe(true);
    expect(res.body.masterData.quoteItems.length).toBeGreaterThan(0);
    expect(res.body.dashboardPrefs).toBeDefined();
    expect(typeof res.body.dashboardPrefs).toBe('object');
    expect(res.body).toHaveProperty('orgManagerTargets');
    expect(Array.isArray(res.body.workspaceDepartmentIds)).toBe(true);
    expect(res.body.workspaceDepartmentIds).toContain('sales');
    expect(res.body.suggestedRoleByDepartment?.sales).toBe('sales_staff');
  });

  it('GET /api/workspace/search returns 403 for ceo', async () => {
    const ceoAgent = request.agent(app);
    await loginAs(ceoAgent, 'ceo', 'Ceo@1234567890!');
    const res = await ceoAgent.get('/api/workspace/search?q=CU');
    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  it('GET /api/workspace/search returns structured hits for admin', async () => {
    const res = await agent.get('/api/workspace/search?q=musa&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results.some((r) => r.kind === 'customer')).toBe(true);
  });

  it('GET /api/roles returns role catalog and permission keys for settings users', async () => {
    const signedAgent = request.agent(app);
    await loginAs(signedAgent);
    const res = await signedAgent.get('/api/roles');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.roles)).toBe(true);
    expect(res.body.roles.some((r) => r.key === 'admin')).toBe(true);
    expect(Array.isArray(res.body.permissionKeys)).toBe(true);
    expect(res.body.permissionKeys.includes('dashboard.view')).toBe(true);
  });

  it('POST /api/users creates a login when admin has settings.view', async () => {
    const signedAgent = request.agent(app);
    await loginAs(signedAgent);
    const res = await signedAgent.post('/api/users').send({
      username: 'e2e.created.user',
      displayName: 'E2E Created',
      password: 'TempPass@999!',
      roleKey: 'viewer',
      department: 'general',
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.userId).toMatch(/^USR-/);
  });

  it('PATCH /api/session/dashboard-prefs persists and returns on bootstrap', async () => {
    const signedAgent = request.agent(app);
    await loginAs(signedAgent);
    const patch = await signedAgent.patch('/api/session/dashboard-prefs').send({
      showCharts: false,
      showReportsStrip: true,
      showAlertBanner: false,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.ok).toBe(true);
    expect(patch.body.dashboardPrefs.showCharts).toBe(false);
    expect(patch.body.dashboardPrefs.managerTargets).toBeDefined();
    expect(typeof patch.body.dashboardPrefs.managerTargets.nairaTargetPerMonth).toBe('number');
    expect(typeof patch.body.dashboardPrefs.managerTargets.meterTargetPerMonth).toBe('number');
    const boot = await signedAgent.get('/api/bootstrap');
    expect(boot.status).toBe(200);
    expect(boot.body.dashboardPrefs.showCharts).toBe(false);
    expect(boot.body.dashboardPrefs.showAlertBanner).toBe(false);
    expect(boot.body.dashboardPrefs.managerTargets?.nairaTargetPerMonth).toBeGreaterThan(0);
  });

  it('PATCH /api/setup/org-manager-targets persists and returns on bootstrap', async () => {
    const signedAgent = request.agent(app);
    await loginAs(signedAgent);
    const patch = await signedAgent.patch('/api/setup/org-manager-targets').send({
      nairaTargetPerMonth: 60_000_000,
      meterTargetPerMonth: 300_000,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.ok).toBe(true);
    expect(patch.body.orgManagerTargets.nairaTargetPerMonth).toBe(60_000_000);
    expect(patch.body.orgManagerTargets.meterTargetPerMonth).toBe(300_000);
    const boot = await signedAgent.get('/api/bootstrap');
    expect(boot.status).toBe(200);
    expect(boot.body.orgManagerTargets?.nairaTargetPerMonth).toBe(60_000_000);
    expect(boot.body.orgManagerTargets?.meterTargetPerMonth).toBe(300_000);
    const clear = await signedAgent.patch('/api/setup/org-manager-targets').send({ clear: true });
    expect(clear.status).toBe(200);
    expect(clear.body.orgManagerTargets).toBeNull();
  });

  it('PATCH /api/session/profile updates display name and returns on bootstrap', async () => {
    const signedAgent = request.agent(app);
    await loginAs(signedAgent);
    const patch = await signedAgent.patch('/api/session/profile').send({ displayName: 'Zarewa Admin Updated' });
    expect(patch.status).toBe(200);
    expect(patch.body.ok).toBe(true);
    expect(patch.body.user.displayName).toBe('Zarewa Admin Updated');
    const boot = await signedAgent.get('/api/bootstrap');
    expect(boot.status).toBe(200);
    expect(boot.body.session.user.displayName).toBe('Zarewa Admin Updated');
  });

  it('GET /api/customers returns seeded customers', async () => {
    const res = await agent.get('/api/customers');
    expect(res.status).toBe(200);
    expect(res.body.customers.length).toBeGreaterThanOrEqual(4);
    expect(res.body.customers.some((c) => c.customerID === 'CUS-001')).toBe(true);
  });

  it('PATCH /api/customers/:id updates customer and linked display names', async () => {
    const patch = await agent.patch('/api/customers/CUS-001').send({
      name: 'Alhaji Musa Updated',
      phoneNumber: '+234 803 000 0000',
      email: 'updated@example.com',
      addressShipping: 'New address',
      addressBilling: 'New billing',
      status: 'Active',
      tier: 'VIP',
      paymentTerms: 'Net 14',
    });
    expect(patch.status).toBe(200);
    expect(patch.body.ok).toBe(true);

    const res = await agent.get('/api/customers/CUS-001');
    expect(res.body.customer.name).toBe('Alhaji Musa Updated');
    expect(res.body.customer.tier).toBe('VIP');
  });

  it('PATCH /api/customers/:id persists CRM profiling fields', async () => {
    const patch = await agent.patch('/api/customers/CUS-001').send({
      companyName: 'Test Co Ltd',
      leadSource: 'Walk-in',
      preferredContact: 'WhatsApp',
      followUpISO: '2026-04-10',
      crmTags: ['VIP', 'Kano'],
      crmProfileNotes: 'Key account.',
    });
    expect(patch.status).toBe(200);
    const res = await agent.get('/api/customers/CUS-001');
    expect(res.body.customer.companyName).toBe('Test Co Ltd');
    expect(res.body.customer.crmTags).toEqual(['VIP', 'Kano']);
    expect(res.body.customer.followUpISO).toBe('2026-04-10');
    expect(res.body.customer.crmProfileNotes).toContain('Key account');
  });

  it('GET/POST /api/customers/:id/interactions records CRM timeline', async () => {
    const list = await agent.get('/api/customers/CUS-001/interactions');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.interactions)).toBe(true);
    const post = await agent.post('/api/customers/CUS-001/interactions').send({
      kind: 'note',
      title: 'Test',
      detail: 'Logged interaction',
    });
    expect(post.status).toBe(201);
    const again = await agent.get('/api/customers/CUS-001/interactions');
    expect(again.body.interactions.some((i) => i.detail === 'Logged interaction')).toBe(true);
  });

  it('DELETE /api/customers/:id returns blockers when customer has dependents', async () => {
    const res = await agent.delete('/api/customers/CUS-001');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(Array.isArray(res.body.blockers)).toBe(true);
    expect(res.body.blockers.length).toBeGreaterThan(0);
    expect(res.body.error).toMatch(/dependent records/i);
  });

  it('DELETE /api/customers/:id removes customer with no dependents', async () => {
    const created = await agent.post('/api/customers').send({
      customerID: 'CUS-DELETE-EMPTY',
      name: 'Ephemeral Delete Test',
    });
    expect(created.status).toBe(201);
    const del = await agent.delete('/api/customers/CUS-DELETE-EMPTY');
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
    const get = await agent.get('/api/customers/CUS-DELETE-EMPTY');
    expect(get.status).toBe(404);
  });

  it('DELETE /api/customers/:id is forbidden for sales officer (sales manager only)', async () => {
    const staff = request.agent(app);
    await loginAs(staff, 'sales.staff', 'Sales@123');
    const created = await staff.post('/api/customers').send({
      customerID: 'CUS-STAFF-NODEL',
      name: 'Staff Cannot Delete',
    });
    expect(created.status).toBe(201);
    const del = await staff.delete('/api/customers/CUS-STAFF-NODEL');
    expect(del.status).toBe(403);
    expect(del.body.code).toBe('FORBIDDEN');
  });

  it('POST /api/customers rejects duplicate phone in branch (normalized)', async () => {
    const res = await agent.post('/api/customers').send({
      customerID: 'CUS-DUP-PHONE',
      name: 'Dup Phone Test',
      phoneNumber: '08035550142',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_CUSTOMER_REGISTRATION');
    expect(res.body.conflictField).toBe('phone');
    expect(res.body.existingCustomerId).toBe('CUS-001');
  });

  it('POST /api/customers rejects duplicate email in branch', async () => {
    const res = await agent.post('/api/customers').send({
      customerID: 'CUS-DUP-EMAIL',
      name: 'Dup Email Test',
      phoneNumber: '+234 999 000 7700',
      email: 'Musa.roofing@example.com',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_CUSTOMER_REGISTRATION');
    expect(res.body.conflictField).toBe('email');
  });

  it('PATCH /api/customers/:id rejects phone already used by another customer', async () => {
    const patch = await agent.patch('/api/customers/CUS-002').send({
      phoneNumber: '+234 803 555 0142',
    });
    expect(patch.status).toBe(409);
    expect(patch.body.code).toBe('DUPLICATE_CUSTOMER_REGISTRATION');
    expect(patch.body.conflictField).toBe('phone');
  });

  it('PATCH /api/bank-reconciliation/:lineId updates match status', async () => {
    const boot = await agent.get('/api/bootstrap');
    const line = boot.body.bankReconciliation.find((l) => l.id === 'BR-003');
    expect(line?.status).toBe('Review');
    const patch = await agent.patch('/api/bank-reconciliation/BR-003').send({
      status: 'Matched',
      systemMatch: 'RC-2026-014',
      // Statement line (312_500) differs from receipt (400_000); book settled amount to receipt to avoid variance workflow in this test.
      settledAmountNgn: 400_000,
    });
    expect(patch.status).toBe(200);
    const after = await agent.get('/api/bootstrap');
    const row = after.body.bankReconciliation.find((l) => l.id === 'BR-003');
    expect(row.status).toBe('Matched');
    expect(row.systemMatch).toBe('RC-2026-014');
  });

  it('PATCH /api/bank-reconciliation/:lineId rejects Matched when RC- id is not a receipt', async () => {
    const bad = await agent.patch('/api/bank-reconciliation/BR-003').send({
      status: 'Matched',
      systemMatch: 'RC-NOT-A-REAL-RECEIPT-ID',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.ok).toBe(false);
  });

  it('PATCH /api/bank-reconciliation/:lineId resolves receipt when system match uses unicode dash', async () => {
    const created = await agent.post('/api/bank-reconciliation').send({
      bankDateISO: '2026-04-01',
      description: 'Unicode dash match test',
      amountNgn: 400_000,
    });
    expect(created.status).toBe(201);
    const lineId = created.body.id;
    const patch = await agent.patch(`/api/bank-reconciliation/${lineId}`).send({
      status: 'Matched',
      systemMatch: 'RC\u20132026-014',
      settledAmountNgn: 400_000,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.ok).toBe(true);
    expect(patch.body.status).toBe('Matched');
  });

  it('POST /api/bank-reconciliation creates a statement line in Review', async () => {
    const created = await agent.post('/api/bank-reconciliation').send({
      bankDateISO: '2026-04-01',
      description: 'API test bank line',
      amountNgn: -5000,
    });
    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    expect(created.body.id).toMatch(/^BKR-/);
    const boot = await agent.get('/api/bootstrap');
    const row = boot.body.bankReconciliation.find((l) => l.id === created.body.id);
    expect(row?.description).toBe('API test bank line');
    expect(row?.amountNgn).toBe(-5000);
    expect(row?.status).toBe('Review');
  });

  it('GET /api/bank-reconciliation lists lines for finance roles', async () => {
    const res = await agent.get('/api/bank-reconciliation');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.lines)).toBe(true);
  });

  it('POST /api/bank-reconciliation/import creates multiple review lines', async () => {
    const res = await agent.post('/api/bank-reconciliation/import').send({
      lines: [
        { bankDateISO: '2026-04-01', description: 'Bulk A', amountNgn: 1000 },
        { bankDateISO: '2026-04-02', description: 'Bulk B', amountNgn: -2000 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.createdCount).toBe(2);
    expect(res.body.errorCount).toBe(0);
  });

  it('POST /api/bank-reconciliation/import-csv creates lines from text', async () => {
    const csv = `bankDateISO,description,amountNgn
2026-04-10,"Bank fee April",-1500
2026-04-11,Inflow customer A,250000`;
    const res = await agent.post('/api/bank-reconciliation/import-csv').send({ csvText: csv });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.createdCount).toBe(2);
  });

  it('GET /api/exec/summary returns queue KPIs for CEO', async () => {
    const ceoAgent = request.agent(app);
    await loginAs(ceoAgent, 'ceo', 'Ceo@1234567890!');
    const res = await ceoAgent.get('/api/exec/summary');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.payrollDraftsAwaitingMd).toBe('number');
    expect(typeof res.body.bankReconciliationLinesInReview).toBe('number');
  });

  it('GET /api/advance-deposits requires sign-in and ledger-related permission', async () => {
    const anon = await request(app).get('/api/advance-deposits');
    expect(anon.status).toBe(401);
    const viewerAgent = request.agent(app);
    await loginAs(viewerAgent, 'viewer', 'Viewer@123456!');
    const v = await viewerAgent.get('/api/advance-deposits');
    expect(v.status).toBe(403);
  });

  it('POST /api/ledger/advance returns same entry when Idempotency-Key repeats', async () => {
    const idemKey = `idem-adv-${Date.now()}`;
    const body = {
      customerID: 'CUS-001',
      amountNgn: 3_000,
      paymentMethod: 'Cash',
      dateISO: '2026-03-28',
    };
    const r1 = await agent.post('/api/ledger/advance').set('Idempotency-Key', idemKey).send(body);
    expect(r1.status).toBe(201);
    expect(r1.body.entry?.id).toBeTruthy();
    const r2 = await agent.post('/api/ledger/advance').set('Idempotency-Key', idemKey).send(body);
    expect(r2.status).toBe(201);
    expect(r2.body.entry.id).toBe(r1.body.entry.id);
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ledger_entries WHERE id = ?`).get(r1.body.entry.id);
    expect(row.c).toBe(1);
  });

  it('POST /api/ledger/advance then summary shows advance', async () => {
    const before = await agent.get('/api/bootstrap');
    const treasuryAccountId = before.body.treasuryAccounts[0].id;
    const balanceBefore = before.body.treasuryAccounts[0].balance;
    const adv = await agent.post('/api/ledger/advance').send({
      customerID: 'CUS-001',
      amountNgn: 100_000,
      paymentMethod: 'Transfer',
      bankReference: 'REF-1',
      purpose: 'Deposit',
      dateISO: '2026-03-28',
      treasuryAccountId,
      paymentLines: [{ treasuryAccountId, amountNgn: 100_000, reference: 'REF-1' }],
    });
    expect(adv.status).toBe(201);
    expect(adv.body.entry.type).toBe('ADVANCE_IN');

    const sum = await agent.get('/api/customers/CUS-001/summary');
    expect(sum.status).toBe(200);
    expect(sum.body.advanceNgn).toBe(100_000);

    const dep = await agent.get('/api/advance-deposits');
    expect(dep.status).toBe(200);
    expect(dep.body.advances.some((a) => a.ledgerEntryId === adv.body.entry.id)).toBe(true);

    const after = await agent.get('/api/bootstrap');
    const acc = after.body.treasuryAccounts.find((a) => a.id === treasuryAccountId);
    expect(acc.balance).toBe(balanceBefore + 100_000);
    expect(
      after.body.treasuryMovements.some(
        (m) => m.sourceKind === 'LEDGER_ADVANCE' && m.sourceId === adv.body.entry.id
      )
    ).toBe(true);
  });

  it('POST /api/ledger/apply-advance applies deposit to quotation', async () => {
    const before = await agent.get('/api/bootstrap');
    const treasuryAccountId = before.body.treasuryAccounts[0].id;
    const q = await agent.post('/api/quotations').send({
      customerID: 'CUS-001',
      projectName: `Advance apply ${Date.now()}`,
      dateISO: '2026-03-29',
      lines: {
        products: [{ name: 'Test item', qty: '1', unitPrice: '100000' }],
        accessories: [],
        services: [],
      },
    });
    expect(q.status).toBe(201);
    const quotationRef = q.body.quotation?.quotationID || q.body.quotation?.id || q.body.quotationID || q.body.id;
    expect(String(quotationRef || '')).toBeTruthy();
    await agent.post('/api/ledger/advance').send({
      customerID: 'CUS-001',
      amountNgn: 50_000,
      paymentMethod: 'Transfer',
      dateISO: '2026-03-28',
      treasuryAccountId,
      paymentLines: [{ treasuryAccountId, amountNgn: 50_000, reference: 'DEP-APPLY' }],
    });

    const apply = await agent.post('/api/ledger/apply-advance').send({
      customerID: 'CUS-001',
      quotationRef,
      amountNgn: 50_000,
    });
    expect(apply.status).toBe(201);
    expect(apply.body.entry.type).toBe('ADVANCE_APPLIED');
  });

  it('POST /api/ledger/receipt splits overpayment to advance', async () => {
    const before = await agent.get('/api/bootstrap');
    const treasuryAccountId = before.body.treasuryAccounts[0].id;
    const res = await agent.post('/api/ledger/receipt').send({
      customerID: 'CUS-003',
      quotationId: 'QT-2026-004',
      amountNgn: 650_000,
      paymentMethod: 'Cash',
      dateISO: '2026-03-28',
      treasuryAccountId,
      paymentLines: [{ treasuryAccountId, amountNgn: 650_000, reference: 'RCP-1' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.receipt.amountNgn).toBe(620_000);
    expect(res.body.overpay.amountNgn).toBe(30_000);

    const sum = await agent.get('/api/customers/CUS-003/summary');
    expect(sum.body.advanceNgn).toBe(30_000);

    const boot = await agent.get('/api/bootstrap');
    const sr = boot.body.receipts.find((r) => r.id === res.body.receipt.id);
    expect(sr).toBeDefined();
    expect(sr.ledgerEntryId).toBe(res.body.receipt.id);
  });

  it('POST /api/ledger/reverse-receipt reverses a posted receipt', async () => {
    const q = await agent.post('/api/quotations').send({
      customerID: 'CUS-002',
      projectName: `Reverse receipt ${Date.now()}`,
      dateISO: '2026-03-29',
      lines: {
        products: [{ name: 'Test item', qty: '1', unitPrice: '200000' }],
        accessories: [],
        services: [],
      },
    });
    expect(q.status).toBe(201);
    const quotationId = q.body.quotation?.id || q.body.quotation?.quotationID || q.body.quotationID || q.body.id;
    expect(String(quotationId || '')).toBeTruthy();
    const receipt = await agent.post('/api/ledger/receipt').send({
      customerID: 'CUS-002',
      quotationId,
      amountNgn: 100_000,
      paymentMethod: 'Transfer',
      dateISO: '2026-03-29',
    });
    expect(receipt.status).toBe(201);

    const rev = await agent.post('/api/ledger/reverse-receipt').send({
      entryId: receipt.body.receipt.id,
      note: 'Wrong posting',
    });
    expect(rev.status).toBe(201);
    expect(rev.body.entry.type).toBe('RECEIPT_REVERSAL');

    const sum = await agent.get('/api/customers/CUS-002/summary');
    const row = sum.body.outstandingByQuotation.find((q) => q.quotationId === 'QT-2026-002');
    expect(row.amountDueNgn).toBeGreaterThan(0);
  });

  it('POST /api/ledger/reverse-advance reverses a deposit and removes it from advances list', async () => {
    const adv = await agent.post('/api/ledger/advance').send({
      customerID: 'CUS-004',
      amountNgn: 75_000,
      paymentMethod: 'Transfer',
      dateISO: '2026-03-29',
    });
    expect(adv.status).toBe(201);

    const rev = await agent.post('/api/ledger/reverse-advance').send({
      entryId: adv.body.entry.id,
      note: 'Duplicate deposit',
    });
    expect(rev.status).toBe(201);
    expect(rev.body.entry.type).toBe('ADVANCE_REVERSAL');

    const dep = await agent.get('/api/advance-deposits');
    expect(dep.body.advances.some((a) => a.ledgerEntryId === adv.body.entry.id)).toBe(false);
  });

  it('POST /api/ledger/reverse-advance posts reversing GL when advance had treasury', async () => {
    const before = await agent.get('/api/bootstrap');
    const treasuryAccountId = before.body.treasuryAccounts[0].id;
    const adv = await agent.post('/api/ledger/advance').send({
      customerID: 'CUS-004',
      amountNgn: 50_000,
      paymentMethod: 'Transfer',
      dateISO: '2026-03-30',
      treasuryAccountId,
      paymentLines: [{ treasuryAccountId, amountNgn: 50_000, reference: 'ADV-GL-TST' }],
    });
    expect(adv.status).toBe(201);
    const advGl = db
      .prepare(`SELECT id FROM gl_journal_entries WHERE source_kind = 'CUSTOMER_ADVANCE_GL' AND source_id = ?`)
      .get(adv.body.entry.id);
    expect(advGl).toBeTruthy();

    const rev = await agent.post('/api/ledger/reverse-advance').send({
      entryId: adv.body.entry.id,
      note: 'Test advance GL reversal',
    });
    expect(rev.status).toBe(201);
    const revGl = db
      .prepare(`SELECT id FROM gl_journal_entries WHERE source_kind = 'CUSTOMER_ADVANCE_REV_GL' AND source_id = ?`)
      .get(rev.body.entry.id);
    expect(revGl).toBeTruthy();
  });

  it('POST /api/quotations persists lines and totals', async () => {
    const res = await agent.post('/api/quotations').send({
      customerID: 'CUS-001',
      projectName: 'North shed',
      dateISO: '2026-03-29',
      lines: {
        products: [{ name: 'Roofing Sheet', qty: '10', unitPrice: '5000' }],
        accessories: [],
        services: [],
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.quotationId).toMatch(/^QT-/);
    expect(res.body.quotation.totalNgn).toBe(50_000);
    expect(res.body.quotation.projectName).toBe('North shed');
  });

  it('PATCH /api/quotations updates persisted quotation', async () => {
    const created = await agent.post('/api/quotations').send({
      customerID: 'CUS-001',
      projectName: 'North shed',
      dateISO: '2026-03-29',
      lines: {
        products: [{ name: 'Roofing Sheet', qty: '10', unitPrice: '5000' }],
        accessories: [],
        services: [],
      },
    });
    const patch = await agent.patch(`/api/quotations/${encodeURIComponent(created.body.quotationId)}`).send({
      customerFeedback: 'Approved on site',
      status: 'Approved',
    });
    expect(patch.status).toBe(200);
    expect(patch.body.quotation.customerFeedback).toBe('Approved on site');
    expect(patch.body.quotation.status).toBe('Approved');
  });

  it('POST /api/suppliers then bootstrap lists it', async () => {
    const create = await agent.post('/api/suppliers').send({
      name: 'API Test Supplier',
      city: 'Kano',
      paymentTerms: 'Credit',
      qualityScore: 77,
      notes: 'from test',
    });
    expect(create.status).toBe(201);
    expect(create.body.ok).toBe(true);
    expect(create.body.supplierID).toMatch(/^SUP-/);

    const boot = await agent.get('/api/bootstrap');
    expect(boot.body.suppliers.some((s) => s.supplierID === create.body.supplierID)).toBe(true);
    const row = boot.body.suppliers.find((s) => s.supplierID === create.body.supplierID);
    expect(row.name).toBe('API Test Supplier');
    expect(row.qualityScore).toBe(77);
  });

  it('PATCH /api/suppliers/:id updates name and PO supplier_name', async () => {
    const create = await agent.post('/api/suppliers').send({ name: 'Temp Co', city: 'Lagos' });
    const sid = create.body.supplierID;
    const po = await agent.post('/api/purchase-orders').send({
      supplierID: sid,
      supplierName: 'Temp Co',
      orderDateISO: '2026-03-28',
      expectedDeliveryISO: '',
      status: 'Pending',
      lines: [
        {
          lineKey: 'L1',
          productID: 'COIL-ALU',
          productName: 'Test coil',
          qtyOrdered: 10,
          unitPricePerKgNgn: 100,
          unitPriceNgn: 100,
          qtyReceived: 0,
        },
      ],
    });
    expect(po.status).toBe(201);

    const patch = await agent.patch(`/api/suppliers/${encodeURIComponent(sid)}`).send({
      name: 'Temp Co Renamed',
      city: 'Abuja',
      paymentTerms: 'Advance',
    });
    expect(patch.status).toBe(200);
    expect(patch.body.ok).toBe(true);

    const boot = await agent.get('/api/bootstrap');
    const s = boot.body.suppliers.find((x) => x.supplierID === sid);
    expect(s.name).toBe('Temp Co Renamed');
    const p = boot.body.purchaseOrders.find((x) => x.poID === po.body.poID);
    expect(p.supplierName).toBe('Temp Co Renamed');
  });

  it('PATCH /api/purchase-orders/:poId revises draft coil PO header and lines', async () => {
    const create = await agent.post('/api/suppliers').send({ name: 'PO Patch Supplier', city: 'Lagos' });
    const sid = create.body.supplierID;
    const po = await agent.post('/api/purchase-orders').send({
      supplierID: sid,
      supplierName: 'PO Patch Supplier',
      orderDateISO: '2026-04-01',
      expectedDeliveryISO: '',
      status: 'Pending',
      lines: [
        {
          lineKey: 'L1',
          productID: 'COIL-ALU',
          productName: 'Aluminium coil',
          color: 'HM Blue',
          gauge: '0.40mm',
          qtyOrdered: 5,
          unitPricePerKgNgn: 200,
          unitPriceNgn: 200,
          qtyReceived: 0,
        },
      ],
    });
    expect(po.status).toBe(201);
    const poId = po.body.poID;
    const patch = await agent.patch(`/api/purchase-orders/${encodeURIComponent(poId)}`).send({
      supplierID: sid,
      supplierName: 'PO Patch Supplier',
      orderDateISO: '2026-04-02',
      expectedDeliveryISO: '2026-04-15',
      lines: [
        {
          lineKey: 'L1',
          productID: 'COIL-ALU',
          productName: 'Aluminium coil',
          color: 'Traffic Black',
          gauge: '0.55mm',
          qtyOrdered: 8,
          unitPricePerKgNgn: 210,
          unitPriceNgn: 210,
        },
      ],
    });
    expect(patch.status).toBe(200);
    expect(patch.body.ok).toBe(true);
    const boot = await agent.get('/api/bootstrap');
    const row = boot.body.purchaseOrders.find((x) => x.poID === poId);
    expect(row.orderDateISO).toBe('2026-04-02');
    expect(row.expectedDeliveryISO).toBe('2026-04-15');
    expect(row.lines.length).toBe(1);
    expect(row.lines[0].color).toBe('Traffic Black');
    expect(row.lines[0].qtyOrdered).toBe(8);
  });

  it('DELETE /api/suppliers/:id fails when POs exist', async () => {
    const boot = await agent.get('/api/bootstrap');
    const sid = boot.body.purchaseOrders[0]?.supplierID;
    expect(sid).toBeTruthy();
    const del = await agent.delete(`/api/suppliers/${encodeURIComponent(sid)}`);
    expect(del.status).toBe(400);
    expect(del.body.ok).toBe(false);
  });

  it('DELETE /api/suppliers/:id succeeds when no POs', async () => {
    const create = await agent.post('/api/suppliers').send({ name: 'Orphan Supplier' });
    const sid = create.body.supplierID;
    const del = await agent.delete(`/api/suppliers/${encodeURIComponent(sid)}`);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
  });

  it('POST /api/transport-agents CRUD', async () => {
    const c = await agent.post('/api/transport-agents').send({
      name: 'Test Haulage',
      region: 'North',
      phone: '0800',
    });
    expect(c.status).toBe(201);
    const aid = c.body.id;
    expect(aid).toMatch(/^AG-/);

    const p = await agent
      .patch(`/api/transport-agents/${encodeURIComponent(aid)}`)
      .send({ name: 'Test Haulage Ltd', region: 'North', phone: '0801' });
    expect(p.status).toBe(200);

    const del = await agent.delete(`/api/transport-agents/${encodeURIComponent(aid)}`);
    expect(del.status).toBe(200);
  });

  it('PO transport: link → on loading, post-transport → in transit with optional treasury link', async () => {
    const sup = await agent.post('/api/suppliers').send({ name: 'Haul Test Sup', city: 'Kano' });
    expect(sup.status).toBe(201);
    const tid = (
      await agent.post('/api/transport-agents').send({ name: 'Haul Co', region: 'North', phone: '080' })
    ).body.id;
    const po = await agent.post('/api/purchase-orders').send({
      supplierID: sup.body.supplierID,
      supplierName: 'Haul Test Sup',
      orderDateISO: '2026-03-29',
      expectedDeliveryISO: '',
      status: 'Approved',
      lines: [
        {
          lineKey: 'L1',
          productID: 'COIL-ALU',
          productName: 'Coil',
          qtyOrdered: 100,
          unitPricePerKgNgn: 100,
          unitPriceNgn: 100,
          qtyReceived: 0,
        },
      ],
    });
    expect(po.status).toBe(201);
    const poId = po.body.poID;
    const link = await agent.patch(`/api/purchase-orders/${encodeURIComponent(poId)}/link-transport`).send({
      transportAgentId: tid,
      transportAgentName: 'Haul Co',
      transportReference: 'WB-123',
    });
    expect(link.status).toBe(200);
    let boot = await agent.get('/api/bootstrap');
    let row = boot.body.purchaseOrders.find((p) => p.poID === poId);
    expect(row.status).toBe('On loading');

    const postFree = await agent.post(`/api/purchase-orders/${encodeURIComponent(poId)}/post-transport`).send({
      reference: 'WB-123',
      dateISO: '2026-03-29',
    });
    expect(postFree.status).toBe(200);
    boot = await agent.get('/api/bootstrap');
    row = boot.body.purchaseOrders.find((p) => p.poID === poId);
    expect(row.status).toBe('In Transit');
    expect(row.transportPaid).toBe(false);

    const sup2 = await agent.post('/api/suppliers').send({ name: 'Haul Test Sup 2', city: 'Jos' });
    const po2 = await agent.post('/api/purchase-orders').send({
      supplierID: sup2.body.supplierID,
      supplierName: 'Haul Test Sup 2',
      orderDateISO: '2026-03-29',
      status: 'Approved',
      lines: [
        {
          lineKey: 'L1',
          productID: 'COIL-ALU',
          productName: 'Coil',
          qtyOrdered: 50,
          unitPricePerKgNgn: 100,
          unitPriceNgn: 100,
          qtyReceived: 0,
        },
      ],
    });
    const poId2 = po2.body.poID;
    await agent.patch(`/api/purchase-orders/${encodeURIComponent(poId2)}/link-transport`).send({
      transportAgentId: tid,
      transportAgentName: 'Haul Co',
      transportReference: 'WB-999',
    });
    boot = await agent.get('/api/bootstrap');
    const accounts = boot.body.treasuryAccounts;
    expect(accounts.length).toBeGreaterThan(0);
    const acctId = accounts[0].id;
    const post = await agent.post(`/api/purchase-orders/${encodeURIComponent(poId2)}/post-transport`).send({
      treasuryAccountId: acctId,
      amountNgn: 50_000,
      reference: 'WB-999',
      dateISO: '2026-03-29',
    });
    expect(post.status).toBe(200);
    boot = await agent.get('/api/bootstrap');
    row = boot.body.purchaseOrders.find((p) => p.poID === poId2);
    expect(row.status).toBe('In Transit');
    expect(row.transportPaid).toBe(true);
    expect(row.transportTreasuryMovementId).toBeTruthy();
    const tm = boot.body.treasuryMovements.find((m) => m.id === row.transportTreasuryMovementId);
    expect(tm?.sourceKind).toBe('PURCHASE_ORDER');
    expect(tm?.sourceId).toBe(poId2);
  });

  it('POST /api/cutting-lists and /api/production-jobs persist linked production flow', async () => {
    const cutting = await agent.post('/api/cutting-lists').send({
      quotationRef: 'QT-2026-001',
      customerID: 'CUS-001',
      productID: 'FG-101',
      productName: 'Longspan thin',
      dateISO: '2026-03-29',
      machineName: 'Machine 01 (Longspan)',
      operatorName: 'Ibrahim',
      lines: [
        { sheets: 4, lengthM: 6 },
        { sheets: 2, lengthM: 4.5 },
      ],
    });
    expect(cutting.status).toBe(201);
    expect(cutting.body.cuttingList.totalMeters).toBe(33);

    const job = await agent.post('/api/production-jobs').send({
      cuttingListId: cutting.body.id,
      productID: 'FG-101',
      productName: 'Longspan thin',
      plannedMeters: 33,
      plannedSheets: 6,
      status: 'Planned',
    });
    expect(job.status).toBe(201);

    const previewWhilePlanned = await agent
      .post(`/api/production-jobs/${encodeURIComponent(job.body.jobID)}/conversion-preview`)
      .send({
        allocations: [{ coilNo: 'X', closingWeightKg: 1, metersProduced: 1 }],
      });
    expect(previewWhilePlanned.status).toBe(400);

    const boot = await agent.get('/api/bootstrap');
    const cl = boot.body.cuttingLists.find((row) => row.id === cutting.body.id);
    expect(cl.productionRegistered).toBe(true);
    expect(cl.productionRegisterRef).toBe(job.body.jobID);
  });

  it('POST /api/deliveries then confirm deducts finished goods stock once', async () => {
    const createCl = await agent.post('/api/cutting-lists').send({
      quotationRef: 'QT-2026-002',
      customerID: 'CUS-002',
      productID: 'FG-101',
      productName: 'Longspan thin',
      dateISO: '2026-03-29',
      lines: [{ sheets: 5, lengthM: 5 }],
    });
    const clId = createCl.body.id;
    const before = await agent.get('/api/bootstrap');
    const fgBefore = before.body.products.find((p) => p.productID === 'FG-101').stockLevel;

    const delivery = await agent.post('/api/deliveries').send({
      cuttingListId: clId,
      destination: 'Kano site',
      method: 'Company truck',
      shipDate: '2026-03-29',
      eta: '2026-03-30',
    });
    expect(delivery.status).toBe(201);

    const confirm = await agent
      .patch(`/api/deliveries/${encodeURIComponent(delivery.body.id)}/confirm`)
      .send({ status: 'Delivered', deliveredDateISO: '2026-03-30', customerSignedPod: true });
    expect(confirm.status).toBe(200);

    const after = await agent.get('/api/bootstrap');
    const fgAfter = after.body.products.find((p) => p.productID === 'FG-101').stockLevel;
    const posted = after.body.deliveries.find((d) => d.id === delivery.body.id);
    expect(posted.fulfillmentPosted).toBe(true);
    expect(fgAfter).toBe(fgBefore - 25);

    const second = await agent
      .patch(`/api/deliveries/${encodeURIComponent(delivery.body.id)}/confirm`)
      .send({ status: 'Delivered', deliveredDateISO: '2026-03-30', customerSignedPod: true });
    expect(second.status).toBe(200);

    const afterSecond = await agent.get('/api/bootstrap');
    const fgAfterSecond = afterSecond.body.products.find((p) => p.productID === 'FG-101').stockLevel;
    expect(fgAfterSecond).toBe(fgAfter);
  });

  it('POST /api/deliveries uses production job product when cutting list header product_id is blank', async () => {
    const createCl = await agent.post('/api/cutting-lists').send({
      quotationRef: 'QT-2026-002',
      customerID: 'CUS-002',
      productID: 'FG-101',
      productName: 'Longspan thin',
      dateISO: '2026-03-29',
      lines: [{ sheets: 2, lengthM: 10 }],
    });
    expect(createCl.status).toBe(201);
    const clId = createCl.body.id;
    const job = await agent.post('/api/production-jobs').send({
      cuttingListId: clId,
      productID: 'FG-101',
      productName: 'Longspan thin',
      plannedMeters: 20,
      plannedSheets: 2,
      status: 'Planned',
    });
    expect(job.status).toBe(201);
    db.prepare(`UPDATE cutting_lists SET product_id = NULL, product_name = NULL WHERE id = ?`).run(clId);

    const delivery = await agent.post('/api/deliveries').send({
      cuttingListId: clId,
      destination: 'Site B',
      method: 'Company truck',
      shipDate: '2026-03-29',
      eta: '2026-03-30',
    });
    expect(delivery.status).toBe(201);
    const boot = await agent.get('/api/bootstrap');
    const d = boot.body.deliveries.find((x) => x.id === delivery.body.id);
    expect(d?.lines?.length).toBeGreaterThan(0);
    expect(d.lines[0].productID).toBe('FG-101');
  });

  it('POST /api/expenses and /api/treasury/transfer post treasury movements', async () => {
    const before = await agent.get('/api/bootstrap');
    const [from, to] = before.body.treasuryAccounts.slice(0, 2);

    const expense = await agent.post('/api/expenses').send({
      expenseType: 'Operational - rent & utilities',
      amountNgn: 20_000,
      date: '2026-03-29',
      category: 'Operational — rent & utilities',
      paymentMethod: 'Cash',
      treasuryAccountId: from.id,
      reference: 'EXP-TEST',
    });
    expect(expense.status).toBe(201);

    const transfer = await agent.post('/api/treasury/transfer').send({
      fromId: from.id,
      toId: to.id,
      amountNgn: 10_000,
      reference: 'Float sweep',
    });
    expect(transfer.status).toBe(201);

    const after = await agent.get('/api/bootstrap');
    expect(after.body.treasuryMovements.some((m) => m.sourceKind === 'EXPENSE')).toBe(true);
    expect(after.body.treasuryMovements.some((m) => m.sourceKind === 'TREASURY_TRANSFER')).toBe(true);
  });

  it('POST /api/payment-requests and /decision review the approval flow', async () => {
    const expense = await agent.post('/api/expenses').send({
      expenseType: 'Generator service',
      amountNgn: 15_000,
      date: '2026-03-29',
      category: 'Maintenance — plant & equipment',
      paymentMethod: 'Cash',
      treasuryAccountId: 1,
      reference: 'EXP-REQ',
    });
    expect(expense.status).toBe(201);

    const createReq = await agent.post('/api/payment-requests').send({
      expenseID: expense.body.expenseID,
      amountRequestedNgn: 15_000,
      requestDate: '2026-03-29',
      description: 'Request diesel top-up',
    });
    expect(createReq.status).toBe(201);

    const approve = await agent
      .post(`/api/payment-requests/${encodeURIComponent(createReq.body.requestID)}/decision`)
      .send({ status: 'Approved', note: 'Approved for payment.' });
    expect(approve.status).toBe(200);

    const boot = await agent.get('/api/bootstrap');
    const reqRow = boot.body.paymentRequests.find((r) => r.requestID === createReq.body.requestID);
    expect(reqRow.approvalStatus).toBe('Approved');
    expect(reqRow.approvedBy).toBeTruthy();
  });

  it('POST /api/payment-requests/:requestId/pay records split treasury payout after approval', async () => {
    const before = await agent.get('/api/bootstrap');
    const [cashAccount, bankAccount] = before.body.treasuryAccounts.slice(0, 2);

    const expense = await agent.post('/api/expenses').send({
      expenseType: 'Diesel refill',
      amountNgn: 500_000,
      date: '2026-03-29',
      category: 'Operational — rent & utilities',
      paymentMethod: 'Mixed',
      reference: 'EXP-DIESEL-1',
    });
    expect(expense.status).toBe(201);

    const requestCreate = await agent.post('/api/payment-requests').send({
      expenseID: expense.body.expenseID,
      amountRequestedNgn: 500_000,
      requestDate: '2026-03-29',
      description: 'Diesel payout split between cash and GT bank',
    });
    expect(requestCreate.status).toBe(201);

    const approve = await agent
      .post(`/api/payment-requests/${encodeURIComponent(requestCreate.body.requestID)}/decision`)
      .send({ status: 'Approved', note: 'Approved for split payout.' });
    expect(approve.status).toBe(200);

    const pay = await agent
      .post(`/api/payment-requests/${encodeURIComponent(requestCreate.body.requestID)}/pay`)
      .send({
        note: 'Cash 300,000 and GT bank 200,000',
        paymentLines: [
          { treasuryAccountId: cashAccount.id, amountNgn: 300_000, reference: 'CASH-DIESEL' },
          { treasuryAccountId: bankAccount.id, amountNgn: 200_000, reference: 'GT-DIESEL' },
        ],
      });
    expect(pay.status).toBe(201);
    expect(pay.body.ok).toBe(true);
    expect(pay.body.amountPaidNgn).toBe(500_000);
    expect(pay.body.fullyPaid).toBe(true);

    const after = await agent.get('/api/bootstrap');
    const reqRow = after.body.paymentRequests.find((r) => r.requestID === requestCreate.body.requestID);
    expect(reqRow.paidAmountNgn).toBe(500_000);
    expect(reqRow.paidBy).toBe('Zarewa Admin');
    expect(reqRow.paidAtISO).toBeTruthy();
    expect(
      after.body.treasuryMovements.filter(
        (m) => m.sourceKind === 'PAYMENT_REQUEST' && m.sourceId === requestCreate.body.requestID
      )
    ).toHaveLength(2);
  });

  it('refund request lifecycle requires approval before payout', async () => {
    const salesStaff = request.agent(app);
    await loginAs(salesStaff, 'sales.staff', 'Sales@123');
    const createRefund = await salesStaff.post('/api/refunds').send({
      customerID: 'CUS-001',
      customer: 'Alhaji Musa & Sons',
      quotationRef: 'QT-2026-001',
      reasonCategory: 'Overpayment',
      reason: 'Overpayment - test',
      amountNgn: 12_500,
      calculationLines: [{ label: 'Test overpayment', amountNgn: 12_500 }],
    });
    expect(createRefund.status).toBe(201);

    const financeAgent = request.agent(app);
    await loginAs(financeAgent, 'finance.manager', 'Finance@123');
    const payBlocked = await financeAgent
      .post(`/api/refunds/${encodeURIComponent(createRefund.body.refundID)}/pay`)
      .send({ treasuryAccountId: 1, reference: 'RF-BLOCK' });
    expect(payBlocked.status).toBe(400);

    const managerAgent = request.agent(app);
    await loginAs(managerAgent, 'sales.manager', 'Sales@123');
    const approve = await managerAgent
      .post(`/api/refunds/${encodeURIComponent(createRefund.body.refundID)}/decision`)
      .send({
        status: 'Approved',
        approvalDate: '2026-03-29',
        managerComments: 'Approved after review.',
      });
    expect(approve.status).toBe(200);

    const pay = await financeAgent
      .post(`/api/refunds/${encodeURIComponent(createRefund.body.refundID)}/pay`)
      .send({ treasuryAccountId: 1, reference: 'RF-PAY' });
    expect(pay.status).toBe(201);

    const boot = await financeAgent.get('/api/bootstrap');
    const refund = boot.body.refunds.find((r) => r.refundID === createRefund.body.refundID);
    expect(refund.status).toBe('Paid');
    expect(refund.paidBy).toBe('Finance Manager');
  });

  it('refund payout posts REFUND_ADVANCE when customer has advance credit', async () => {
    const adv = await agent.post('/api/ledger/advance').send({
      customerID: 'CUS-001',
      amountNgn: 500_000,
      dateISO: '2026-03-27',
      purpose: 'Test advance before refund payout',
    });
    expect(adv.status).toBe(201);
    expect(adv.body.ok).toBe(true);

    const financeAgent = request.agent(app);
    await loginAs(financeAgent, 'finance.manager', 'Finance@123');

    const salesStaff = request.agent(app);
    await loginAs(salesStaff, 'sales.staff', 'Sales@123');
    const createRefund = await salesStaff.post('/api/refunds').send({
      customerID: 'CUS-001',
      customer: 'Alhaji Musa & Sons',
      quotationRef: 'QT-2026-001',
      reasonCategory: 'Overpayment',
      reason: 'Partial return of credit',
      amountNgn: 80_000,
      calculationLines: [{ label: 'Credit return', amountNgn: 80_000 }],
    });
    expect(createRefund.status).toBe(201);

    const managerAgent = request.agent(app);
    await loginAs(managerAgent, 'sales.manager', 'Sales@123');
    const approve = await managerAgent
      .post(`/api/refunds/${encodeURIComponent(createRefund.body.refundID)}/decision`)
      .send({
        status: 'Approved',
        approvalDate: '2026-03-29',
        managerComments: 'OK',
      });
    expect(approve.status).toBe(200);

    const pay = await financeAgent
      .post(`/api/refunds/${encodeURIComponent(createRefund.body.refundID)}/pay`)
      .send({ treasuryAccountId: 1, reference: 'RF-ADV-LEDGER' });
    expect(pay.status).toBe(201);

    const boot = await financeAgent.get('/api/bootstrap');
    const refundAdvanceLines = boot.body.ledgerEntries.filter(
      (e) =>
        e.customerID === 'CUS-001' &&
        e.type === 'REFUND_ADVANCE' &&
        String(e.bankReference || '') === createRefund.body.refundID
    );
    expect(refundAdvanceLines.length).toBeGreaterThanOrEqual(1);
    expect(refundAdvanceLines[0].amountNgn).toBe(80_000);
  });

  it('period locks block backdated finance postings until unlocked', async () => {
    const lock = await agent.post('/api/controls/period-locks').send({
      periodKey: '2026-03',
      reason: 'Month-end close',
    });
    expect(lock.status).toBe(201);

    const blockedExpense = await agent.post('/api/expenses').send({
      expenseType: 'Blocked expense',
      amountNgn: 5_000,
      date: '2026-03-15',
      category: 'Operational — rent & utilities',
      paymentMethod: 'Cash',
      treasuryAccountId: 1,
      reference: 'EXP-BLOCK',
    });
    expect(blockedExpense.status).toBe(400);
    expect(blockedExpense.body.error).toMatch(/locked period/i);

    const blockedGl = await agent.post('/api/gl/journal').send({
      entryDateISO: '2026-03-10',
      memo: 'Locked period test',
      lines: [
        { accountCode: '1000', debitNgn: 1_000 },
        { accountCode: '1200', creditNgn: 1_000 },
      ],
    });
    expect(blockedGl.status).toBe(400);
    expect(blockedGl.body.error).toMatch(/locked period/i);

    const unlock = await agent.delete('/api/controls/period-locks/2026-03').send({
      reason: 'Re-open for correction',
    });
    expect(unlock.status).toBe(200);

    const postedExpense = await agent.post('/api/expenses').send({
      expenseType: 'Released expense',
      amountNgn: 5_000,
      date: '2026-03-15',
      category: 'Operational — rent & utilities',
      paymentMethod: 'Cash',
      treasuryAccountId: 1,
      reference: 'EXP-OPEN',
    });
    expect(postedExpense.status).toBe(201);
  });

  it('role permissions block non-finance users from finance posting endpoints', async () => {
    const procurementAgent = request.agent(app);
    await loginAs(procurementAgent, 'procurement', 'Procure@123');
    const res = await procurementAgent.post('/api/expenses').send({
      expenseType: 'Blocked',
      amountNgn: 1_000,
      date: '2026-03-29',
      category: 'Other — misc operating',
      paymentMethod: 'Cash',
      treasuryAccountId: 1,
      reference: 'NOPE',
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('password change requires current password and allows re-login', async () => {
    const financeAgent = request.agent(app);
    await loginAs(financeAgent, 'finance.manager', 'Finance@123');

    const changed = await financeAgent.post('/api/session/change-password').send({
      currentPassword: 'Finance@123',
      newPassword: 'Finance@New456!',
    });
    expect(changed.status).toBe(200);

    const relogin = await request(app).post('/api/session/login').send({
      username: 'finance.manager',
      password: 'Finance@New456!',
    });
    expect(relogin.status).toBe(200);
  });

  it('audit log endpoint is available to finance approval roles', async () => {
    const financeAgent = request.agent(app);
    await loginAs(financeAgent, 'finance.manager', 'Finance@123');
    const res = await financeAgent.get('/api/audit-log');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.auditLog)).toBe(true);
  });

  async function seedTwoCoilsForProduction(client) {
    const sup = await client.post('/api/suppliers').send({ name: 'Traceability Supplier', city: 'Kano' });
    expect(sup.status).toBe(201);
    const po = await client.post('/api/purchase-orders').send({
      supplierID: sup.body.supplierID,
      supplierName: 'Traceability Supplier',
      orderDateISO: '2026-03-29',
      expectedDeliveryISO: '',
      status: 'Approved',
      lines: [
        {
          lineKey: 'L-TR',
          productID: 'COIL-ALU',
          productName: 'Aluminium coil (kg)',
          color: 'IV',
          gauge: '0.24',
          metersOffered: 1327,
          conversionKgPerM: 3000 / 1327,
          qtyOrdered: 6000,
          unitPricePerKgNgn: 100,
          unitPriceNgn: 100,
          qtyReceived: 0,
        },
      ],
    });
    expect(po.status).toBe(201);
    const grn1 = await client.post(`/api/purchase-orders/${encodeURIComponent(po.body.poID)}/grn`).send({
      entries: [
        {
          lineKey: 'L-TR',
          productID: 'COIL-ALU',
          qtyReceived: 3000,
          weightKg: 3000,
          coilNo: 'CL-API-TR-A',
          location: 'Bay 1',
          gaugeLabel: '0.24mm',
          materialTypeName: 'Aluminium',
          supplierExpectedMeters: 1327,
          supplierConversionKgPerM: 3000 / 1327,
        },
        {
          lineKey: 'L-TR',
          productID: 'COIL-ALU',
          qtyReceived: 3000,
          weightKg: 3000,
          coilNo: 'CL-API-TR-B',
          location: 'Bay 1',
          gaugeLabel: '0.24mm',
          materialTypeName: 'Aluminium',
          supplierExpectedMeters: 1327,
          supplierConversionKgPerM: 3000 / 1327,
        },
      ],
      supplierID: sup.body.supplierID,
      supplierName: 'Traceability Supplier',
    });
    expect(grn1.status).toBe(200);
    return { coilA: 'CL-API-TR-A', coilB: 'CL-API-TR-B' };
  }

  it('production job start is blocked until coil allocations exist', async () => {
    const { coilA } = await seedTwoCoilsForProduction(agent);
    const cutting = await agent.post('/api/cutting-lists').send({
      quotationRef: 'QT-2026-001',
      customerID: 'CUS-001',
      productID: 'FG-101',
      productName: 'Longspan thin',
      dateISO: '2026-03-29',
      machineName: 'Machine 01',
      operatorName: 'QA',
      lines: [{ sheets: 2, lengthM: 10 }],
    });
    expect(cutting.status).toBe(201);
    const job = await agent.post('/api/production-jobs').send({
      cuttingListId: cutting.body.id,
      productID: 'FG-101',
      productName: 'Longspan thin',
      plannedMeters: 20,
      plannedSheets: 2,
      status: 'Planned',
    });
    expect(job.status).toBe(201);
    const blocked = await agent.post(`/api/production-jobs/${encodeURIComponent(job.body.jobID)}/start`).send({});
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/allocat/i);

    const alloc = await agent.post(`/api/production-jobs/${encodeURIComponent(job.body.jobID)}/allocations`).send({
      allocations: [{ coilNo: coilA, openingWeightKg: 500 }],
    });
    expect(alloc.status).toBe(200);
    const started = await agent.post(`/api/production-jobs/${encodeURIComponent(job.body.jobID)}/start`).send({
      startedAtISO: '2026-03-29',
    });
    expect(started.status).toBe(200);
  });

  it('GET /api/production-jobs/:jobId/coil-allocations lists allocations and 404s missing jobs', async () => {
    const { coilA } = await seedTwoCoilsForProduction(agent);
    const cutting = await agent.post('/api/cutting-lists').send({
      quotationRef: 'QT-2026-001',
      customerID: 'CUS-001',
      productID: 'FG-101',
      productName: 'Longspan thin',
      dateISO: '2026-03-29',
      machineName: 'Machine 01',
      operatorName: 'QA',
      lines: [{ sheets: 1, lengthM: 5 }],
    });
    expect(cutting.status).toBe(201);
    const job = await agent.post('/api/production-jobs').send({
      cuttingListId: cutting.body.id,
      productID: 'FG-101',
      productName: 'Longspan thin',
      plannedMeters: 10,
      plannedSheets: 1,
      status: 'Planned',
    });
    expect(job.status).toBe(201);
    const jobId = job.body.jobID;
    const miss = await agent.get(`/api/production-jobs/${encodeURIComponent('NO-SUCH-JOB')}/coil-allocations`);
    expect(miss.status).toBe(404);
    const empty = await agent.get(`/api/production-jobs/${encodeURIComponent(jobId)}/coil-allocations`);
    expect(empty.status).toBe(200);
    expect(empty.body.ok).toBe(true);
    expect(empty.body.allocations).toEqual([]);
    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/allocations`).send({
      allocations: [{ coilNo: coilA, openingWeightKg: 250 }],
    });
    const filled = await agent.get(`/api/production-jobs/${encodeURIComponent(jobId)}/coil-allocations`);
    expect(filled.status).toBe(200);
    expect(filled.body.allocations).toHaveLength(1);
    expect(filled.body.allocations[0].coilNo).toBe(coilA);
    expect(filled.body.allocations[0].openingWeightKg).toBe(250);
  });

  it('multi-coil job supports conversion preview with four reference fields', async () => {
    const { coilA, coilB } = await seedTwoCoilsForProduction(agent);
    const cutting = await agent.post('/api/cutting-lists').send({
      quotationRef: 'QT-2026-001',
      customerID: 'CUS-001',
      productID: 'FG-101',
      productName: 'Longspan thin',
      dateISO: '2026-03-29',
      machineName: 'Machine 01',
      operatorName: 'QA',
      lines: [{ sheets: 4, lengthM: 5 }],
    });
    expect(cutting.status).toBe(201);
    const job = await agent.post('/api/production-jobs').send({
      cuttingListId: cutting.body.id,
      productID: 'FG-101',
      productName: 'Longspan thin',
      plannedMeters: 20,
      plannedSheets: 4,
      status: 'Planned',
    });
    expect(job.status).toBe(201);
    const jobId = job.body.jobID;
    const alloc = await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/allocations`).send({
      allocations: [
        { coilNo: coilA, openingWeightKg: 1500 },
        { coilNo: coilB, openingWeightKg: 1500 },
      ],
    });
    expect(alloc.status).toBe(200);
    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/start`).send({ startedAtISO: '2026-03-29' });

    const prev = await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/conversion-preview`).send({
      allocations: [
        { coilNo: coilA, closingWeightKg: 520, metersProduced: 433 },
        { coilNo: coilB, closingWeightKg: 520, metersProduced: 433 },
      ],
    });
    expect(prev.status).toBe(200);
    expect(prev.body.rows).toHaveLength(2);
    const row0 = prev.body.rows[0];
    expect(row0.allocationId).toBeTruthy();
    expect(prev.body.rows[1].allocationId).toBeTruthy();
    expect(row0.standardConversionKgPerM).toBeGreaterThan(0);
    expect(row0.supplierConversionKgPerM).toBeGreaterThan(0);
    expect(row0).toHaveProperty('variances');

    const listAlloc = await agent.get(`/api/production-jobs/${encodeURIComponent(jobId)}/coil-allocations`);
    expect(listAlloc.status).toBe(200);
    const allocRows = listAlloc.body.allocations;
    expect(allocRows).toHaveLength(2);
    const byId = await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/conversion-preview`).send({
      allocations: [
        {
          allocationId: allocRows[0].id,
          coilNo: coilA,
          closingWeightKg: 520,
          metersProduced: 433,
        },
        {
          allocationId: allocRows[1].id,
          coilNo: coilB,
          closingWeightKg: 520,
          metersProduced: 433,
        },
      ],
    });
    expect(byId.status).toBe(200);
    expect(byId.body.rows).toHaveLength(2);
  });

  it('coil split, scrap, and return-material update lots, lineage, and stock movements', async () => {
    const { coilA } = await seedTwoCoilsForProduction(agent);
    const d = '2026-03-29';

    const split = await agent.post(`/api/coil-lots/${encodeURIComponent(coilA)}/split`).send({
      splitKg: 400,
      note: 'Off-cut line',
      dateISO: d,
    });
    expect(split.status).toBe(200);
    expect(split.body.ok).toBe(true);
    const child = split.body.newCoilNo;
    expect(child && String(child).length).toBeGreaterThan(3);

    const boot1 = await agent.get('/api/bootstrap');
    expect(boot1.status).toBe(200);
    const lotA = boot1.body.coilLots.find((c) => c.coilNo === coilA);
    const lotC = boot1.body.coilLots.find((c) => c.coilNo === child);
    expect(lotA.qtyRemaining).toBeCloseTo(2600, 1);
    expect(lotC.qtyRemaining).toBeCloseTo(400, 1);
    expect(lotC.parentCoilNo).toBe(coilA);

    const scrap = await agent.post(`/api/coil-lots/${encodeURIComponent(coilA)}/scrap`).send({
      kg: 100,
      reason: 'Damage',
      note: 'Edge crush',
      dateISO: d,
      creditScrapInventory: true,
      scrapProductID: 'SCRAP-COIL',
    });
    expect(scrap.status).toBe(200);
    expect(scrap.body.ok).toBe(true);

    const boot2 = await agent.get('/api/bootstrap');
    const scrapProd = boot2.body.products.find((p) => p.productID === 'SCRAP-COIL');
    expect(scrapProd).toBeTruthy();
    expect(Number(scrapProd.stockLevel)).toBeGreaterThanOrEqual(99.9);

    const ret = await agent.post(`/api/coil-lots/${encodeURIComponent(coilA)}/return-material`).send({
      kg: 50,
      reason: 'Weighbridge / count correction',
      dateISO: d,
    });
    expect(ret.status).toBe(200);
    expect(ret.body.ok).toBe(true);

    const boot3 = await agent.get('/api/bootstrap');
    const lotA2 = boot3.body.coilLots.find((c) => c.coilNo === coilA);
    expect(lotA2.qtyRemaining).toBeCloseTo(2550, 1);
  });

  it('one coil can back two production jobs with separate allocations', async () => {
    const sup = await agent.post('/api/suppliers').send({ name: 'Shared Coil Supplier', city: 'Abuja' });
    expect(sup.status).toBe(201);
    const po = await agent.post('/api/purchase-orders').send({
      supplierID: sup.body.supplierID,
      supplierName: 'Shared Coil Supplier',
      orderDateISO: '2026-03-29',
      expectedDeliveryISO: '',
      status: 'Approved',
      lines: [
        {
          lineKey: 'L-SH',
          productID: 'COIL-ALU',
          productName: 'Aluminium coil (kg)',
          color: 'IV',
          gauge: '0.24',
          metersOffered: 4400,
          conversionKgPerM: 10000 / 4400,
          qtyOrdered: 10000,
          unitPricePerKgNgn: 100,
          unitPriceNgn: 100,
          qtyReceived: 0,
        },
      ],
    });
    expect(po.status).toBe(201);
    const grn = await agent.post(`/api/purchase-orders/${encodeURIComponent(po.body.poID)}/grn`).send({
      entries: [
        {
          lineKey: 'L-SH',
          productID: 'COIL-ALU',
          qtyReceived: 10000,
          weightKg: 10000,
          coilNo: 'CL-API-SHARED',
          location: 'Main',
          gaugeLabel: '0.24mm',
          materialTypeName: 'Aluminium',
          supplierExpectedMeters: 4400,
          supplierConversionKgPerM: 10000 / 4400,
        },
      ],
      supplierID: sup.body.supplierID,
      supplierName: 'Shared Coil Supplier',
    });
    expect(grn.status).toBe(200);

    async function jobForCutting(qtRef, meters) {
      const cl = await agent.post('/api/cutting-lists').send({
        quotationRef: qtRef,
        customerID: 'CUS-001',
        productID: 'FG-101',
        productName: 'Longspan thin',
        dateISO: '2026-03-29',
        machineName: 'M1',
        operatorName: 'QA',
        lines: [{ sheets: 1, lengthM: meters }],
      });
      expect(cl.status).toBe(201);
      const pj = await agent.post('/api/production-jobs').send({
        cuttingListId: cl.body.id,
        productID: 'FG-101',
        productName: 'Longspan thin',
        plannedMeters: meters,
        plannedSheets: 1,
        status: 'Planned',
      });
      expect(pj.status).toBe(201);
      return pj.body.jobID;
    }

    const job1 = await jobForCutting('QT-2026-001', 12);
    const job2 = await jobForCutting('QT-2026-002', 8);
    const a1 = await agent.post(`/api/production-jobs/${encodeURIComponent(job1)}/allocations`).send({
      allocations: [{ coilNo: 'CL-API-SHARED', openingWeightKg: 4000 }],
    });
    expect(a1.status).toBe(200);
    const a2 = await agent.post(`/api/production-jobs/${encodeURIComponent(job2)}/allocations`).send({
      allocations: [{ coilNo: 'CL-API-SHARED', openingWeightKg: 3000 }],
    });
    expect(a2.status).toBe(200);
    const boot = await agent.get('/api/bootstrap');
    const coils = boot.body.productionJobCoils.filter((c) => c.coilNo === 'CL-API-SHARED');
    expect(coils.length).toBe(2);
  });

  it('conversion preview flags manager review when actual yield breaches references', async () => {
    const sup = await agent.post('/api/suppliers').send({ name: 'Alert Coil Supplier', city: 'Kano' });
    expect(sup.status).toBe(201);
    const po = await agent.post('/api/purchase-orders').send({
      supplierID: sup.body.supplierID,
      supplierName: 'Alert Coil Supplier',
      orderDateISO: '2026-03-29',
      expectedDeliveryISO: '',
      status: 'Approved',
      lines: [
        {
          lineKey: 'L-AL',
          productID: 'COIL-ALU',
          productName: 'Aluminium coil (kg)',
          color: 'IV',
          gauge: '0.24',
          metersOffered: 2650,
          conversionKgPerM: 6000 / 2650,
          qtyOrdered: 6000,
          unitPricePerKgNgn: 100,
          unitPriceNgn: 100,
          qtyReceived: 0,
        },
      ],
    });
    expect(po.status).toBe(201);
    await agent.post(`/api/purchase-orders/${encodeURIComponent(po.body.poID)}/grn`).send({
      entries: [
        {
          lineKey: 'L-AL',
          productID: 'COIL-ALU',
          qtyReceived: 6000,
          weightKg: 6000,
          coilNo: 'CL-API-ALERT',
          location: 'Bay',
          gaugeLabel: '0.24mm',
          materialTypeName: 'Aluminium',
          supplierExpectedMeters: 2650,
          supplierConversionKgPerM: 6000 / 2650,
        },
      ],
      supplierID: sup.body.supplierID,
      supplierName: 'Alert Coil Supplier',
    });
    const cutting = await agent.post('/api/cutting-lists').send({
      quotationRef: 'QT-2026-001',
      customerID: 'CUS-001',
      productID: 'FG-101',
      productName: 'Longspan thin',
      dateISO: '2026-03-29',
      machineName: 'M1',
      operatorName: 'QA',
      lines: [{ sheets: 1, lengthM: 5 }],
    });
    const job = await agent.post('/api/production-jobs').send({
      cuttingListId: cutting.body.id,
      productID: 'FG-101',
      productName: 'Longspan thin',
      plannedMeters: 5,
      plannedSheets: 1,
      status: 'Planned',
    });
    const jobId = job.body.jobID;
    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/allocations`).send({
      allocations: [{ coilNo: 'CL-API-ALERT', openingWeightKg: 5000 }],
    });
    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/start`).send({ startedAtISO: '2026-03-29' });

    const prev = await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/conversion-preview`).send({
      allocations: [{ coilNo: 'CL-API-ALERT', closingWeightKg: 0, metersProduced: 50 }],
    });
    expect(prev.status).toBe(200);
    expect(prev.body.managerReviewRequired).toBe(true);
    expect(['High', 'Low']).toContain(prev.body.aggregatedAlertState);
    expect(prev.body.rows[0].managerReviewRequired).toBe(true);
  });

  it('POST allocations with append adds a coil while job is running', async () => {
    const sup = await agent.post('/api/suppliers').send({ name: 'Append Test Sup', city: 'Test' });
    expect(sup.status).toBe(201);
    const mkGrn = async (coilNo, lineKey) => {
      const po = await agent.post('/api/purchase-orders').send({
        supplierID: sup.body.supplierID,
        supplierName: 'Append Test Sup',
        orderDateISO: '2026-04-01',
        expectedDeliveryISO: '',
        status: 'Approved',
        lines: [
          {
            lineKey,
            productID: 'COIL-ALU',
            productName: 'Aluminium coil (kg)',
            color: 'IV',
            gauge: '0.24',
            metersOffered: 2000,
            conversionKgPerM: 5000 / 2000,
            qtyOrdered: 5000,
            unitPricePerKgNgn: 100,
            unitPriceNgn: 100,
            qtyReceived: 0,
          },
        ],
      });
      expect(po.status).toBe(201);
      await agent.post(`/api/purchase-orders/${encodeURIComponent(po.body.poID)}/grn`).send({
        entries: [
          {
            lineKey,
            productID: 'COIL-ALU',
            qtyReceived: 5000,
            weightKg: 5000,
            coilNo,
            location: 'Bay',
            gaugeLabel: '0.24mm',
            materialTypeName: 'Aluminium',
            supplierExpectedMeters: 2000,
            supplierConversionKgPerM: 5000 / 2000,
          },
        ],
        supplierID: sup.body.supplierID,
        supplierName: 'Append Test Sup',
      });
    };
    await mkGrn('CL-APPEND-A', 'L-AP-A');
    await mkGrn('CL-APPEND-B', 'L-AP-B');
    const cutting = await agent.post('/api/cutting-lists').send({
      quotationRef: 'QT-2026-001',
      customerID: 'CUS-001',
      productID: 'FG-101',
      productName: 'Longspan thin',
      dateISO: '2026-04-01',
      machineName: 'M1',
      operatorName: 'QA',
      lines: [{ sheets: 1, lengthM: 5 }],
    });
    const job = await agent.post('/api/production-jobs').send({
      cuttingListId: cutting.body.id,
      productID: 'FG-101',
      productName: 'Longspan thin',
      plannedMeters: 5,
      plannedSheets: 1,
      status: 'Planned',
    });
    const jobId = job.body.jobID;
    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/allocations`).send({
      allocations: [{ coilNo: 'CL-APPEND-A', openingWeightKg: 2000 }],
    });
    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/start`).send({ startedAtISO: '2026-04-01' });
    const app = await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/allocations`).send({
      append: true,
      allocations: [{ coilNo: 'CL-APPEND-B', openingWeightKg: 1500 }],
    });
    expect(app.status).toBe(200);
    expect(app.body.ok).toBe(true);
    const boot = await agent.get('/api/bootstrap');
    const coils = boot.body.productionJobCoils.filter((c) => c.jobID === jobId);
    expect(coils.length).toBe(2);
  });

  it('PATCH manager-review-signoff records remark and clears open review flag', async () => {
    const sup = await agent.post('/api/suppliers').send({ name: 'Signoff Supplier', city: 'Kano' });
    expect(sup.status).toBe(201);
    const po = await agent.post('/api/purchase-orders').send({
      supplierID: sup.body.supplierID,
      supplierName: 'Signoff Supplier',
      orderDateISO: '2026-03-29',
      expectedDeliveryISO: '',
      status: 'Approved',
      lines: [
        {
          lineKey: 'L-SO',
          productID: 'COIL-ALU',
          productName: 'Aluminium coil (kg)',
          color: 'IV',
          gauge: '0.24',
          metersOffered: 2650,
          conversionKgPerM: 6000 / 2650,
          qtyOrdered: 6000,
          unitPricePerKgNgn: 100,
          unitPriceNgn: 100,
          qtyReceived: 0,
        },
      ],
    });
    expect(po.status).toBe(201);
    await agent.post(`/api/purchase-orders/${encodeURIComponent(po.body.poID)}/grn`).send({
      entries: [
        {
          lineKey: 'L-SO',
          productID: 'COIL-ALU',
          qtyReceived: 6000,
          weightKg: 6000,
          coilNo: 'CL-API-SIGNOFF',
          location: 'Bay',
          gaugeLabel: '0.24mm',
          materialTypeName: 'Aluminium',
          supplierExpectedMeters: 2650,
          supplierConversionKgPerM: 6000 / 2650,
        },
      ],
      supplierID: sup.body.supplierID,
      supplierName: 'Signoff Supplier',
    });
    const cutting = await agent.post('/api/cutting-lists').send({
      quotationRef: 'QT-2026-001',
      customerID: 'CUS-001',
      productID: 'FG-101',
      productName: 'Longspan thin',
      dateISO: '2026-03-29',
      machineName: 'M1',
      operatorName: 'QA',
      lines: [{ sheets: 1, lengthM: 5 }],
    });
    const job = await agent.post('/api/production-jobs').send({
      cuttingListId: cutting.body.id,
      productID: 'FG-101',
      productName: 'Longspan thin',
      plannedMeters: 5,
      plannedSheets: 1,
      status: 'Planned',
    });
    const jobId = job.body.jobID;
    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/allocations`).send({
      allocations: [{ coilNo: 'CL-API-SIGNOFF', openingWeightKg: 5000 }],
    });
    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/start`).send({ startedAtISO: '2026-03-29' });
    const done = await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/complete`).send({
      completedAtISO: '2026-03-29',
      allocations: [{ coilNo: 'CL-API-SIGNOFF', closingWeightKg: 0, metersProduced: 50 }],
    });
    expect(done.status).toBe(200);
    expect(done.body.managerReviewRequired).toBe(true);

    const so = await agent.patch(`/api/production-jobs/${encodeURIComponent(jobId)}/manager-review-signoff`).send({
      remark: 'Reviewed variance — acceptable scrap margin.',
    });
    expect(so.status).toBe(200);
    expect(so.body.ok).toBe(true);
    expect(so.body.managerReviewRemark).toContain('scrap');

    const boot = await agent.get('/api/bootstrap');
    const pj = boot.body.productionJobs.find((j) => j.jobID === jobId);
    expect(pj).toBeDefined();
    expect(pj.managerReviewRequired).toBe(false);
    expect(pj.managerReviewSignedAtISO).toBeTruthy();
    expect(pj.managerReviewRemark).toContain('scrap');

    const dup = await agent.patch(`/api/production-jobs/${encodeURIComponent(jobId)}/manager-review-signoff`).send({
      remark: 'Second attempt',
    });
    expect(dup.status).toBe(400);

    const viewer = request.agent(app);
    await loginAs(viewer, 'viewer', 'Viewer@123456!');
    const denied = await viewer
      .patch(`/api/production-jobs/${encodeURIComponent(jobId)}/manager-review-signoff`)
      .send({ remark: 'Should not work' });
    expect(denied.status).toBe(403);
  });

  it('POST return-to-planned (running→planned) and FG completion-adjustments (audit + stock)', async () => {
    const sup = await agent.post('/api/suppliers').send({ name: 'Adj Supplier', city: 'Kano' });
    expect(sup.status).toBe(201);
    const po = await agent.post('/api/purchase-orders').send({
      supplierID: sup.body.supplierID,
      supplierName: 'Adj Supplier',
      orderDateISO: '2026-03-30',
      expectedDeliveryISO: '',
      status: 'Approved',
      lines: [
        {
          lineKey: 'L-ADJ',
          productID: 'COIL-ALU',
          productName: 'Aluminium coil (kg)',
          color: 'IV',
          gauge: '0.24',
          metersOffered: 2650,
          conversionKgPerM: 6000 / 2650,
          qtyOrdered: 6000,
          unitPricePerKgNgn: 100,
          unitPriceNgn: 100,
          qtyReceived: 0,
        },
      ],
    });
    expect(po.status).toBe(201);
    await agent.post(`/api/purchase-orders/${encodeURIComponent(po.body.poID)}/grn`).send({
      entries: [
        {
          lineKey: 'L-ADJ',
          productID: 'COIL-ALU',
          qtyReceived: 6000,
          weightKg: 6000,
          coilNo: 'CL-API-ADJ',
          location: 'Bay',
          gaugeLabel: '0.24mm',
          materialTypeName: 'Aluminium',
          supplierExpectedMeters: 2650,
          supplierConversionKgPerM: 6000 / 2650,
        },
      ],
      supplierID: sup.body.supplierID,
      supplierName: 'Adj Supplier',
    });
    const cutting = await agent.post('/api/cutting-lists').send({
      quotationRef: 'QT-2026-001',
      customerID: 'CUS-001',
      productID: 'FG-101',
      productName: 'Longspan thin',
      dateISO: '2026-03-30',
      machineName: 'M1',
      operatorName: 'QA',
      lines: [{ sheets: 1, lengthM: 10 }],
    });
    const job = await agent.post('/api/production-jobs').send({
      cuttingListId: cutting.body.id,
      productID: 'FG-101',
      productName: 'Longspan thin',
      plannedMeters: 10,
      plannedSheets: 1,
      status: 'Planned',
    });
    const jobId = job.body.jobID;
    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/allocations`).send({
      allocations: [{ coilNo: 'CL-API-ADJ', openingWeightKg: 4000 }],
    });
    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/start`).send({ startedAtISO: '2026-03-30' });
    const bad = await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/return-to-planned`).send({
      reason: 'short',
    });
    expect(bad.status).toBe(400);
    const back = await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/return-to-planned`).send({
      reason: 'Wrong coil picked — return to swap allocation before run.',
    });
    expect(back.status).toBe(200);
    expect(back.body.ok).toBe(true);
    const bootMid = await agent.get('/api/bootstrap');
    const pj = bootMid.body.productionJobs.find((j) => j.jobID === jobId);
    expect(pj.status).toBe('Planned');

    await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/start`).send({ startedAtISO: '2026-03-30' });
    const done = await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/complete`).send({
      completedAtISO: '2026-03-30',
      allocations: [{ coilNo: 'CL-API-ADJ', closingWeightKg: 0, metersProduced: 10 }],
    });
    expect(done.status).toBe(200);
    const fgBefore = await agent.get('/api/bootstrap');
    const fgProdBefore = fgBefore.body.products.find((p) => p.productID === 'FG-101');
    const stockBefore = Number(fgProdBefore?.stockLevel ?? 0);
    const adj = await agent.post(`/api/production-jobs/${encodeURIComponent(jobId)}/completion-adjustments`).send({
      deltaFinishedGoodsM: -1.25,
      note: 'Physical recount short — roll end scrap not entered at completion.',
    });
    expect(adj.status).toBe(200);
    expect(adj.body.ok).toBe(true);
    const fgAfter = await agent.get('/api/bootstrap');
    const pj2 = fgAfter.body.productionJobs.find((j) => j.jobID === jobId);
    expect(pj2.fgAdjustmentMetersTotal).toBeCloseTo(-1.25, 5);
    expect(pj2.effectiveOutputMeters).toBeCloseTo(8.75, 5);
    const fgProdAfter = fgAfter.body.products.find((p) => p.productID === 'FG-101');
    const stockAfter = Number(fgProdAfter?.stockLevel ?? 0);
    expect(stockAfter).toBeCloseTo(stockBefore - 1.25, 5);
  });

  it('GET /api/refunds/eligible-quotations, intelligence — permissions and response shape', async () => {
    const salesStaff = request.agent(app);
    await loginAs(salesStaff, 'sales.staff', 'Sales@123');
    const elig = await salesStaff.get('/api/refunds/eligible-quotations');
    expect(elig.status).toBe(200);
    expect(elig.body.ok).toBe(true);
    expect(Array.isArray(elig.body.quotations)).toBe(true);

    const noRef = await salesStaff.get('/api/refunds/intelligence');
    expect(noRef.status).toBe(400);
    expect(noRef.body.ok).toBe(false);

    const intel = await salesStaff.get('/api/refunds/intelligence?quotationRef=QT-2026-001');
    expect(intel.status).toBe(200);
    expect(intel.body.ok).toBe(true);
    expect(Array.isArray(intel.body.receipts)).toBe(true);
    expect(Array.isArray(intel.body.cuttingLists)).toBe(true);
    expect(intel.body.summary).toBeDefined();
    expect(typeof intel.body.summary.producedMeters).toBe('number');
    expect(Array.isArray(intel.body.summary.accessoriesSummary?.lines)).toBe(true);
    expect(typeof intel.body.summary.overpayAdvanceNgn).toBe('number');
    expect(typeof intel.body.summary.bookedOnQuotationNgn).toBe('number');
    expect(typeof intel.body.summary.quotationCashInNgn).toBe('number');

    const viewer = request.agent(app);
    await loginAs(viewer, 'viewer', 'Viewer@123456!');
    const denied = await viewer.get('/api/refunds/eligible-quotations');
    expect(denied.status).toBe(403);
  });

  it('GET /api/reports/production-transaction returns row array', async () => {
    const admin = request.agent(app);
    await loginAs(admin);
    const res = await admin.get(
      '/api/reports/production-transaction?startDate=2026-01-01&endDate=2026-12-31'
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it('POST /api/coil-lots/import upserts spreadsheet rows', async () => {
    const admin = request.agent(app);
    await loginAs(admin);
    const coilNo = `API-XLS-${Date.now()}`;
    const res = await admin.post('/api/coil-lots/import').send({
      insertOnly: true,
      rows: [
        {
          coilNo,
          productID: 'COIL-ALU',
          currentKg: 100,
          colour: 'White',
          gaugeLabel: '0.45',
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.imported).toBe(1);
  });

  it('POST /api/refunds/preview returns suggested lines from inputs', async () => {
    const q = await agent.post('/api/quotations').send({
      customerID: 'CUS-001',
      projectName: `Refund preview ${Date.now()}`,
      dateISO: '2026-03-29',
      lines: {
        products: [{ name: 'Refund preview item', qty: '1', unitPrice: '100000' }],
        accessories: [],
        services: [],
      },
    });
    expect(q.status).toBe(201);
    const quotationRef = q.body.quotation?.quotationID || q.body.quotation?.id || q.body.quotationID || q.body.id;
    expect(String(quotationRef || '')).toBeTruthy();
    const prev = await agent.post('/api/refunds/preview').send({
      customerID: 'CUS-001',
      quotationRef,
      manualAdjustmentNgn: 25_000,
    });
    expect(prev.status).toBe(200);
    expect(Number(prev.body.preview.suggestedAmountNgn || 0)).toBeGreaterThanOrEqual(25_000);
  });

  it('approved refunds support staged split payout until fully settled', async () => {
    const boot = await agent.get('/api/bootstrap');
    const [cashAccount, bankAccount] = boot.body.treasuryAccounts.slice(0, 2);
    const salesStaff = request.agent(app);
    await loginAs(salesStaff, 'sales.staff', 'Sales@123');
    const created = await salesStaff.post('/api/refunds').send({
      customerID: 'CUS-002',
      customer: 'Test Customer',
      quotationRef: 'QT-2026-002',
      reasonCategory: 'Adjustment',
      reason: 'Staged payout test',
      amountNgn: 500_000,
      calculationLines: [
        { label: 'Line A', amountNgn: 200_000 },
        { label: 'Line B', amountNgn: 300_000 },
      ],
    });
    expect(created.status).toBe(201);

    const managerAgent = request.agent(app);
    await loginAs(managerAgent, 'sales.manager', 'Sales@123');
    await managerAgent.post(`/api/refunds/${encodeURIComponent(created.body.refundID)}/decision`).send({
      status: 'Approved',
      approvalDate: '2026-03-29',
      managerComments: 'Approved for staged pay',
      approvedAmountNgn: 500_000,
    });

    const financeAgent = request.agent(app);
    await loginAs(financeAgent, 'finance.manager', 'Finance@123');
    const pay1 = await financeAgent.post(`/api/refunds/${encodeURIComponent(created.body.refundID)}/pay`).send({
      paymentLines: [
        { treasuryAccountId: cashAccount.id, amountNgn: 180_000, reference: 'RF-STG-1' },
        { treasuryAccountId: bankAccount.id, amountNgn: 120_000, reference: 'RF-STG-2' },
      ],
    });
    expect(pay1.status).toBe(201);
    expect(pay1.body.fullyPaid).toBe(false);
    expect(pay1.body.paidAmountNgn).toBe(300_000);

    const mid = await financeAgent.get('/api/bootstrap');
    const rowMid = mid.body.refunds.find((r) => r.refundID === created.body.refundID);
    expect(rowMid.status).toBe('Approved');
    expect(rowMid.paidAmountNgn).toBe(300_000);

    const pay2 = await financeAgent.post(`/api/refunds/${encodeURIComponent(created.body.refundID)}/pay`).send({
      paymentLines: [{ treasuryAccountId: cashAccount.id, amountNgn: 200_000, reference: 'RF-STG-3' }],
    });
    expect(pay2.status).toBe(201);
    expect(pay2.body.fullyPaid).toBe(true);

    const end = await financeAgent.get('/api/bootstrap');
    const rowEnd = end.body.refunds.find((r) => r.refundID === created.body.refundID);
    expect(rowEnd.status).toBe('Paid');
    expect(rowEnd.paidAmountNgn).toBe(500_000);
  });

  it('GET /api/setup and master-data POST/PATCH/DELETE round-trip', async () => {
    const list = await agent.get('/api/setup');
    expect(list.status).toBe(200);
    const beforeCount = list.body.masterData.colours.length;
    const created = await agent.post('/api/setup/colours').send({
      name: 'API Test Colour',
      abbreviation: 'ATC',
      sortOrder: 99,
      active: true,
    });
    expect(created.status).toBe(201);
    const newId = created.body.id;
    expect(newId).toBeTruthy();

    const afterCreate = await agent.get('/api/setup');
    expect(afterCreate.body.masterData.colours.length).toBe(beforeCount + 1);

    const patched = await agent.patch(`/api/setup/colours/${encodeURIComponent(newId)}`).send({
      name: 'API Test Colour Renamed',
      abbreviation: 'ATR',
      sortOrder: 100,
      active: true,
    });
    expect(patched.status).toBe(200);

    const del = await agent.delete(`/api/setup/colours/${encodeURIComponent(newId)}`);
    expect(del.status).toBe(200);

    const afterDel = await agent.get('/api/setup');
    expect(afterDel.body.masterData.colours.length).toBe(beforeCount);
  });

  it('GET /api/branches/strict-audit reports branch integrity', async () => {
    const res = await agent.get('/api/branches/strict-audit');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.strictBranchIsolationOk).toBe('boolean');
    expect(Array.isArray(res.body.knownBranches)).toBe(true);
    expect(Array.isArray(res.body.tables)).toBe(true);
    expect(res.body.tables.some((t) => t.table === 'customers')).toBe(true);
    expect(typeof res.body.totals?.missingBranchIdRows).toBe('number');
    expect(typeof res.body.totals?.invalidBranchIdRows).toBe('number');
  });

  it('HR: caps, payroll recompute, treasury CSV when locked', async () => {
    const fin = request.agent(app);
    await loginAs(fin, 'hr.manager', 'HrManager@12345!');
    await acceptAllRequiredPolicies(fin, 'HR Manager');

    const caps = await fin.get('/api/hr/caps');
    expect(caps.status).toBe(200);
    expect(caps.body.ok).toBe(true);
    expect(caps.body.enabled).toBe(true);
    expect(caps.body.canPayroll).toBe(true);

    const created = await fin.post('/api/hr/payroll-runs').send({ periodYyyymm: '209901' });
    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    const runId = created.body.id;
    expect(runId).toBeTruthy();

    const badTreasury = await fin.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/treasury-pack`);
    expect(badTreasury.status).toBe(400);

    const rec = await fin.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`).send({});
    expect(rec.status).toBe(200);
    expect(rec.body.ok).toBe(true);
    expect(Array.isArray(rec.body.lines)).toBe(true);
    expect(rec.body.lines.length).toBeGreaterThan(0);

    const md = request.agent(app);
    await loginAs(md, 'md', 'Md@1234567890!');
    const mdOk = await md.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/md-approve`).send({});
    expect(mdOk.status).toBe(200);
    expect(mdOk.body.ok).toBe(true);

    const lock = await fin.patch(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`).send({ status: 'locked' });
    expect(lock.status).toBe(200);
    expect(lock.body.ok).toBe(true);

    const csv = await fin.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/treasury-pack`);
    expect(csv.status).toBe(200);
    expect(String(csv.headers['content-type'] || '')).toMatch(/csv/i);
    expect(csv.text).toContain('209901');

    const linesOnly = await fin.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/lines`);
    expect(linesOnly.status).toBe(200);
    expect(linesOnly.body.lines.length).toBe(rec.body.lines.length);

    const snap = await fin.get('/api/hr/salary-welfare/snapshot');
    expect(snap.status).toBe(200);
    expect(snap.body.ok).toBe(true);
  });

  it('HR staff loan: approve, pay disbursement, principal + payroll deduction', async () => {
    const adminAgent = request.agent(app);
    await loginAs(adminAgent);

    const reqPolicies = await adminAgent.get('/api/hr/policy-requirements');
    expect(reqPolicies.status).toBe(200);
    for (const p of reqPolicies.body.missing || []) {
      const ack = await adminAgent.post('/api/hr/policy-acknowledgements').send({
        policyKey: p.key,
        policyVersion: p.version,
        signatureName: 'Admin User',
        context: { channel: 'api.test.loan' },
      });
      expect(ack.status).toBe(201);
    }

    const staffList = await adminAgent.get('/api/hr/staff');
    expect(staffList.status).toBe(200);
    const staffUser = staffList.body.staff.find((s) => s.username === 'sales.staff');
    expect(staffUser?.userId).toBeTruthy();

    const tenure = await adminAgent.patch(`/api/hr/staff/${encodeURIComponent(staffUser.userId)}`).send({
      dateJoinedIso: '2018-01-15',
    });
    expect(tenure.status).toBe(200);

    const staffAgent = request.agent(app);
    await loginAs(staffAgent, 'sales.staff', 'Sales@123');

    const loanTitle = `API loan ${Date.now()}`;
    const createLoan = await staffAgent.post('/api/hr/requests').send({
      kind: 'loan',
      title: loanTitle,
      body: 'Integration test',
      payload: {
        amountNgn: 120_000,
        repaymentMonths: 2,
        deductionPerMonthNgn: 60_000,
      },
    });
    expect(createLoan.status).toBe(201);
    const loanId = createLoan.body.request?.id;
    expect(loanId).toBeTruthy();

    const sub = await staffAgent.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/submit`).send({});
    expect(sub.status).toBe(200);

    const hrRev = await adminAgent.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/hr-review`).send({
      approve: true,
      note: 'ok note',
      reasonCode: 'policy',
    });
    expect(hrRev.status).toBe(200);

    const bmRev = await adminAgent.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/branch-endorse`).send({
      approve: true,
      note: 'ok note',
      reasonCode: 'policy',
    });
    expect(bmRev.status).toBe(200);

    const gmRev = await adminAgent.patch(`/api/hr/requests/${encodeURIComponent(loanId)}/gm-hr-review`).send({
      approve: true,
      note: 'ok note',
      reasonCode: 'policy',
    });
    expect(gmRev.status).toBe(200);

    const finAgent = request.agent(app);
    await loginAs(finAgent, 'finance.manager', 'Finance@123');

    const boot = await adminAgent.get('/api/bootstrap');
    expect(boot.status).toBe(200);
    const pr = boot.body.paymentRequests.find((p) => String(p.description || '').includes(loanTitle));
    expect(pr).toBeTruthy();

    const dec = await finAgent.post(`/api/payment-requests/${encodeURIComponent(pr.requestID)}/decision`).send({
      status: 'Approved',
      note: 'ok',
      actedAtISO: '2026-03-29',
    });
    expect(dec.status).toBe(200);

    const cash = boot.body.treasuryAccounts[0];
    expect(cash?.id).toBeTruthy();

    const pay = await finAgent.post(`/api/payment-requests/${encodeURIComponent(pr.requestID)}/pay`).send({
      treasuryAccountId: cash.id,
      amountNgn: 120_000,
      paidAtISO: '2026-03-29',
    });
    expect(pay.status).toBe(201);
    expect(pay.body.fullyPaid).toBe(true);

    const snap = await adminAgent.get('/api/hr/salary-welfare/snapshot');
    expect(snap.status).toBe(200);
    const ln = snap.body.approvedLoans.find((l) => l.requestId === loanId);
    expect(ln).toBeTruthy();
    expect(ln.deductionsActive).toBe(true);
    expect(ln.principalOutstandingNgn).toBe(120_000);

    await acceptAllRequiredPolicies(adminAgent, 'Admin');
    const run = await adminAgent.post('/api/hr/payroll-runs').send({ periodYyyymm: '209910' });
    expect(run.status).toBe(201);
    const runId = run.body.id;
    const comp = await adminAgent.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`).send({});
    expect(comp.status).toBe(200);
    const staffLine = comp.body.lines.find((l) => l.userId === staffUser.userId);
    expect(staffLine?.otherDeductionNgn).toBe(60_000);

    const paid = await adminAgent.patch(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`).send({ status: 'paid' });
    expect(paid.status).toBe(200);

    const snap2 = await adminAgent.get('/api/hr/salary-welfare/snapshot');
    const ln2 = snap2.body.approvedLoans.find((l) => l.requestId === loanId);
    expect(ln2.principalOutstandingNgn).toBe(60_000);
    expect(ln2.repaymentMonthsRemaining).toBe(1);
  });

  it('supports handbook acknowledgement and HR observability endpoints', async () => {
    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'admin', 'Admin@123');

    const ack = await adminAgent.post('/api/hr/policy-acknowledgements').send({
      policyKey: 'employee_handbook',
      policyVersion: '2026.04',
      signatureName: 'Admin User',
      context: { channel: 'web' },
    });
    expect(ack.status).toBe(201);
    expect(ack.body.ok).toBe(true);
    expect(ack.body.recordHash).toBeTruthy();

    const list = await adminAgent.get('/api/hr/policy-acknowledgements').query({
      policyKey: 'employee_handbook',
    });
    expect(list.status).toBe(200);
    expect(list.body.acknowledgements.length).toBeGreaterThan(0);

    const obs = await adminAgent.get('/api/hr/observability');
    expect(obs.status).toBe(200);
    expect(obs.body.ok).toBe(true);
    expect(typeof obs.body.summary.totalEvents).toBe('number');
  });

  it('HR: payroll endpoints are blocked until required policy acknowledgements exist', async () => {
    const hr = request.agent(app);
    await loginAs(hr, 'hr.manager', 'HrManager@12345!');

    const blocked = await hr.post('/api/hr/payroll-runs').send({ periodYyyymm: '209911' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('POLICY_ACK_REQUIRED');
    expect(Array.isArray(blocked.body.missing)).toBe(true);
    expect(blocked.body.missing.length).toBeGreaterThan(0);

    // Accept required policies then retry.
    const reqs = await hr.get('/api/hr/policy-requirements').send();
    expect(reqs.status).toBe(200);
    for (const p of reqs.body.missing || []) {
      const ack = await hr.post('/api/hr/policy-acknowledgements').send({
        policyKey: p.key,
        policyVersion: p.version,
        signatureName: 'HR Manager',
        context: { channel: 'api.test' },
      });
      expect(ack.status).toBe(201);
    }

    const ok = await hr.post('/api/hr/payroll-runs').send({ periodYyyymm: '209911' });
    expect(ok.status).toBe(201);
    expect(String(ok.body.id || '')).toBeTruthy();
  });

  it('HR: attendance exception waives late-day payroll deduction', async () => {
    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'admin', 'Admin@123');
    await acceptAllRequiredPolicies(adminAgent, 'Admin');

    // Register a staff user in Kaduna.
    const staffUsername = `api.att.exc.${Date.now()}`;
    const reg = await adminAgent.post('/api/hr/staff/register').send({
      username: staffUsername,
      displayName: 'Attendance Exception Staff',
      password: 'Staff@123456',
      roleKey: 'viewer',
      workspaceDepartment: 'hr',
      branchId: 'BR-KD',
      employeeNo: `EMP-EXC-${Date.now()}`,
      jobTitle: 'Tester',
      department: 'Operations',
      employmentType: 'permanent',
      dateJoinedIso: '2025-01-15',
      baseSalaryNgn: 220_000,
    });
    expect(reg.status).toBe(201);
    const staffUserId = reg.body.userId;

    // Mark a late day in March 2026.
    const roll = await adminAgent.post('/api/hr/daily-roll').send({
      branchId: 'BR-KD',
      dayIso: '2026-03-03',
      rows: [{ userId: staffUserId, status: 'late' }],
      notes: 'Late day',
    });
    expect(roll.status).toBe(200);

    // Create payroll run and recompute: expect one late-day deduction (base/22).
    const run = await adminAgent.post('/api/hr/payroll-runs').send({ periodYyyymm: '202603' });
    expect(run.status).toBe(201);
    const runId = run.body.id;
    const rec1 = await adminAgent.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`).send({});
    expect(rec1.status).toBe(200);
    const line1 = rec1.body.lines.find((l) => l.userId === staffUserId);
    expect(line1).toBeTruthy();
    const daily = Math.round(220_000 / 22);
    expect(line1.attendanceDeductionNgn).toBe(daily);

    // Create attendance exception request (late) for that day and approve it.
    const staffAgent = request.agent(app);
    await loginAs(staffAgent, staffUsername, 'Staff@123456');
    const req = await staffAgent.post('/api/hr/requests').send({
      kind: 'attendance_exception',
      title: 'Late exc',
      body: 'Traffic',
      payload: { dayIso: '2026-03-03', type: 'late', reason: 'Traffic' },
    });
    expect(req.status).toBe(201);
    const reqId = req.body.request?.id;
    const submit = await staffAgent.patch(`/api/hr/requests/${encodeURIComponent(reqId)}/submit`).send({});
    expect(submit.status).toBe(200);

    const hr = request.agent(app);
    await loginAs(hr, 'hr.manager', 'HrManager@12345!');
    await acceptAllRequiredPolicies(hr, 'HR Manager');
    const hrRev = await hr.patch(`/api/hr/requests/${encodeURIComponent(reqId)}/hr-review`).send({
      approve: true,
      note: 'ok note',
      reasonCode: 'policy',
    });
    expect(hrRev.status).toBe(200);
    const bm = await hr.patch(`/api/hr/requests/${encodeURIComponent(reqId)}/branch-endorse`).send({
      approve: true,
      note: 'ok note',
      reasonCode: 'policy',
    });
    expect(bm.status).toBe(200);
    const gm = await hr.patch(`/api/hr/requests/${encodeURIComponent(reqId)}/gm-hr-review`).send({
      approve: true,
      note: 'ok note',
      reasonCode: 'policy',
    });
    expect(gm.status).toBe(200);

    // Recompute should waive the late-day deduction.
    const rec2 = await adminAgent.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`).send({});
    expect(rec2.status).toBe(200);
    const line2 = rec2.body.lines.find((l) => l.userId === staffUserId);
    expect(line2.attendanceDeductionNgn).toBe(0);
  });

  it('supports HR Next compensation, cleanup queue, and UAT readiness endpoints', async () => {
    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'admin', 'Admin@123');
    await acceptAllRequiredPolicies(adminAgent, 'Admin');

    const staffList = await adminAgent.get('/api/hr/staff');
    expect(staffList.status).toBe(200);
    const staffUser = staffList.body.staff.find((s) => s.username === 'sales.staff') || staffList.body.staff[0];
    expect(staffUser?.userId).toBeTruthy();

    const patch = await adminAgent.patch(`/api/hr/staff/${encodeURIComponent(staffUser.userId)}`).send({
      employmentType: 'weird-temp-type',
    });
    expect(patch.status).toBe(200);

    const comp = await adminAgent.get('/api/hr/compensation-insights');
    expect(comp.status).toBe(200);
    expect(comp.body.ok).toBe(true);
    expect(typeof comp.body.summary?.medianBaseSalaryNgn).toBe('number');

    const queue = await adminAgent.get('/api/hr/data-cleanup-queue');
    expect(queue.status).toBe(200);
    expect(queue.body.ok).toBe(true);
    expect(Array.isArray(queue.body.queue)).toBe(true);
    const hit = queue.body.queue.find((q) => q.userId === staffUser.userId);
    expect(hit).toBeTruthy();

    const resolve = await adminAgent.post('/api/hr/data-cleanup-queue/resolve').send({
      userId: staffUser.userId,
      action: 'normalize_employment_type',
      targetValue: 'permanent',
    });
    expect(resolve.status).toBe(200);
    expect(resolve.body.ok).toBe(true);

    const uat = await adminAgent.get('/api/hr/next-uat-readiness');
    expect(uat.status).toBe(200);
    expect(uat.body.ok).toBe(true);
    expect(typeof uat.body.canCutover).toBe('boolean');
    expect(typeof uat.body.gates?.qualityCoveragePct).toBe('number');
    expect(uat.body.signoff == null || typeof uat.body.signoff).toBeTruthy();

    const signoff = await adminAgent.post('/api/hr/next-uat-signoff').send({
      approve: true,
      note: 'UAT signed off by QA lead',
    });
    expect(signoff.status).toBe(200);
    expect(signoff.body.ok).toBe(true);
    expect(signoff.body.signoff?.approvedAtIso).toBeTruthy();

    const uatAfter = await adminAgent.get('/api/hr/next-uat-readiness');
    expect(uatAfter.status).toBe(200);
    expect(uatAfter.body.ok).toBe(true);
    expect(uatAfter.body.signoff?.approvedAtIso).toBeTruthy();

    const revoke = await adminAgent.post('/api/hr/next-uat-signoff').send({ approve: false });
    expect(revoke.status).toBe(200);
    expect(revoke.body.ok).toBe(true);
    expect(revoke.body.signoff).toBeNull();
  });

  it('exports payroll payslip and statutory packs', async () => {
    const adminAgent = request.agent(app);
    await loginAs(adminAgent, 'admin', 'Admin@123');
    await acceptAllRequiredPolicies(adminAgent, 'Admin');
    const run = await adminAgent.post('/api/hr/payroll-runs').send({ periodYyyymm: '209912' });
    expect(run.status).toBe(201);
    const runId = run.body.id;
    const rec = await adminAgent.post(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/recompute`).send({});
    expect(rec.status).toBe(200);
    const lock = await adminAgent.patch(`/api/hr/payroll-runs/${encodeURIComponent(runId)}`).send({ status: 'locked' });
    expect(lock.status).toBe(200);

    const payslip = await adminAgent.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/payslips-pack`);
    expect(payslip.status).toBe(200);
    expect(String(payslip.text || '')).toContain('period_yyyymm');

    const statutory = await adminAgent.get(`/api/hr/payroll-runs/${encodeURIComponent(runId)}/statutory-pack`);
    expect(statutory.status).toBe(200);
    expect(String(statutory.text || '')).toContain('tax_ngn');
  });

  it('GET /api/gl/journals, journal lines, and activity return ok for admin', async () => {
    const signedAgent = request.agent(app);
    await loginAs(signedAgent);
    const j = await signedAgent.get('/api/gl/journals?startDate=2024-01-01&endDate=2024-12-31');
    expect(j.status).toBe(200);
    expect(j.body.ok).toBe(true);
    expect(Array.isArray(j.body.journals)).toBe(true);

    const a = await signedAgent.get('/api/gl/activity?startDate=2024-01-01&endDate=2024-12-31');
    expect(a.status).toBe(200);
    expect(a.body.ok).toBe(true);
    expect(Array.isArray(a.body.lines)).toBe(true);

    if (j.body.journals?.length) {
      const jid = j.body.journals[0].journalId;
      const lines = await signedAgent.get(`/api/gl/journals/${encodeURIComponent(jid)}/lines`);
      expect(lines.status).toBe(200);
      expect(lines.body.ok).toBe(true);
      expect(Array.isArray(lines.body.lines)).toBe(true);
    }
  });

  it('GET /api/accounting/costing-snapshot, fixed-assets CRUD, standard-costs PUT', async () => {
    const signedAgent = request.agent(app);
    await loginAs(signedAgent);
    const snap = await signedAgent.get('/api/accounting/costing-snapshot');
    expect(snap.status).toBe(200);
    expect(snap.body.ok).toBe(true);
    expect(Array.isArray(snap.body.rows)).toBe(true);

    const create = await signedAgent.post('/api/accounting/fixed-assets').send({
      name: 'API test asset',
      category: 'it',
      branchId: 'BR-KD',
      acquisitionDateIso: '2025-06-01',
      costNgn: 500_000,
      salvageNgn: 0,
      usefulLifeMonths: 60,
    });
    expect(create.status).toBe(201);
    expect(create.body.ok).toBe(true);
    const id = create.body.asset.id;

    const list = await signedAgent.get('/api/accounting/fixed-assets');
    expect(list.status).toBe(200);
    expect(list.body.assets.some((a) => a.id === id)).toBe(true);

    const patch = await signedAgent.patch(`/api/accounting/fixed-assets/${encodeURIComponent(id)}`).send({
      notes: 'Updated via API test',
    });
    expect(patch.status).toBe(200);
    expect(patch.body.ok).toBe(true);

    const productId = snap.body.rows[0]?.productId;
    expect(productId).toBeTruthy();
    const put = await signedAgent.put(`/api/accounting/standard-costs/${encodeURIComponent(productId)}`).send({
      standardMaterialCostNgnPerKg: 1250,
      effectiveFromIso: '2025-01-01',
    });
    expect(put.status).toBe(200);
    expect(put.body.ok).toBe(true);

    const stm = await signedAgent.get('/api/accounting/statements-pack?periodKey=2026-01');
    expect(stm.status).toBe(200);
    expect(stm.body.ok).toBe(true);
    expect(stm.body.profitAndLoss).toBeTruthy();
    expect(stm.body.balanceSheet).toBeTruthy();

    const depPrev = await signedAgent.get('/api/accounting/depreciation-preview?periodKey=2026-01');
    expect(depPrev.status).toBe(200);
    expect(depPrev.body.ok).toBe(true);
    expect(Array.isArray(depPrev.body.rows)).toBe(true);

    const recon = await signedAgent.get('/api/accounting/reconciliation-pack?periodKey=2026-01');
    expect(recon.status).toBe(200);
    expect(recon.body.ok).toBe(true);
    expect(recon.body).toHaveProperty('salesReceiptsPostedNgn');

    const cf = await signedAgent.get('/api/accounting/cash-flow?periodKey=2026-01');
    expect(cf.status).toBe(200);
    expect(cf.body.ok).toBe(true);
    expect(Array.isArray(cf.body.rows)).toBe(true);
  });

  it('POST /api/inventory/stone-receipt, accessory-receipt, ensure-stone-product; GET /api/pricing/resolve', async () => {
    const stone = await agent.post('/api/inventory/stone-receipt').send({
      designLabel: 'Milano',
      colourLabel: 'Black',
      gaugeLabel: '0.40mm',
      metresReceived: 12,
    });
    expect(stone.status).toBe(200);
    expect(stone.body.ok).toBe(true);
    expect(String(stone.body.productId || '')).toMatch(/^STONE-/);

    const acc = await agent.post('/api/inventory/accessory-receipt').send({
      productID: 'ACC-TAPPING-SCREW-PCS',
      qtyReceived: 100,
    });
    expect(acc.status).toBe(200);
    expect(acc.body.ok).toBe(true);

    const pr = await agent.get('/api/pricing/resolve').query({
      quoteItemId: 'SQI-001',
      gaugeId: 'GAU-003',
      colourId: 'COL-001',
      materialTypeId: 'MAT-001',
      profileId: 'PROF-001',
    });
    expect(pr.status).toBe(200);
    expect(pr.body.ok).toBe(true);
    expect(Number(pr.body.result?.unitPriceNgn || 0)).toBeGreaterThan(0);

    const ens = await agent.post('/api/inventory/ensure-stone-product').send({
      designLabel: 'Bond',
      colourLabel: 'Red',
      gaugeLabel: '0.45mm',
    });
    expect(ens.status).toBe(200);
    expect(ens.body.ok).toBe(true);
    expect(String(ens.body.productId || '')).toMatch(/^STONE-/);

    const csvExport = await agent.get('/api/pricing/price-list/export.csv');
    expect(csvExport.status).toBe(200);
    expect(String(csvExport.headers['content-type'] || '')).toMatch(/csv/i);
    expect(csvExport.text).toMatch(/gauge_key/);
  });
});
