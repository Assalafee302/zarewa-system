import { describe, expect, it } from 'vitest';
import { salesPeriodCashBridgeExportRows } from './liveAnalytics.js';

describe('salesPeriodCashBridgeExportRows', () => {
  it('tags receipt as not produced when completion is after period end', () => {
    const ledger = [
      {
        id: 'LE1',
        atISO: '2026-01-31',
        type: 'RECEIPT',
        customerID: 'C1',
        customerName: 'Acme',
        quotationRef: 'Q1',
        amountNgn: 1000,
      },
    ];
    const jobs = [
      {
        status: 'Completed',
        quotationRef: 'Q1',
        completedAtISO: '2026-02-01T10:00:00.000Z',
        actualMeters: 10,
      },
    ];
    const quotes = [{ id: 'Q1', customer: 'Acme', totalNgn: 5000, paidNgn: 1000 }];
    const rows = salesPeriodCashBridgeExportRows(ledger, jobs, quotes, [], '2026-01-01', '2026-01-31');
    const cash = rows.filter((r) => r.reportSection === 'Customer cash in (period)');
    expect(cash).toHaveLength(1);
    expect(cash[0].category).toMatch(/not produced/i);
  });

  it('tags receipt as produced when completion is on or before period end', () => {
    const ledger = [
      {
        id: 'LE1',
        atISO: '2026-01-31',
        type: 'RECEIPT',
        customerID: 'C1',
        customerName: 'Acme',
        quotationRef: 'Q1',
        amountNgn: 1000,
      },
    ];
    const jobs = [
      {
        status: 'Completed',
        quotationRef: 'Q1',
        completedAtISO: '2026-01-15T10:00:00.000Z',
        actualMeters: 10,
      },
    ];
    const quotes = [{ id: 'Q1', customer: 'Acme', totalNgn: 5000, paidNgn: 1000 }];
    const rows = salesPeriodCashBridgeExportRows(ledger, jobs, quotes, [], '2026-01-01', '2026-01-31');
    const cash = rows.filter((r) => r.reportSection === 'Customer cash in (period)');
    expect(cash[0].category).toMatch(/production completed/i);
  });
});
