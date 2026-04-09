/** Default branch for legacy rows and first login. */
export const DEFAULT_BRANCH_ID = 'BR-KD';

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{ id: string; code: string; name: string; active: boolean; sortOrder: number }>}
 */
export function listBranches(db) {
  if (!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='branches'`).get()) {
    return [];
  }
  return db
    .prepare(`SELECT * FROM branches WHERE active = 1 ORDER BY sort_order ASC, id ASC`)
    .all()
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      active: Boolean(row.active),
      sortOrder: Number(row.sort_order) || 0,
    }));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 */
export function getBranch(db, id) {
  if (!id) return null;
  const row = db.prepare(`SELECT * FROM branches WHERE id = ?`).get(id);
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order) || 0,
  };
}
