/**
 * Quick Postgres connectivity check + list public tables (same env as db:migrate).
 */
import 'dotenv/config';
import { createPoolFromEnv, hasPostgresEnv } from '../server/pg/pgPool.js';

if (!hasPostgresEnv()) {
  console.error(`[db:verify] No Postgres env found after loading .env from ${process.cwd()}`);
  console.error('  Add a project-root `.env` (copy `.env.example` → `.env`) and set either:');
  console.error('    DATABASE_URL=postgresql://...   or');
  console.error('    PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE');
  console.error('  Or set those variables in this PowerShell session before running npm.');
  process.exit(1);
}

const pool = createPoolFromEnv();
try {
  await pool.query('SELECT 1 AS ok');
  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log('[db:verify] Connected. Public tables:', rows.length);
  for (const { table_name } of rows) console.log(' ', table_name);
} finally {
  await pool.end();
}
