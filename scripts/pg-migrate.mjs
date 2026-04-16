import 'dotenv/config';
import { createPoolFromDatabaseUrl, createPoolFromEnv } from '../server/pg/pgPool.js';
import { ensurePostgresSchema } from '../server/pg/pgMigrate.js';

function createPoolForMigrate() {
  const migrateUrl = process.env.DATABASE_MIGRATE_URL?.trim();
  if (migrateUrl) return createPoolFromDatabaseUrl(migrateUrl);
  return createPoolFromEnv();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries(fn, { attempts = 10, baseDelayMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const code = e?.code;
      const retryable = code === 'EAI_AGAIN' || code === 'ENOTFOUND' || code === 'ETIMEDOUT';
      if (!retryable || i === attempts - 1) throw e;
      const delay = baseDelayMs * Math.pow(2, i);
      console.log(`[pg-migrate] retry in ${delay}ms (dns: ${code})`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

const pool = createPoolForMigrate();
try {
  await withRetries(() => ensurePostgresSchema(pool));
  console.log('[pg-migrate] OK');
} catch (e) {
  if (e?.code === '28P01') {
    const u = pool.options?.user ?? '(unknown)';
    const h = pool.options?.host ?? '';
    console.error(`[pg-migrate] Password rejected by Postgres (client user: "${u}", host: "${h}").`);
    console.error(
      '  Use the database password from Supabase → Settings → Database (not anon/service_role keys). For migrations/DDL, prefer DATABASE_MIGRATE_URL = direct URI (host db.*.supabase.co, port 5432); pooler :6543 often fails on schema apply.'
    );
    console.error(
      '  URL-encode characters in the password that are special in URLs (@ as %40, # as %23, etc.). A leading %40 in the password segment means the password starts with @.'
    );
    console.error(
      '  Alternative: Remove DATABASE_URL, then set PGHOST, PGPORT, PGUSER, PGDATABASE, and PGPASSWORD (raw password, no URL encoding). In PowerShell use single quotes for PGPASSWORD if it contains @ or $.'
    );
  }
  throw e;
} finally {
  await pool.end();
}

