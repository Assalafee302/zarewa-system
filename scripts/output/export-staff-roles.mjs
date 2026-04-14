import fs from 'node:fs';
import path from 'node:path';
import { createDatabase } from '../../server/db.js';

const outDir = path.join(process.cwd(), 'scripts', 'output');
fs.mkdirSync(outDir, { recursive: true });

const db = createDatabase();

const rows = db
  .prepare(
    `
    SELECT
      u.username,
      u.role_key AS roleKey,
      COALESCE(p.branch_id, '') AS branchId,
      COALESCE(u.display_name, '') AS displayName
    FROM app_users u
    LEFT JOIN hr_staff_profiles p ON p.user_id = u.id
    WHERE u.status = 'active'
    ORDER BY branchId, roleKey, username
    `
  )
  .all();

const header = ['username', 'role', 'branch', 'displayName'];
const lines = [header.join('\t'), ...rows.map((r) => [r.username, r.roleKey, r.branchId, r.displayName].join('\t'))];

const tsvPath = path.join(outDir, 'staff-roles.tsv');
fs.writeFileSync(tsvPath, `${lines.join('\n')}\n`, 'utf8');

db.close();
console.log(`Wrote ${rows.length} rows to ${tsvPath}`);
