import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { createDatabase, resetDatabaseDataForTests } from './db.js';
import {
  ensureStoneProduct,
  isStoneMeterQuotationLinesJson,
  stoneProductIdFromSpec,
} from './stoneInventory.js';

describe('stoneInventory', () => {
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

  it('stoneProductIdFromSpec builds stable id', () => {
    expect(stoneProductIdFromSpec('Milano', 'Black', '0.40mm')).toBe('STONE-milano-black-0.40mm');
  });

  it('ensureStoneProduct inserts metre SKU', () => {
    const pid = ensureStoneProduct(db, { designLabel: 'Bond', colourLabel: 'Red', gaugeLabel: '0.50mm' });
    expect(pid).toBe('STONE-bond-red-0.50mm');
    const row = db.prepare(`SELECT unit, material_type FROM products WHERE product_id = ?`).get(pid);
    expect(row.unit).toBe('m');
    expect(String(row.material_type)).toContain('Stone');
  });

  it('isStoneMeterQuotationLinesJson detects MAT-005', () => {
    expect(isStoneMeterQuotationLinesJson(db, { materialTypeId: 'MAT-005' })).toBe(true);
    expect(isStoneMeterQuotationLinesJson(db, { materialTypeId: 'MAT-002' })).toBe(false);
  });
});
