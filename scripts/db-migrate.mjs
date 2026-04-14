/**
 * Apply database migrations (PostgreSQL only).
 * Requires DATABASE_URL.
 */
await import('./pg-migrate.mjs');
