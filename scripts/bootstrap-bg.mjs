/**
 * Runs Postgres schema + seed in a subprocess so the API main process can
 * accept HTTP (e.g. Render health checks) while this work runs.
 */
import 'dotenv/config';
import { openDatabasePoolOnlyForBootstrap, blockUntilSchema, bootstrapDataLayer } from '../server/db.js';

const t0 = Date.now();
function log(msg) {
  console.log(`[zarewa-bootstrap] +${Date.now() - t0}ms ${msg}`);
}

function warnIfSupabasePoolerWithoutMigrateUrl() {
  if (process.env.DATABASE_MIGRATE_URL?.trim()) return;
  const u = process.env.DATABASE_URL || '';
  const looksPooler =
    /pooler\.supabase\.com/i.test(u) && /:6543\b/.test(u);
  if (!looksPooler) return;
  console.warn(
    '[zarewa-bootstrap] WARNING: DATABASE_URL uses Supabase transaction pooler (:6543). ' +
      'Baseline DDL often hangs or never finishes here. Set DATABASE_MIGRATE_URL to the ' +
      'direct Postgres URI (Dashboard → Database → Connection string → URI, host db.*.supabase.co, port 5432). ' +
      'Keep DATABASE_URL as the pooler for the API if you like.'
  );
}

log('starting (schema + seed in child process)');
warnIfSupabasePoolerWithoutMigrateUrl();
try {
  log('opening pool');
  const db = openDatabasePoolOnlyForBootstrap();
  try {
    log('blockUntilSchema (migrations / baseline DDL)…');
    blockUntilSchema(db);
    log('schema OK; bootstrapDataLayer (seeds + legacy demo + backfills)…');
    log(
      process.env.ZAREWA_EMPTY_SEED
        ? '  ZAREWA_EMPTY_SEED set — using minimal seed path'
        : '  full demo seed path (set ZAREWA_EMPTY_SEED=1 on Railway for faster first boot)'
    );
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
