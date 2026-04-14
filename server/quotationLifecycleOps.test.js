import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  quotationAgeCalendarDays,
  expireQuotationsPastValidity,
  voidRecentQuotationsAfterMasterPriceChange,
  quotationHasCommitment,
  QUOTATION_VALIDITY_DAYS,
} from './quotationLifecycleOps.js';
import { createDatabase, resetDatabaseDataForTests } from './db.js';

describe('quotationLifecycleOps', () => {
  let db;

  beforeAll(() => {
    db = createDatabase();
  });

  beforeEach(() => {
    resetDatabaseDataForTests(db);
  });

  afterAll(() => {
    db?.close();
  });

  it('computes calendar day delta', () => {
    expect(quotationAgeCalendarDays('2026-01-01', '2026-01-01')).toBe(0);
    expect(quotationAgeCalendarDays('2026-01-01', '2026-01-10')).toBe(9);
    expect(quotationAgeCalendarDays('2026-01-01', '2026-01-11')).toBe(10);
  });

  it('expires uncommitted quotations on day ' + QUOTATION_VALIDITY_DAYS, () => {
    db.prepare(
      `INSERT INTO quotations (id, customer_id, customer_name, date_iso, payment_status, paid_ngn, status, archived)
       VALUES ('Q1','CUS-001','Test','2026-01-01','Unpaid',0,'Pending',0)`
    ).run();
    const r = expireQuotationsPastValidity(db, 'ALL', '2026-01-11');
    expect(r.expired).toBe(1);
    const row = db.prepare(`SELECT status, archived FROM quotations WHERE id='Q1'`).get();
    expect(row.status).toBe('Expired');
    expect(row.archived).toBe(1);
  });

  it('does not expire when there is payment on quote', () => {
    db.prepare(
      `INSERT INTO quotations (id, customer_id, customer_name, date_iso, payment_status, paid_ngn, status, archived)
       VALUES ('Q1','CUS-001','Test','2026-01-01','Partial',1000,'Approved',0)`
    ).run();
    const r = expireQuotationsPastValidity(db, 'ALL', '2026-02-01');
    expect(r.expired).toBe(0);
  });

  it('voids recent quotes on master price change rule', () => {
    db.prepare(
      `INSERT INTO quotations (id, customer_id, customer_name, date_iso, payment_status, paid_ngn, status, archived)
       VALUES ('Q1','CUS-001','Test','2026-04-03','Unpaid',0,'Pending',0)`
    ).run();
    const r = voidRecentQuotationsAfterMasterPriceChange(db, 'ALL', '2026-04-04');
    expect(r.voided).toBe(1);
    const row = db.prepare(`SELECT status FROM quotations WHERE id='Q1'`).get();
    expect(row.status).toBe('Void');
  });

  it('does not void when age >= PRICE_CHANGE_VOID_MAX_AGE_DAYS', () => {
    db.prepare(
      `INSERT INTO quotations (id, customer_id, customer_name, date_iso, payment_status, paid_ngn, status, archived)
       VALUES ('Q1','CUS-001','Test','2026-04-01','Unpaid',0,'Pending',0)`
    ).run();
    const r = voidRecentQuotationsAfterMasterPriceChange(db, 'ALL', '2026-04-04');
    expect(r.voided).toBe(0);
  });

  it('quotationHasCommitment detects ledger receipt', () => {
    const row = {
      id: 'Q1',
      paid_ngn: 0,
      payment_status: 'Unpaid',
      manager_production_approved_at_iso: '',
    };
    expect(quotationHasCommitment(db, row)).toBe(false);
    db.prepare(
      `INSERT INTO ledger_entries (id, at_iso, type, customer_id, customer_name, amount_ngn, quotation_ref)
       VALUES ('L1','2026-04-01T00:00:00Z','RECEIPT','CUS-001','Test',5000,'Q1')`
    ).run();
    expect(quotationHasCommitment(db, row)).toBe(true);
  });
});
