import { describe, expect, it } from 'vitest';
import {
  poLineBenchmarkPriceNgn,
  poLinePriceSuffix,
  poLineQtyLabel,
  procurementKindFromPo,
} from './procurementPoKind.js';

describe('procurementKindFromPo', () => {
  it('derives stone from STONE- product ids', () => {
    expect(procurementKindFromPo({ lines: [{ productID: 'STONE-001' }] })).toBe('stone');
  });

  it('respects explicit procurementKind', () => {
    expect(procurementKindFromPo({ procurementKind: 'accessory', lines: [] })).toBe('accessory');
  });
});

describe('poLine display helpers', () => {
  it('benchmark price prefers per-kg for coil when only per-kg is set', () => {
    expect(poLineBenchmarkPriceNgn({ unitPriceNgn: 0, unitPricePerKgNgn: 400 }, 'coil')).toBe(400);
  });

  it('qty label uses m for stone', () => {
    expect(poLineQtyLabel({ qtyOrdered: 120 }, 'stone')).toContain('m');
    expect(poLineQtyLabel({ qtyOrdered: 5 }, 'accessory')).toContain('units');
    expect(poLineQtyLabel({ qtyOrdered: 1000 }, 'coil')).toContain('kg');
  });

  it('suffix matches kind', () => {
    expect(poLinePriceSuffix('stone')).toBe('/m');
    expect(poLinePriceSuffix('accessory')).toBe('/unit');
    expect(poLinePriceSuffix('coil')).toBe('/kg');
  });
});
