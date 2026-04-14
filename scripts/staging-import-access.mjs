#!/usr/bin/env node
/**
 * Step 1 — Run Access import against the database in DATABASE_URL.
 * Use a dedicated staging Postgres URL (do not point at production).
 *
 *   DATABASE_URL=postgres://... node scripts/staging-import-access.mjs
 *   node scripts/staging-import-access.mjs -- --strict-customer-merge
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is required (use a staging database).');
  process.exit(1);
}

const importScript = path.join(root, 'server', 'importAccessSalesPack.mjs');
const extra = process.argv.slice(2).filter((a) => a !== '--');
const args = [importScript, '--dir', path.join(root, 'docs', 'import'), ...extra];

const r = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env },
});

if (r.status !== 0) {
  console.error('Import failed with exit', r.status);
  process.exit(r.status ?? 1);
}

console.log('\nNext: npm run import:validate');
