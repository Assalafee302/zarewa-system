/**
 * Apply the legacy demo pack (NDA / QT-2026-027 / CL-2026-1592 / RC-2026-1849) to the database.
 * Use when the API was not restarted after adding ensureLegacyDemoPack.
 *
 * Usage: npm run db:legacy-demo
 *        DATABASE_URL=postgres://... npm run db:legacy-demo
 */
import { createDatabase } from './db.js';

const db = createDatabase();

const row = db.prepare('SELECT id, quotation_ref, date_iso FROM cutting_lists WHERE id = ?').get('CL-2026-1592');
db.close();

if (row) {
  console.log(`[zarewa] Verified cutting list in DB: ${row.id} · ${row.quotation_ref} · ${row.date_iso}`);
} else {
  console.warn('[zarewa] Cutting list CL-2026-1592 still missing — check server logs for errors.');
}

console.log('[zarewa] Refresh the browser (or sign out/in) so Sales reloads bootstrap data.');
