import 'dotenv/config';

/**
 * Apply database migrations (PostgreSQL only).
 * Requires DATABASE_URL or PGHOST + PGUSER + PGPASSWORD + PGDATABASE.
 */
await import('./pg-migrate.mjs');
