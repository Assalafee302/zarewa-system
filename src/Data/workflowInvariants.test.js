import { describe, it, expect } from 'vitest';
import { INVENTORY_PRODUCTS_MOCK, PURCHASE_ORDERS_MOCK } from './mockData.js';

const ALLOWED_PO_STATUS = new Set([
  'Pending',
  'Approved',
  'On loading',
  'In Transit',
  'Received',
  'Rejected',
]);

describe('mock data workflow invariants', () => {
  it('every PO line productID exists in inventory catalog', () => {
    const ids = new Set(INVENTORY_PRODUCTS_MOCK.map((p) => p.productID));
    for (const po of PURCHASE_ORDERS_MOCK) {
      for (const line of po.lines) {
        expect(ids.has(line.productID), `${po.poID} → ${line.productID}`).toBe(true);
      }
    }
  });

  it('PO statuses are from the app vocabulary', () => {
    for (const po of PURCHASE_ORDERS_MOCK) {
      expect(ALLOWED_PO_STATUS.has(po.status), `Unknown status on ${po.poID}: ${po.status}`).toBe(
        true
      );
    }
  });

  it('coil PO lines have non-negative ordered and received quantities', () => {
    for (const po of PURCHASE_ORDERS_MOCK) {
      for (const line of po.lines) {
        expect(line.qtyOrdered).toBeGreaterThanOrEqual(0);
        expect(line.qtyReceived).toBeGreaterThanOrEqual(0);
        expect(line.qtyReceived).toBeLessThanOrEqual(line.qtyOrdered + 1e-9);
      }
    }
  });
});
