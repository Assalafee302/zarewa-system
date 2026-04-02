import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLedgerEntries,
  appendLedgerEntry,
  amountDueOnQuotation,
  advanceBalanceNgn,
  replaceLedgerEntries,
  recordAdvancePayment,
  recordAdvanceAppliedToQuotation,
  recordReceiptWithQuotation,
} from './customerLedgerStore.js';

const SAMPLE_QT = {
  id: 'QT-TEST-1',
  totalNgn: 500_000,
  paidNgn: 0,
};

beforeEach(() => {
  replaceLedgerEntries([]);
  localStorage.removeItem('zarewa.customerLedger.v1');
});

describe('customerLedgerStore', () => {
  it('amountDueOnQuotation uses mock paid + ledger', () => {
    expect(amountDueOnQuotation(SAMPLE_QT)).toBe(500_000);
    appendLedgerEntry({
      type: 'RECEIPT',
      customerID: 'CUS-1',
      amountNgn: 200_000,
      quotationRef: 'QT-TEST-1',
    });
    expect(amountDueOnQuotation(SAMPLE_QT)).toBe(300_000);
  });

  it('advance balance increases and decreases on apply', () => {
    recordAdvancePayment({
      customerID: 'CUS-1',
      customerName: 'Test',
      amountNgn: 200_000,
      paymentMethod: 'Transfer',
      bankReference: 'x',
      purpose: 'dep',
      dateISO: '2026-03-01',
    });
    expect(advanceBalanceNgn('CUS-1')).toBe(200_000);
    recordAdvanceAppliedToQuotation({
      customerID: 'CUS-1',
      customerName: 'Test',
      quotationRef: 'QT-TEST-1',
      amountNgn: 150_000,
    });
    expect(advanceBalanceNgn('CUS-1')).toBe(50_000);
    expect(amountDueOnQuotation(SAMPLE_QT)).toBe(350_000);
  });

  it('overpayment splits receipt and overpay advance', () => {
    const res = recordReceiptWithQuotation({
      customerID: 'CUS-2',
      customerName: 'B',
      quotationRow: { id: 'QT-TEST-1', totalNgn: 500_000, paidNgn: 0 },
      amountNgn: 550_000,
      paymentMethod: 'Cash',
      bankReference: '',
      dateISO: '2026-03-02',
    });
    expect(res.ok).toBe(true);
    expect(res.receipt.amountNgn).toBe(500_000);
    expect(res.overpay.amountNgn).toBe(50_000);
    expect(advanceBalanceNgn('CUS-2')).toBe(50_000);
    expect(amountDueOnQuotation({ id: 'QT-TEST-1', totalNgn: 500_000, paidNgn: 0 })).toBe(0);
  });

  it('loadLedgerEntries returns array', () => {
    expect(Array.isArray(loadLedgerEntries())).toBe(true);
  });
});
