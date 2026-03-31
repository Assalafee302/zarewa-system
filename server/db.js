import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schemaSql.js';
import { runMigrations } from './migrate.js';
import { seedEverything } from './seedRun.js';
import { ensureLegacyDemoPack } from './ensureLegacyDemoPack.js';

/**
 * @param {string} dbPath File path or ':memory:'
 */
export function createDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  seedEverything(db);
  ensureLegacyDemoPack(db);
  return db;
}

/** Default file DB next to project root `data/zarewa.sqlite`. */
export function defaultDbPath() {
  return path.join(process.cwd(), 'data', 'zarewa.sqlite');
}
