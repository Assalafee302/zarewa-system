/**
 * Runs Postgres schema + seed in a subprocess so the API main process can
 * accept HTTP (e.g. Render health checks) while this work runs.
 */
import 'dotenv/config';
import { openDatabasePoolOnly, blockUntilSchema, bootstrapDataLayer } from '../server/db.js';

const t0 = Date.now();
function log(msg) {
  console.log(`[zarewa-bootstrap] +${Date.now() - t0}ms ${msg}`);
}

log('starting (schema + seed in child process)');
try {
  log('opening pool');
  const db = openDatabasePoolOnly();
  try {
    log('blockUntilSchema (migrations / baseline DDL)…');
    blockUntilSchema(db);
    log('schema OK; bootstrapDataLayer (seeds)…');
    bootstrapDataLayer(db);
    log(`finished OK (+${Date.now() - t0}ms total)`);
  } finally {
    db.close();
  }
} catch (e) {
  console.error('[zarewa-bootstrap] FAILED:', e);
  process.exitCode = 1;
  throw e;
}
