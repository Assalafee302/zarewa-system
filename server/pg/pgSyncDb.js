import { fileURLToPath } from 'node:url';
import { createSyncFn } from 'synckit';

/** @type {ReturnType<typeof createSyncFn> | null} */
let syncPg = null;

function getSyncPg() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PgSyncDatabase');
  }
  syncPg ??= createSyncFn(fileURLToPath(new URL('./pgSynckitWorker.mjs', import.meta.url)));
  return syncPg;
}

function splitSqlStatements(sql) {
  const out = [];
  let buf = '';
  let inS = false;
  let inD = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !inD) inS = !inS;
    if (c === '"' && !inS) inD = !inD;
    if (c === ';' && !inS && !inD) {
      const s = buf.trim();
      if (s) out.push(s);
      buf = '';
      continue;
    }
    buf += c;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

function replaceQMarksWithParams(sql) {
  let idx = 0;
  let out = '';
  let inS = false;
  let inD = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !inD) inS = !inS;
    if (c === '"' && !inS) inD = !inD;
    if (c === '?' && !inS && !inD) {
      idx += 1;
      out += `$${idx}`;
    } else {
      out += c;
    }
  }
  return out;
}

function mapRows(result) {
  return result?.rows || [];
}

/**
 * A synchronous, better-sqlite3-shaped adapter over `pg`.
 * Queries run in a dedicated worker (synckit) so the main thread event loop is not deadlocked.
 */
export class PgSyncDatabase {
  constructor() {
    /** @type {number | null} */
    this._txClientId = null;
  }

  static fromEnv() {
    return new PgSyncDatabase();
  }

  close() {
    if (!syncPg) return;
    syncPg({ type: 'end' });
  }

  pragma() {
    // SQLite-only; ignored in Postgres mode.
  }

  exec(sql) {
    for (const stmt of splitSqlStatements(sql)) {
      const s = stmt.trim();
      if (!s) continue;
      this._querySync(s, []);
    }
  }

  _querySync(text, params) {
    const q = replaceQMarksWithParams(text);
    if (this._txClientId != null) {
      return getSyncPg()({ type: 'txQuery', clientId: this._txClientId, text: q, params });
    }
    return getSyncPg()({ type: 'query', text: q, params });
  }

  prepare(sql) {
    const db = this;
    return {
      get(...args) {
        const r = db._querySync(sql, args);
        const rows = mapRows(r);
        return rows[0] || undefined;
      },
      all(...args) {
        const r = db._querySync(sql, args);
        return mapRows(r);
      },
      run(...args) {
        const r = db._querySync(sql, args);
        return { changes: r.rowCount || 0, lastInsertRowid: undefined };
      },
    };
  }

  transaction(fn) {
    const outer = this;
    return (...args) => {
      if (outer._txClientId != null) {
        return fn(...args);
      }
      const { clientId } = getSyncPg()({ type: 'connect' });
      outer._txClientId = clientId;
      try {
        getSyncPg()({ type: 'txQuery', clientId, text: 'BEGIN', params: [] });
        const result = fn(...args);
        getSyncPg()({ type: 'txQuery', clientId, text: 'COMMIT', params: [] });
        return result;
      } catch (e) {
        try {
          getSyncPg()({ type: 'txQuery', clientId, text: 'ROLLBACK', params: [] });
        } catch {
          /* ignore rollback failures */
        }
        throw e;
      } finally {
        getSyncPg()({ type: 'release', clientId });
        outer._txClientId = null;
      }
    };
  }
}
