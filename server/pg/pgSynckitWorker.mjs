import { runAsWorker } from 'synckit';
import { createPoolFromEnv } from './pgPool.js';

/** @type {import('pg').Pool | undefined} */
let pool;
let nextClientId = 1;
const clients = new Map();

runAsWorker(async (cmd) => {
  pool ??= createPoolFromEnv();
  if (!cmd || typeof cmd !== 'object') throw new Error('Invalid pg worker command');
  switch (cmd.type) {
    case 'query': {
      const r = await pool.query(cmd.text, cmd.params ?? []);
      return { rows: r.rows, rowCount: r.rowCount };
    }
    case 'connect': {
      const c = await pool.connect();
      const id = nextClientId++;
      clients.set(id, c);
      return { clientId: id };
    }
    case 'txQuery': {
      const c = clients.get(cmd.clientId);
      if (!c) throw new Error('Invalid clientId for txQuery');
      const r = await c.query(cmd.text, cmd.params ?? []);
      return { rows: r.rows, rowCount: r.rowCount };
    }
    case 'release': {
      const c = clients.get(cmd.clientId);
      if (c) {
        clients.delete(cmd.clientId);
        c.release();
      }
      return null;
    }
    case 'end': {
      await pool.end();
      return true;
    }
    default:
      throw new Error(`Unknown pg worker cmd: ${cmd.type}`);
  }
});
