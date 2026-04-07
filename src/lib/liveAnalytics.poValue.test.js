import { describe, expect, it } from 'vitest';
import { poLineOrderedValueNgn, purchaseOrderOrderedValueNgn } from './liveAnalytics.js';

describe('poLineOrderedValueNgn', () => {
  it('uses unitPriceNgn × qty when per-unit price is set', () => {
    expect(poLineOrderedValueNgn({ qtyOrdered: 100, unitPriceNgn: 50, unitPricePerKgNgn: 0 })).toBe(5000);
  });

  it('uses unitPricePerKgNgn × qty when unitPriceNgn is zero (legacy coil)', () => {
    expect(poLineOrderedValueNgn({ qtyOrdered: 10, unitPriceNgn: 0, unitPricePerKgNgn: 750 })).toBe(7500);
  });

  it('prefers unitPriceNgn when both are positive (matches existing modal behaviour)', () => {
    expect(poLineOrderedValueNgn({ qtyOrdered: 2, unitPriceNgn: 100, unitPricePerKgNgn: 999 })).toBe(200);
  });
});

describe('purchaseOrderOrderedValueNgn', () => {
  it('sums mixed lines', () => {
    const po = {
      lines: [
        { qtyOrdered: 5, unitPriceNgn: 0, unitPricePerKgNgn: 100 },
        { qtyOrdered: 10, unitPriceNgn: 200, unitPricePerKgNgn: 0 },
      ],
    };
    expect(purchaseOrderOrderedValueNgn(po)).toBe(5 * 100 + 10 * 200);
  });

  it('returns 0 for empty or missing lines', () => {
    expect(purchaseOrderOrderedValueNgn({ lines: [] })).toBe(0);
    expect(purchaseOrderOrderedValueNgn(null)).toBe(0);
  });
});
