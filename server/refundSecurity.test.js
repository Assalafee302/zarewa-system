import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createDatabase } from './db.js';
import { createApp } from './app.js';

/** Isolated quotation IDs so rows are not merged with totals from `seedEverything()`. */
function seedData(db) {
  const linesOvr = JSON.stringify({
    products: [{ name: 'Roofing', qty: 20, unitPrice: 5000 }],
    accessories: [],
    services: [],
  });
  const linesUnpr = JSON.stringify({
    products: [{ name: 'Roofing', qty: 20, unitPrice: 5000 }],
    accessories: [],
    services: [],
  });
  const linesDup = JSON.stringify({
    products: [{ name: 'X', qty: 1, unitPrice: 1000 }],
    accessories: [],
    services: [],
  });
  const linesSelf = JSON.stringify({
    products: [{ name: 'Roofing', qty: 1, unitPrice: 50000 }],
    accessories: [],
    services: [],
  });
  const linesPrice = JSON.stringify({
    products: [{ name: 'Special', qty: 1, unitPrice: 12000 }],
    accessories: [],
    services: [],
  });

  const insQ = db.prepare(
    `INSERT OR REPLACE INTO quotations (id, customer_id, customer_name, total_ngn, status, lines_json)
     VALUES (?,?,?,?,?,?)`
  );
  insQ.run('QT-RFS-OVR-001', 'CUS-001', 'John Doe', 100000, 'Finished', linesOvr);
  insQ.run('QT-RFS-UNPR-001', 'CUS-001', 'John Doe', 100000, 'Finished', linesUnpr);
  insQ.run('QT-RFS-DUP-001', 'CUS-001', 'John Doe', 1000, 'Finished', linesDup);
  insQ.run('QT-RFS-SELF-002', 'CUS-001', 'John Doe', 50000, 'Finished', linesSelf);
  insQ.run('QT-RFS-PRICE-027', 'CUS-NDA', 'NDA Corp', 12000, 'Finished', linesPrice);

  db.prepare(
    `INSERT OR REPLACE INTO sales_receipts (id, customer_id, customer_name, quotation_ref, amount_ngn, status, date_iso)
     VALUES ('RCT-RFS-OVR', 'CUS-001', 'John Doe', 'QT-RFS-OVR-001', 120000, 'Confirmed', '2026-04-01')`
  ).run();

  db.prepare(
    `INSERT OR REPLACE INTO production_jobs (job_id, quotation_ref, actual_meters, status, created_at_iso)
     VALUES ('JOB-RFS-OVR', 'QT-RFS-OVR-001', 100, 'Completed', '2026-04-01T10:00:00Z')`
  ).run();
}

describe('Refund Security & Substitution Logic', () => {
  let app;
  let db;

  async function loginAs(client, username = 'admin', password = 'Admin@123') {
    const res = await client.post('/api/session/login').send({ username, password });
    expect(res.status).toBe(200);
    return client;
  }

  beforeEach(async () => {
    db = createDatabase(':memory:');
    seedData(db);
    app = createApp(db);
  });

  afterEach(() => {
    db?.close();
  });

  it('blocks duplicate refund requests for the same quotation and category', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 'sales.staff', 'Sales@123');

    const res1 = await agent.post('/api/refunds').send({
      customerID: 'CUS-001',
      customer: 'John Doe',
      quotationRef: 'QT-RFS-DUP-001',
      reasonCategory: ['Overpayment'],
      amountNgn: 1000,
    });
    expect(res1.status).toBe(201);

    const res2 = await agent.post('/api/refunds').send({
      customerID: 'CUS-001',
      quotationRef: 'QT-RFS-DUP-001',
      reasonCategory: ['Overpayment'],
      amountNgn: 1000,
    });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/already exists/i);
  });

  it('allows self-approval when requester is a manager/approver', async () => {
    const manager = request.agent(app);
    await loginAs(manager, 'sales.manager', 'Sales@123');

    const create = await manager.post('/api/refunds').send({
      customerID: 'CUS-001',
      customer: 'John Doe',
      quotationRef: 'QT-RFS-SELF-002',
      reasonCategory: ['Order cancellation'],
      amountNgn: 5000,
    });
    expect(create.status).toBe(201);
    const refundID = create.body.refundID;

    const approve = await manager.post(`/api/refunds/${refundID}/decision`).send({
      status: 'Approved',
      approvedAmountNgn: 5000,
      note: 'Self-approving (should succeed)',
    });
    expect(approve.status).toBe(200);
    expect(approve.body.ok).toBe(true);
  });

  it('validates overpayment detection', async () => {
    const agent = request.agent(app);
    await loginAs(agent);

    const preview = await agent.post('/api/refunds/preview').send({
      quotationRef: 'QT-RFS-OVR-001',
      reasonCategory: ['Overpayment'],
    });

    expect(preview.status).toBe(200);
    const lines = preview.body.preview.suggestedLines;
    const overpayment = lines.find((l) => l.category === 'Overpayment');
    expect(overpayment).toBeDefined();
    expect(overpayment.amountNgn).toBe(20000);
  });

  it('validates unproduced meter detection', async () => {
    const agent = request.agent(app);
    await loginAs(agent);

    const preview = await agent.post('/api/refunds/preview').send({
      quotationRef: 'QT-RFS-UNPR-001',
      reasonCategory: ['Order cancellation'],
      quotedMeters: 120,
      actualMeters: 100,
      pricePerMeterNgn: 5000,
    });

    expect(preview.status).toBe(200);
    const lines = preview.body.preview.suggestedLines;
    const unproduced = lines.find((l) => l.label.includes('Unproduced'));
    expect(unproduced).toBeDefined();
    expect(unproduced.amountNgn).toBe(100000);
    expect(preview.body.preview.suggestedAmountNgn).toBe(100000);
  });

  it('flags price variance > 5%', async () => {
    const agent = request.agent(app);
    await loginAs(agent);

    const preview = await agent.post('/api/refunds/preview').send({
      quotationRef: 'QT-RFS-PRICE-027',
      pricePerMeterNgn: 15000,
    });

    expect(preview.status).toBe(200);
    expect(preview.body.preview.warnings.some((w) => w.includes('deviates by more than 5%'))).toBe(true);
  });
});
