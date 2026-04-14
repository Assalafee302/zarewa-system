/**
 * Truncate application data in the configured Postgres database (same as Playwright API startup).
 * Requires DATABASE_URL. Safe for a dedicated E2E database only.
 */
import { resetDatabaseDataForTests, openSchemaOnlyDatabase } from '../server/db.js';

if (!process.env.DATABASE_URL?.trim()) {
  console.error('[wipe-playwright-e2e] DATABASE_URL is required.');
  process.exit(1);
}

const db = openSchemaOnlyDatabase();
try {
  resetDatabaseDataForTests(db);
  console.log('[wipe-playwright-e2e] Postgres data truncated and re-seeded (E2E clean slate).');
} finally {
  db.close();
}
