import path from 'node:path';
import Database from 'better-sqlite3';
import { defaultDbPath } from '../server/db.js';
import { createPoolFromEnv } from '../server/pg/pgPool.js';
import { ensurePostgresSchema } from '../server/pg/pgMigrate.js';

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
      console.log(`[sqlite-to-postgres] retry in ${delay}ms (dns: ${code})`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function parseArgs(argv) {
  const out = { sqlitePath: null, truncate: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--truncate') out.truncate = true;
    else if (!out.sqlitePath) out.sqlitePath = a;
  }
  return out;
}

function listSqliteTables(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .all()
    .map((r) => r.name)
    .filter((n) => n !== 'zarewa_migrations');
}

function sqliteTableColumns(db, table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((r) => r.name);
}

function sqliteTableDeps(db, table) {
  // `PRAGMA foreign_key_list(table)` returns referenced tables.
  try {
    return db
      .prepare(`PRAGMA foreign_key_list(${table})`)
      .all()
      .map((r) => r.table)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function listPostgresTables(pool) {
  const r = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  return new Set(r.rows.map((x) => x.table_name));
}

async function postgresTableColumns(pool, table) {
  const r = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `,
    [table]
  );
  return new Set(r.rows.map((x) => x.column_name));
}

function topoSortTables(tables, depsByTable) {
  const tableSet = new Set(tables);
  const inDeg = new Map(tables.map((t) => [t, 0]));
  const edges = new Map(tables.map((t) => [t, []]));
  for (const t of tables) {
    const deps = depsByTable.get(t) || [];
    for (const d of deps) {
      if (!tableSet.has(d)) continue;
      edges.get(d).push(t);
      inDeg.set(t, (inDeg.get(t) || 0) + 1);
    }
  }
  const q = [];
  for (const [t, deg] of inDeg.entries()) if (deg === 0) q.push(t);
  const out = [];
  while (q.length) {
    const t = q.shift();
    out.push(t);
    for (const nxt of edges.get(t) || []) {
      const nd = (inDeg.get(nxt) || 0) - 1;
      inDeg.set(nxt, nd);
      if (nd === 0) q.push(nxt);
    }
  }
  // If cycles exist, append the remaining in stable order.
  if (out.length !== tables.length) {
    const remaining = tables.filter((t) => !out.includes(t));
    return [...out, ...remaining];
  }
  return out;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function buildInsert(table, cols, rowCount) {
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const values = [];
  let p = 1;
  for (let r = 0; r < rowCount; r++) {
    const one = [];
    for (let c = 0; c < cols.length; c++) {
      one.push(`$${p++}`);
    }
    values.push(`(${one.join(', ')})`);
  }
  return `INSERT INTO "${table}" (${colList}) VALUES ${values.join(', ')}`;
}

async function pgRowCount(pool, table) {
  const r = await pool.query(`SELECT COUNT(*)::bigint AS c FROM "${table}"`);
  return BigInt(r.rows[0].c);
}

async function truncateAll(pool, tables) {
  if (tables.length === 0) return;
  // CASCADE handles FK ordering safely.
  const t = tables.map((n) => `"${n}"`).join(', ');
  await pool.query(`TRUNCATE ${t} RESTART IDENTITY CASCADE`);
}

async function importTable(pool, sqliteDb, table, cols, batchSize = 250) {
  const pgCols = await postgresTableColumns(pool, table);
  const useCols = cols.filter((c) => pgCols.has(c));
  if (useCols.length !== cols.length) {
    const missing = cols.filter((c) => !pgCols.has(c));
    if (missing.length) {
      console.log(`[sqlite-to-postgres] ${table}: skipping missing columns: ${missing.join(', ')}`);
    }
  }

  const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) return { table, imported: 0 };

  for (const group of chunk(rows, batchSize)) {
    const params = [];
    for (const row of group) {
      for (const c of useCols) params.push(row[c]);
    }
    const sql = buildInsert(table, useCols, group.length);
    await pool.query(sql, params);
  }
  return { table, imported: rows.length };
}

function isFkViolation(err) {
  // Postgres error code 23503 = foreign_key_violation
  return err && err.code === '23503';
}

const args = parseArgs(process.argv.slice(2));
const sqlitePath = args.sqlitePath || process.env.ZAREWA_DB || defaultDbPath();
const absSqlitePath = path.resolve(sqlitePath);
console.log(`[sqlite-to-postgres] source sqlite: ${absSqlitePath}`);

const sqliteDb = new Database(absSqlitePath, { readonly: true });
const pool = createPoolFromEnv();

try {
  await withRetries(() => ensurePostgresSchema(pool));
  const allSqliteTables = listSqliteTables(sqliteDb);
  const pgTables = await listPostgresTables(pool);
  const tables = allSqliteTables.filter((t) => pgTables.has(t));
  const skipped = allSqliteTables.filter((t) => !pgTables.has(t));
  if (skipped.length) {
    console.log(
      `[sqlite-to-postgres] skipping missing Postgres tables (${skipped.length}): ${skipped.join(', ')}`
    );
  }
  console.log(`[sqlite-to-postgres] tables: ${tables.length}`);

  if (args.truncate) {
    console.log('[sqlite-to-postgres] truncating destination tables...');
    await truncateAll(pool, tables);
  }

  // Precompute columns per table.
  const tableCols = new Map(tables.map((t) => [t, sqliteTableColumns(sqliteDb, t)]));
  const depsByTable = new Map(tables.map((t) => [t, sqliteTableDeps(sqliteDb, t)]));
  const orderedTables = topoSortTables(tables, depsByTable);

  // Import in FK dependency order first; if something still fails with FK, we retry later.
  const pending = [...orderedTables];
  const done = new Set();
  let lastPendingSize = pending.length + 1;

  while (pending.length > 0) {
    if (pending.length === lastPendingSize) {
      throw new Error(
        `[sqlite-to-postgres] Stuck due to FK ordering. Remaining: ${pending.join(', ')}`
      );
    }
    lastPendingSize = pending.length;

    const table = pending.shift();
    if (!table) break;
    const cols = tableCols.get(table) || [];

    try {
      const before = await pgRowCount(pool, table);
      const r = await importTable(pool, sqliteDb, table, cols);
      const after = await pgRowCount(pool, table);
      console.log(
        `[sqlite-to-postgres] imported ${r.imported} into ${table} (dest: ${before} -> ${after})`
      );
      done.add(table);
    } catch (err) {
      if (isFkViolation(err)) {
        // Try later after referenced tables are imported.
        pending.push(table);
        continue;
      }
      throw err;
    }
  }

  console.log('[sqlite-to-postgres] OK');
} finally {
  sqliteDb.close();
  await pool.end();
}

