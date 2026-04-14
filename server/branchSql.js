import { pgColumnExists } from './pg/pgMeta.js';

/**
 * Shared branch filtering for SQL (PostgreSQL).
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {'ALL' | string} scope
 * @param {string} [alias] Table alias (e.g. j for production_jobs j)
 */
export function branchPredicate(db, table, scope, alias) {
  if (scope === 'ALL' || !scope) {
    return { sql: '', args: [] };
  }
  let hasCol = false;
  try {
    hasCol = pgColumnExists(db, table, 'branch_id');
  } catch {
    hasCol = false;
  }
  if (!hasCol) return { sql: '', args: [] };
  const col = alias ? `${alias}.branch_id` : 'branch_id';
  /* NULL branch_id is backfilled to default in dbIntegrityMigrate — strict match only. */
  return { sql: ` AND ${col} = ?`, args: [scope] };
}
