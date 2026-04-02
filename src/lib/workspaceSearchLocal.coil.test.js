import { describe, it, expect } from 'vitest';
import { searchWorkspaceSnapshot } from './workspaceSearchLocal';

describe('workspaceSearchSnapshot coil search', () => {
  it('returns direct coil profile path for coil query', () => {
    const snapshot = {
      coilLots: [
        {
          coilNo: 'CL-TEST-001',
          productID: 'COIL-ALU',
          poID: 'PO-1',
          supplierName: 'Mill One',
          colour: 'Blue',
          gaugeLabel: '0.45',
        },
      ],
    };
    const hasPermission = () => true;
    const rows = searchWorkspaceSnapshot(snapshot, 'cl-test-001', hasPermission, 20);
    expect(rows.some((r) => r.kind === 'coil' && r.path === '/operations/coils/CL-TEST-001')).toBe(true);
  });
});

