import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDatabase } from './db.js';
import { createApp } from './app.js';

describe('Zarewa API', () => {
  let app;
  let agent;

  async function loginAs(client, username = 'admin', password = 'Admin@123') {
    const res = await client.post('/api/session/login').send({ username, password });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    return res;
  }

  beforeEach(async () => {
    app = createApp(createDatabase(':memory:'));
    agent = request.agent(app);
    await loginAs(agent);
  });

  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
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

  it('PATCH /api/bank-reconciliation/:lineId updates match status', async () => {
    const boot = await agent.get('/api/bootstrap');
    const line = boot.body.bankReconciliation.find((l) => l.id === 'BR-003');
    expect(line?.status).toBe('Review');
    const patch = await agent.patch('/api/bank-reconciliation/BR-003').send({
      status: 'Matched',
      systemMatch: 'RC-2026-099',
    });
    expect(patch.status).toBe(200);
    const after = await agent.get('/api/bootstrap');
    const row = after.body.bankReconciliation.find((l) => l.id === 'BR-003');
    expect(row.status).toBe('Matched');
    expect(row.systemMatch).toBe('RC-2026-099');
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
      quotationRef: 'QT-2026-001',
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
    const receipt = await agent.post('/api/ledger/receipt').send({
      customerID: 'CUS-002',
      quotationId: 'QT-2026-002',
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
    expect(cl.productionRegisterRef).toBe('');
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

  it('POST /api/expenses and /api/treasury/transfer post treasury movements', async () => {
    const before = await agent.get('/api/bootstrap');
    const [from, to] = before.body.treasuryAccounts.slice(0, 2);

    const expense = await agent.post('/api/expenses').send({
      expenseType: 'Operational - rent & utilities',
      amountNgn: 20_000,
      date: '2026-03-29',
      category: 'Diesel',
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
      category: 'Maintenance',
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
      category: 'Diesel',
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
      category: 'Diesel',
      paymentMethod: 'Cash',
      treasuryAccountId: 1,
      reference: 'EXP-BLOCK',
    });
    expect(blockedExpense.status).toBe(400);
    expect(blockedExpense.body.error).toMatch(/locked period/i);

    const unlock = await agent.delete('/api/controls/period-locks/2026-03').send({
      reason: 'Re-open for correction',
    });
    expect(unlock.status).toBe(200);

    const postedExpense = await agent.post('/api/expenses').send({
      expenseType: 'Released expense',
      amountNgn: 5_000,
      date: '2026-03-15',
      category: 'Diesel',
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
      category: 'Test',
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
      newPassword: 'Finance@456',
    });
    expect(changed.status).toBe(200);

    const relogin = await request(app).post('/api/session/login').send({
      username: 'finance.manager',
      password: 'Finance@456',
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
    expect(row0.standardConversionKgPerM).toBeGreaterThan(0);
    expect(row0.supplierConversionKgPerM).toBeGreaterThan(0);
    expect(row0).toHaveProperty('variances');
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

  it('POST /api/refunds/preview returns suggested lines from inputs', async () => {
    const prev = await agent.post('/api/refunds/preview').send({
      customerID: 'CUS-001',
      quotationRef: 'QT-2026-001',
      manualAdjustmentNgn: 25_000,
    });
    expect(prev.status).toBe(200);
    expect(prev.body.preview.suggestedLines.some((l) => l.label.includes('Manual'))).toBe(true);
    expect(prev.body.preview.suggestedAmountNgn).toBe(25_000);
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
});
