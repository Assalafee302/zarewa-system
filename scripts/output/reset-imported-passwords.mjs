import crypto from 'node:crypto';
import { createDatabase } from '../../server/db.js';

const nextPassword = process.env.ZAREWA_RESET_PASSWORD || '';

if (!nextPassword || nextPassword.length < 12) {
  console.error('Set ZAREWA_RESET_PASSWORD to the desired new password (min 12 chars).');
  process.exit(1);
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

const seeded = new Set([
  'admin',
  'finance.manager',
  'sales.manager',
  'sales.staff',
  'procurement',
  'operations',
  'viewer',
  'hr.admin',
  'md',
  'ceo',
]);

const db = createDatabase();
const rows = db
  .prepare(`SELECT id, username FROM app_users WHERE status = 'active'`)
  .all()
  .filter((r) => !seeded.has(String(r.username || '').trim().toLowerCase()));

const hash = createPasswordHash(nextPassword);

const upd = db.prepare(`UPDATE app_users SET password_hash = ? WHERE id = ?`);
const tx = db.transaction(() => {
  for (const r of rows) upd.run(hash, r.id);
});
tx();

db.close();
console.log(`Reset password for ${rows.length} active non-seeded users (Postgres).`);
