/**
 * PostgreSQL metadata helpers (replace sqlite_master / PRAGMA table_info for PgSyncDatabase).
 * Table and column names must be simple identifiers (no injection).
 */
const PG_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * @param {string} name
 * @param {string} label
 * @returns {string}
 */
export function assertPgIdentifier(name, label = 'identifier') {
  const s = String(name || '');
  if (!PG_IDENT.test(s)) {
    throw new Error(`Invalid PostgreSQL ${label}: ${name}`);
  }
  return s;
}

/**
 * @param {import('./pgSyncDb.js').PgSyncDatabase} db
 * @param {string} tableName unquoted logical name (stored lower-case in information_schema)
 */
export function pgTableExists(db, tableName) {
  assertPgIdentifier(tableName, 'table name');
  const t = String(tableName).toLowerCase();
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1`
      )
      .get(t)
  );
}

/**
 * @param {import('./pgSyncDb.js').PgSyncDatabase} db
 * @param {string} tableName
 * @param {string} columnName
 */
export function pgColumnExists(db, tableName, columnName) {
  assertPgIdentifier(tableName, 'table name');
  assertPgIdentifier(columnName, 'column name');
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`
      )
      .get(String(tableName).toLowerCase(), String(columnName).toLowerCase())
  );
}

/**
 * Like PRAGMA table_info: returns `{ name }[]` in column order.
 * @param {import('./pgSyncDb.js').PgSyncDatabase} db
 * @param {string} tableName
 * @returns {{ name: string }[]}
 */
export function pgListColumns(db, tableName) {
  assertPgIdentifier(tableName, 'table name');
  return db
    .prepare(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`
    )
    .all(String(tableName).toLowerCase());
}
