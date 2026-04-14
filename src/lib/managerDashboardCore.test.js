import { describe, it, expect } from 'vitest';
import {
  flattenQuotationLineItems,
  formatRefundReasonCategory,
  ledgerTypeStyle,
  matchesInboxSearch,
  ymdLocal,
} from './managerDashboardCore';

describe('managerDashboardCore', () => {
  it('formats refund reason category arrays and strings', () => {
    expect(formatRefundReasonCategory('["Overpayment","Short delivery"]')).toBe('Overpayment, Short delivery');
    expect(formatRefundReasonCategory('Policy')).toBe('Policy');
  });

  it('flattens quotation line groups', () => {
    const lines = flattenQuotationLineItems({
      quotationLines: { products: [{ name: 'Longspan', qty: 4, unit: 'm', lineTotal: 2000 }] },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].category).toBe('products');
  });

  it('returns ledger style classes by type', () => {
    expect(ledgerTypeStyle('RECEIPT')).toContain('emerald');
    expect(ledgerTypeStyle('REFUND_OUT')).toContain('rose');
    expect(ledgerTypeStyle('RECEIPT', 'light')).toContain('emerald-100');
    expect(ledgerTypeStyle('REFUND_OUT', 'light')).toContain('rose-100');
  });

  it('matches inbox rows by tab-specific fields', () => {
    expect(matchesInboxSearch('qt-1', { id: 'QT-1', customer_name: 'Acme', status: 'Pending' }, 'clearance')).toBe(
      true
    );
    expect(
      matchesInboxSearch(
        'maintenance',
        { request_id: 'PR-1', description: 'Maintenance', expense_id: 'EXP-1', request_reference: '' },
        'payments'
      )
    ).toBe(true);
  });

  it('formats local ymd date', () => {
    expect(ymdLocal(new Date('2026-04-09T10:00:00Z'))).toBe('2026-04-09');
  });
});

