import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createDatabase, resetDatabaseDataForTests } from './db.js';
import { monthBounds, getAccountingStatementsPack } from './accountingStatementsOps.js';

describe('accountingStatementsOps', () => {
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

  it('monthBounds parses YYYY-MM', () => {
    expect(monthBounds('bad')).toBeNull();
    const b = monthBounds('2026-02');
    expect(b?.start).toBe('2026-02-01');
    expect(b?.end).toBe('2026-02-28');
  });

  it('getAccountingStatementsPack returns structure', () => {
    const p = getAccountingStatementsPack(db, '2026-01', 'ALL');
    expect(p.ok).toBe(true);
    expect(p.profitAndLoss?.lines).toBeDefined();
    expect(p.balanceSheet?.lines).toBeDefined();
    expect(p.reconciliationHints?.salesReceiptsInPeriodNgn).toBeDefined();
  });
});
