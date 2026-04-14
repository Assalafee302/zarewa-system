import { runHrScheduledJobs } from './hrOps.js';
import { seedEverything } from './seedRun.js';
import { backfillAccountsPayableFromPurchaseOrders } from './writeOps.js';
import { ensureLegacyDemoPack } from './ensureLegacyDemoPack.js';
import { isEmptySeedMode } from './emptySeed.js';
import { PgSyncDatabase, blockOn } from './pg/pgSyncDb.js';
import { ensurePostgresSchema } from './pg/pgMigrate.js';
import { truncatePublicApplicationTables } from './pg/pgTruncate.js';

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !String(url).trim()) {
    throw new Error(
      'DATABASE_URL is required. Zarewa uses PostgreSQL only. Example: postgres://user:pass@127.0.0.1:5432/zarewa'
    );
  }
}

function blockUntilSchema(db) {
  db.exec(`SELECT 1`);
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
}

export function bootstrapDataLayer(db) {
  try {
    runHrScheduledJobs(db);
  } catch {
    /* optional HR tick */
  }
  seedEverything(db);
  if (!isEmptySeedMode()) ensureLegacyDemoPack(db);
  backfillAccountsPayableFromPurchaseOrders(db);
}

/**
 * Truncate application data then re-run the same post-schema bootstrap as API startup.
 * Used by Vitest, Playwright API, and wipe helpers.
 *
 * @param {PgSyncDatabase} db
 */
export function resetDatabaseDataForTests(db) {
  if (!db?.pool || typeof db.pool.query !== 'function') {
    throw new Error('resetDatabaseDataForTests expects a Postgres-backed db (PgSyncDatabase).');
  }
  blockOn(truncatePublicApplicationTables(db.pool));
  bootstrapDataLayer(db);
}

/**
 * Pool + schema only (no seed). Used by Playwright API before a full truncate+seed.
 * @returns {PgSyncDatabase}
 */
export function openSchemaOnlyDatabase() {
  requireDatabaseUrl();
  const db = PgSyncDatabase.fromEnv();
  blockUntilSchema(db);
  return db;
}

/**
 * Open the Postgres pool, ensure schema, and bootstrap seeds.
 * @returns {PgSyncDatabase}
 */
export function createDatabase() {
  const db = openSchemaOnlyDatabase();
  bootstrapDataLayer(db);
  return db;
}
