import parse from 'pg-connection-string';
import pg from 'pg';

const { Pool } = pg;

/**
 * Read `sslmode` from a Postgres URL before we strip it for `pg-connection-string` parse.
 * @param {string} url
 * @returns {string | null}
 */
function readSslModeFromDatabaseUrl(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('sslmode')?.trim() || null;
  } catch {
    return null;
  }
}

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

/**
 * @param {string | null | undefined} host
 * @returns {boolean}
 */
function isPrivateIpv4Host(host) {
  const h = String(host || '').trim().toLowerCase();
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * Docker Compose / local stacks often use a service hostname with no TLS on 5432.
 * @param {string | null | undefined} host
 */
function isLikelyNonTlsPostgresHost(host) {
  const h = String(host || '').trim().toLowerCase();
  if (h === 'postgres') return true;
  return isPrivateIpv4Host(h);
}

/**
 * Explicit TLS for `node-pg`. Hosted providers (Supabase, Neon, RDS, …) need SSL;
 * typical `postgres:5432` Docker links do not.
 *
 * @param {{ host?: string | null, sslmodeFromUrl?: string | null }} opts
 * @returns {false | { rejectUnauthorized: false }}
 */
export function inferSslForPostgres(opts) {
  const host = opts.host ?? '';
  const urlSsl = String(opts.sslmodeFromUrl || '').trim().toLowerCase();

  const pgssl = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  if (pgssl === 'disable') return false;
  if (pgssl === 'require' || pgssl === 'verify-full' || pgssl === 'verify-ca') {
    return { rejectUnauthorized: false };
  }

  if (urlSsl) {
    if (urlSsl === 'disable') return false;
    if (urlSsl === 'allow' || urlSsl === 'prefer') return false;
    return { rejectUnauthorized: false };
  }

  if (isLocalHost(host) || isLikelyNonTlsPostgresHost(host)) return false;

  return { rejectUnauthorized: false };
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
    ssl: inferSslForPostgres({ host, sslmodeFromUrl: null }),
  };
}

export function hasPostgresEnv() {
  if (process.env.DATABASE_URL?.trim()) return true;
  return discretePostgresPoolConfig() !== null;
}

export function createPoolFromEnv() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const sslmodeFromUrl = readSslModeFromDatabaseUrl(url);
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
    poolConfig.ssl = inferSslForPostgres({ host: poolConfig.host, sslmodeFromUrl });
    return new Pool(poolConfig);
  }
  const discrete = discretePostgresPoolConfig();
  if (discrete) return new Pool(discrete);
  throw new Error(
    'Postgres is not configured. Set DATABASE_URL, or set PGHOST, PGUSER, PGPASSWORD, and PGDATABASE (optional PGPORT, default 5432). If DATABASE_URL is set, it takes precedence; remove it to use discrete PG* variables.'
  );
}

