import parse from 'pg-connection-string';
import pg from 'pg';

const { Pool } = pg;

/**
 * `pg-connection-string` warns when the URL contains `sslmode=require` (etc.) because
 * future libpq semantics will differ. We apply TLS via explicit `poolConfig.ssl` below,
 * so strip ssl-related query params before parse to avoid noisy logs on Railway/Supabase.
 * @param {string} url
 */
function databaseUrlForPgParse(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (k.toLowerCase() === 'sslmode') u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function shouldUseSsl() {
  const v = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  if (v === 'disable') return false;
  // Supabase requires SSL; most hosted Postgres URLs include sslmode=require.
  return true;
}

function isLocalHost(host) {
  const h = String(host || '').trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/**
 * Build pool options from PGHOST / PGUSER / PGPASSWORD / PGDATABASE (optional PGPORT).
 * Avoids URL-encoding issues when DATABASE_URL is awkward in PowerShell.
 * Remote hosts require PGPASSWORD to be set (may be empty for rare local trust setups).
 * @returns {import('pg').PoolConfig | null}
 */
export function discretePostgresPoolConfig() {
  const host = process.env.PGHOST?.trim();
  const user = process.env.PGUSER?.trim();
  const database = process.env.PGDATABASE?.trim();
  if (!host || !user || !database) return null;
  if (!isLocalHost(host) && process.env.PGPASSWORD === undefined) return null;
  const password = process.env.PGPASSWORD ?? '';
  return {
    host,
    port: Number(process.env.PGPORT || 5432),
    user,
    password,
    database,
    max: Number(process.env.PGPOOL_MAX || 10),
    // Helps reduce "random hangs" on flaky networks by failing fast.
    connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT_MS || 10_000),
    query_timeout: Number(process.env.PGQUERY_TIMEOUT_MS || 30_000),
    statement_timeout: Number(process.env.PGSTATEMENT_TIMEOUT_MS || 30_000),
    keepAlive: true,
    ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false,
  };
}

export function hasPostgresEnv() {
  if (process.env.DATABASE_URL?.trim()) return true;
  return discretePostgresPoolConfig() !== null;
}

export function createPoolFromEnv() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const urlForParse = databaseUrlForPgParse(url);
    // `pg` does `Object.assign({}, config, parse(connectionString))`, so query
    // `sslmode=require` becomes `ssl: {}` and overwrites any caller `ssl`, which
    // re-enables certificate verification and breaks some pooler / proxy chains.
    const parsed = parse(urlForParse);
    const poolConfig = {
      ...parsed,
      max: Number(process.env.PGPOOL_MAX || 10),
      connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT_MS || 10_000),
      query_timeout: Number(process.env.PGQUERY_TIMEOUT_MS || 30_000),
      statement_timeout: Number(process.env.PGSTATEMENT_TIMEOUT_MS || 30_000),
      keepAlive: true,
    };
    delete poolConfig.ssl;
    delete poolConfig.sslmode;
    poolConfig.ssl = shouldUseSsl() ? { rejectUnauthorized: false } : false;
    return new Pool(poolConfig);
  }
  const discrete = discretePostgresPoolConfig();
  if (discrete) return new Pool(discrete);
  throw new Error(
    'Postgres is not configured. Set DATABASE_URL, or set PGHOST, PGUSER, PGPASSWORD, and PGDATABASE (optional PGPORT, default 5432). If DATABASE_URL is set, it takes precedence; remove it to use discrete PG* variables.'
  );
}

