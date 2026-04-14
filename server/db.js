import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schemaSql.js';
import { runMigrations } from './migrate.js';
import { runHrScheduledJobs } from './hrOps.js';
import { seedEverything } from './seedRun.js';
import { backfillAccountsPayableFromPurchaseOrders } from './writeOps.js';
import { ensureLegacyDemoPack } from './ensureLegacyDemoPack.js';
import { isEmptySeedMode } from './emptySeed.js';
import { PgSyncDatabase } from './pg/pgSyncDb.js';
import { ensurePostgresSchema } from './pg/pgMigrate.js';

/**
 * @param {string} dbPath File path or ':memory:'
 */
export function createDatabase(dbPath) {
  if (process.env.DATABASE_URL) {
    const db = PgSyncDatabase.fromEnv();
    // Baseline schema for Postgres (idempotent).
    // We block until schema is present because the API expects tables at startup.
    // This keeps startup behavior similar to SQLite's `db.exec(SCHEMA_SQL)`.
    db.exec(`SELECT 1`); // initialize pool early
    // `ensurePostgresSchema` is async, but PgSyncDatabase is sync; block on it here.
    // eslint-disable-next-line no-undef
    (function () {
      const sab = new SharedArrayBuffer(4);
      const ia = new Int32Array(sab);
      let err;
      ensurePostgresSchema(db.pool)
        .catch((e) => {
          err = e;
        })
        .finally(() => {
          Atomics.store(ia, 0, 1);
          Atomics.notify(ia, 0, 1);
        });
      while (Atomics.load(ia, 0) === 0) Atomics.wait(ia, 0, 0, 10_000);
      if (err) throw err;
    })();
    // Keep startup behavior aligned with SQLite mode.
    try {
      runHrScheduledJobs(db);
    } catch {
      /* optional HR tick */
    }
    seedEverything(db);
    if (!isEmptySeedMode()) ensureLegacyDemoPack(db);
    backfillAccountsPayableFromPurchaseOrders(db);
    return db;
  }
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  try {
    runHrScheduledJobs(db);
  } catch {
    /* optional HR tick */
  }
  seedEverything(db);
  if (!isEmptySeedMode()) ensureLegacyDemoPack(db);
  backfillAccountsPayableFromPurchaseOrders(db);
  return db;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Default file DB at project `data/zarewa.sqlite`.
 * Resolved from this file’s location (server/) so imports and the API hit the same DB even when
 * `process.cwd()` differs (e.g. running a script from another directory).
 */
export function defaultDbPath() {
  return path.join(__dirname, '..', 'data', 'zarewa.sqlite');
}
