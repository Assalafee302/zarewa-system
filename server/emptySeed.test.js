import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, resetDatabaseDataForTests } from './db.js';

describe('ZAREWA_EMPTY_SEED', () => {
  let db;

  beforeAll(() => {
    process.env.ZAREWA_EMPTY_SEED = '1';
    db = createDatabase();
  });

  afterAll(() => {
    delete process.env.ZAREWA_EMPTY_SEED;
    db?.close();
  });

  it('bootstraps Postgres without transactional demo data', () => {
    resetDatabaseDataForTests(db);
    expect(db.prepare('SELECT COUNT(*) AS c FROM customers').get().c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS c FROM quotations').get().c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS c FROM suppliers').get().c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS c FROM treasury_accounts').get().c).toBe(1);
    expect(db.prepare('SELECT balance FROM treasury_accounts LIMIT 1').get().balance).toBe(0);
  });
});
