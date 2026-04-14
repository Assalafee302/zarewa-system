import { describe, expect, it } from 'vitest';
import {
  poDateInRange,
  buildSupplierStatementPrintPayload,
  buildTransportStatementPrintPayload,
} from './procurementCounterpartyStatement';

const fmt = (n) => `₦${n}`;

describe('procurementCounterpartyStatement', () => {
  it('poDateInRange respects bounds', () => {
    expect(poDateInRange('2026-01-15', '2026-01-01', '2026-01-31')).toBe(true);
    expect(poDateInRange('2026-02-01', '2026-01-01', '2026-01-31')).toBe(false);
    expect(poDateInRange('', '2026-01-01', '2026-01-31')).toBe(false);
  });

  it('buildSupplierStatementPrintPayload filters by supplier and period', () => {
    const purchaseOrders = [
      {
        supplierID: 'S1',
        poID: 'PO-A',
        orderDateISO: '2026-01-10',
        status: 'Received',
        supplierPaidNgn: 1000,
        lines: [{ qtyOrdered: 1, unitPriceNgn: 1000 }],
      },
      {
        supplierID: 'S2',
        poID: 'PO-B',
        orderDateISO: '2026-01-10',
        status: 'Approved',
        supplierPaidNgn: 0,
        lines: [{ qtyOrdered: 1, unitPriceNgn: 500 }],
      },
    ];
    const p = buildSupplierStatementPrintPayload({
      purchaseOrders,
      supplierId: 'S1',
      startIso: '2026-01-01',
      endIso: '2026-01-31',
      formatNgn: fmt,
      purchaseOrderOrderedValueNgn: (po) =>
        (po.lines || []).reduce((s, l) => s + (Number(l.qtyOrdered) || 0) * (Number(l.unitPriceNgn) || 0), 0),
    });
    expect(p.rows.length).toBe(1);
    expect(p.rows[0].po).toBe('PO-A');
  });

  it('buildTransportStatementPrintPayload filters by agent', () => {
    const purchaseOrders = [
      {
        transportAgentId: 'AG-001',
        poID: 'PO-1',
        orderDateISO: '2026-03-01',
        supplierName: 'Sup',
        transportAmountNgn: 5000,
        transportAdvanceNgn: 0,
        transportPaidNgn: 5000,
        transportReference: 'WB1',
        status: 'Received',
      },
      {
        transportAgentId: 'AG-002',
        poID: 'PO-2',
        orderDateISO: '2026-03-01',
        supplierName: 'Other',
        transportAmountNgn: 9000,
        transportAdvanceNgn: 0,
        transportPaidNgn: 0,
        status: 'Received',
      },
    ];
    const p = buildTransportStatementPrintPayload({
      purchaseOrders,
      agentId: 'AG-001',
      startIso: '2026-01-01',
      endIso: '2026-12-31',
      formatNgn: fmt,
    });
    expect(p.rows.length).toBe(1);
    expect(p.rows[0].po).toBe('PO-1');
  });
});
