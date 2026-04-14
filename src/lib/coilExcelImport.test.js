import { describe, it, expect } from 'vitest';
import { materialTextToProductId } from './coilExcelImport.js';

describe('materialTextToProductId', () => {
  it('maps aluminium variants to COIL-ALU', () => {
    expect(materialTextToProductId('Aluminium')).toBe('COIL-ALU');
    expect(materialTextToProductId('alu coil')).toBe('COIL-ALU');
    expect(materialTextToProductId('COIL-ALU')).toBe('COIL-ALU');
  });
  it('maps aluzinc / PPGI to PRD-102', () => {
    expect(materialTextToProductId('Aluzinc (PPGI)')).toBe('PRD-102');
    expect(materialTextToProductId('PPGI')).toBe('PRD-102');
    expect(materialTextToProductId('PRD-102')).toBe('PRD-102');
  });
  it('returns empty for unknown text', () => {
    expect(materialTextToProductId('')).toBe('');
    expect(materialTextToProductId('Titanium')).toBe('');
  });
});
