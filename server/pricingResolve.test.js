import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { createDatabase, resetDatabaseDataForTests } from './db.js';
import { resolveSetupPriceListUnitNgn } from './pricingResolve.js';

describe('pricingResolve', () => {
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

  it('resolveSetupPriceListUnitNgn matches specific setup row', () => {
    const r = resolveSetupPriceListUnitNgn(db, {
      quoteItemId: 'SQI-001',
      gaugeId: 'GAU-003',
      colourId: 'COL-001',
      materialTypeId: 'MAT-001',
      profileId: 'PROF-001',
    });
    expect(r).not.toBeNull();
    expect(r?.unitPriceNgn).toBeGreaterThan(0);
    expect(r?.source).toBe('setup_price_lists');
  });
});
