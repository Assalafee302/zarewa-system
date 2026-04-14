import pg from 'pg';

const { Pool } = pg;

function shouldUseSsl() {
  const v = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  if (v === 'disable') return false;
  // Supabase requires SSL; most hosted Postgres URLs include sslmode=require.
  return true;
}

export function createPoolFromEnv() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for Postgres mode.');
  }
  return new Pool({
    connectionString: url,
    ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.PGPOOL_MAX || 10),
  });
}

