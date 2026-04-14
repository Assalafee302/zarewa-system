import 'dotenv/config';
import { hasPostgresEnv } from './server/pg/pgPool.js';

if (!hasPostgresEnv()) {
  throw new Error(
    'Set DATABASE_URL or PGHOST+PGUSER+PGPASSWORD+PGDATABASE for Vitest (PostgreSQL). Example: postgres://postgres:postgres@127.0.0.1:5432/zarewa_test'
  );
}
