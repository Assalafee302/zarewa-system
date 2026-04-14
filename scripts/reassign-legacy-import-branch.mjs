#!/usr/bin/env node
/**
 * Reassign all Access-imported legacy rows to a workspace branch so they appear when that
 * branch is selected in the app (Sales / Customers / ledger are scoped by branch_id).
 *
 *   DATABASE_URL=postgres://... node scripts/reassign-legacy-import-branch.mjs BR-YOL
 */
import { createDatabase } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { listBranches } from '../server/branches.js';

const targetBranch = String(process.argv[2] ?? '').trim();

if (!targetBranch) {
  console.error('Usage: node scripts/reassign-legacy-import-branch.mjs <branchId>');
  console.error('Example: node scripts/reassign-legacy-import-branch.mjs BR-YOL');
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const db = createDatabase();
runMigrations(db);

const valid = new Set(listBranches(db).map((b) => b.id));
if (!valid.has(targetBranch)) {
  console.error('Unknown branch:', targetBranch, '| valid:', [...valid].join(', '));
  db.close();
  process.exit(1);
}

function hasCol(table) {
  if (!/^[a-zA-Z0-9_]+$/.test(table)) return false;
  const row = db
    .prepare(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = 'branch_id'`
    )
    .get(table);
  return Boolean(row);
}

/** @param {string} sql */
function execUpdate(sql) {
  return db.prepare(sql).run(targetBranch).changes;
}

let n = 0;

db.transaction(() => {
  if (hasCol('customers')) {
    n += execUpdate(`UPDATE customers SET branch_id = ? WHERE customer_id LIKE 'CUS-LEGACY%'`);
  }
  if (hasCol('quotations')) {
    n += execUpdate(`UPDATE quotations SET branch_id = ? WHERE id LIKE 'QT-LEGACY%'`);
  }
  if (hasCol('ledger_entries')) {
    n += execUpdate(
      `UPDATE ledger_entries SET branch_id = ? WHERE quotation_ref LIKE 'QT-LEGACY%' OR id LIKE 'LE-LEGACY%'`
    );
  }
  if (hasCol('sales_receipts')) {
    n += execUpdate(`UPDATE sales_receipts SET branch_id = ? WHERE quotation_ref LIKE 'QT-LEGACY%'`);
  }
  if (hasCol('cutting_lists')) {
    n += execUpdate(`UPDATE cutting_lists SET branch_id = ? WHERE id LIKE 'CL-LEGACY%'`);
  }
  if (hasCol('production_jobs')) {
    n += execUpdate(`UPDATE production_jobs SET branch_id = ? WHERE job_id LIKE 'PRO-LEGACY%'`);
  }
  if (hasCol('coil_lots')) {
    n += execUpdate(`UPDATE coil_lots SET branch_id = ? WHERE coil_no LIKE 'COIL-LEGACY%'`);
  }
  if (hasCol('products')) {
    n += execUpdate(`UPDATE products SET branch_id = ? WHERE product_id = 'PRD-LEGACY-COIL'`);
  }
})();

db.close();
console.log(`Updated ${n} row(s) to branch_id = ${targetBranch}`);
console.log('Sign out and back in (or hard refresh) so the SPA reloads bootstrap for that branch.');
