import { createPoolFromEnv } from './pgPool.js';

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

function blockOn(promise) {
  // WARNING: This blocks the Node event loop.
  // It is used here only to preserve the existing synchronous better-sqlite3 API shape.
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  let result;
  let error;
  promise
    .then((r) => {
      result = r;
      Atomics.store(ia, 0, 1);
      Atomics.notify(ia, 0, 1);
    })
    .catch((e) => {
      error = e;
      Atomics.store(ia, 0, 1);
      Atomics.notify(ia, 0, 1);
    });
  // Wait until the promise settles.
  while (Atomics.load(ia, 0) === 0) {
    Atomics.wait(ia, 0, 0, 10_000);
  }
  if (error) throw error;
  return result;
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
 * Designed to minimize code churn during SQLite->Postgres migration.
 */
export class PgSyncDatabase {
  /** @param {import('pg').Pool} pool */
  constructor(pool) {
    this.pool = pool;
    /** @type {import('pg').PoolClient | null} */
    this._txClient = null;
  }

  static fromEnv() {
    return new PgSyncDatabase(createPoolFromEnv());
  }

  close() {
    return blockOn(this.pool.end());
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
    const runner = this._txClient ? this._txClient : this.pool;
    return blockOn(runner.query(q, params));
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
      if (outer._txClient) {
        // Nested transaction: just run inside the existing one.
        return fn(...args);
      }
      const client = blockOn(outer.pool.connect());
      outer._txClient = client;
      try {
        blockOn(client.query('BEGIN'));
        const result = fn(...args);
        blockOn(client.query('COMMIT'));
        return result;
      } catch (e) {
        try {
          blockOn(client.query('ROLLBACK'));
        } catch {
          // ignore rollback failures
        }
        throw e;
      } finally {
        outer._txClient = null;
        client.release();
      }
    };
  }
}

