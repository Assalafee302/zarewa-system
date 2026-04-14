import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_TAB_LABELS,
  buildPaymentRequestAuditTrail,
  createRequestPayLine,
  nextExpenseId,
  normalizePaymentRequest,
  treasuryMovementStatementLabel,
} from './accountCore';

describe('accountCore', () => {
  it('provides stable account tab labels', () => {
    expect(ACCOUNT_TAB_LABELS.disbursements).toContain('requests');
  });

  it('increments expense ids', () => {
    expect(nextExpenseId([{ expenseID: 'EXP-2026-009' }])).toBe('EXP-2026-010');
  });

  it('normalizes payment request row shape', () => {
    const n = normalizePaymentRequest({ requestID: 'PR-1', paidAmountNgn: undefined, lineItems: null });
    expect(n.paidAmountNgn).toBe(0);
    expect(n.attachmentPresent).toBe(false);
    expect(Array.isArray(n.lineItems)).toBe(true);
  });

  it('creates payout lines with account id and string amount', () => {
    const line = createRequestPayLine(2, 1500);
    expect(line.treasuryAccountId).toBe('2');
    expect(line.amount).toBe('1500');
  });

  it('builds readable treasury statement labels', () => {
    const text = treasuryMovementStatementLabel({
      sourceKind: 'INTER_BRANCH_LOAN',
      counterpartyName: 'Kano Branch',
      reference: 'IB-001',
      note: 'April cycle',
    });
    expect(text).toContain('Inter-branch lending');
    expect(text).toContain('Ref IB-001');
  });

  it('builds payment request audit trail rows', () => {
    const trail = buildPaymentRequestAuditTrail({
      requestDate: '2026-04-01',
      requestedBy: 'Amina',
      approvedBy: 'Manager',
      approvedAtISO: '2026-04-02T09:00:00Z',
      paidBy: 'Finance',
      paidAtISO: '2026-04-03T12:00:00Z',
    });
    expect(trail.map((t) => t.key)).toEqual(['requested', 'approved', 'paid']);
  });
});

