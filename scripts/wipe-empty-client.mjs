#!/usr/bin/env node
/**
 * Truncate and re-seed Postgres with ZAREWA_EMPTY_SEED (no transactional demo data).
 *
 *   DATABASE_URL=postgres://... node scripts/wipe-empty-client.mjs
 *
 * Then start the API with the same ZAREWA_EMPTY_SEED=1 if you want an empty-client runtime.
 */
import { openSchemaOnlyDatabase, resetDatabaseDataForTests } from '../server/db.js';

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

process.env.ZAREWA_EMPTY_SEED = '1';
const db = openSchemaOnlyDatabase();
try {
  resetDatabaseDataForTests(db);
  console.log('[wipe-empty-client] Postgres truncated and re-seeded in empty-client mode.');
} finally {
  db.close();
}

console.log('');
console.log('Next: ZAREWA_EMPTY_SEED=1 npm run server');
