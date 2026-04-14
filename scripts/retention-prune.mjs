/**
 * Retention / pruning helper for large tables (PostgreSQL).
 *
 * Default is DRY RUN.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/retention-prune.mjs
 *
 * Env:
 *   RETAIN_DAYS=365
 *   PRUNE_DRY_RUN=true|false
 */

import { createDatabase } from '../server/db.js';

const RETAIN_DAYS = Math.max(7, Number(process.env.RETAIN_DAYS || 365));
const DRY_RUN = String(process.env.PRUNE_DRY_RUN || 'true').toLowerCase() !== 'false';

function isoDateDaysAgo(days) {
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  return dt.toISOString().slice(0, 10);
}

const cutoffDateIso = isoDateDaysAgo(RETAIN_DAYS);

const db = createDatabase();

function tableExists(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return false;
  const row = db
    .prepare(
      `SELECT 1 AS x FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?`
    )
    .get(name);
  return Boolean(row);
}

function pruneTable(table, dateColumn, extraWhere = '') {
  if (!/^[a-zA-Z0-9_]+$/.test(table) || !/^[a-zA-Z0-9_]+$/.test(dateColumn)) {
    return { table, skipped: true, deleted: 0, error: 'bad_identifier' };
  }
  if (!tableExists(table)) return { table, skipped: true, deleted: 0 };
  const where = `WHERE ${dateColumn} < ? ${extraWhere ? `AND (${extraWhere})` : ''}`;
  const countRow = db.prepare(`SELECT COUNT(*) AS c FROM "${table}" ${where}`).get(cutoffDateIso);
  const toDelete = Number(countRow?.c) || 0;
  if (DRY_RUN || toDelete === 0) return { table, skipped: false, deleted: 0, wouldDelete: toDelete };
  const r = db.prepare(`DELETE FROM "${table}" ${where}`).run(cutoffDateIso);
  return { table, skipped: false, deleted: r.changes || 0 };
}

const plan = [
  () => pruneTable('audit_log', 'occurred_at_iso'),
  () => pruneTable('production_conversion_checks', 'at_iso'),
  () => pruneTable('treasury_movements', 'at_iso'),
];

const results = [];
db.transaction(() => {
  for (const fn of plan) results.push(fn());
})();

console.log(
  JSON.stringify(
    {
      dryRun: DRY_RUN,
      retainDays: RETAIN_DAYS,
      cutoffDateIso,
      results,
      note: DRY_RUN ? 'Dry run only. Set PRUNE_DRY_RUN=false to delete.' : 'Deletion completed.',
    },
    null,
    2
  )
);

db.close();
