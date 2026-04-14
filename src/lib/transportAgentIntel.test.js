import { describe, expect, it } from 'vitest';
import { buildTransportAgentIntel, purchaseOrderCoilKgTotal } from './transportAgentIntel';

describe('transportAgentIntel', () => {
  it('purchaseOrderCoilKgTotal sums coil line kg', () => {
    const po = {
      procurementKind: 'coil',
      lines: [{ qtyOrdered: 100 }, { qtyOrdered: 50.5 }],
    };
    expect(purchaseOrderCoilKgTotal(po)).toBe(150.5);
  });

  it('buildTransportAgentIntel computes weighted avg per kg when fee and kg present', () => {
    const agentId = 'AG-001';
    const pos = [
      {
        poID: 'PO-1',
        supplierName: 'S',
        orderDateISO: '2026-01-02',
        status: 'Received',
        transportAgentId: agentId,
        transportAmountNgn: 100000,
        procurementKind: 'coil',
        lines: [{ productID: 'COIL-ALU', qtyOrdered: 1000 }],
      },
      {
        poID: 'PO-2',
        supplierName: 'S2',
        orderDateISO: '2026-01-01',
        status: 'Received',
        transportAgentId: agentId,
        transportAmountNgn: 50000,
        procurementKind: 'coil',
        lines: [{ productID: 'COIL-ALU', qtyOrdered: 500 }],
      },
    ];
    const intel = buildTransportAgentIntel(agentId, pos);
    expect(intel.assignmentCount).toBe(2);
    expect(intel.totalTransportNgn).toBe(150000);
    expect(intel.totalCoilKg).toBe(1500);
    expect(intel.weightedAvgTransportPerKgNgn).toBeCloseTo(100, 5);
  });
});
