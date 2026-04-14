import { createPoolFromEnv } from '../server/pg/pgPool.js';
import { ensurePostgresSchema } from '../server/pg/pgMigrate.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries(fn, { attempts = 10, baseDelayMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const code = e?.code;
      const retryable = code === 'EAI_AGAIN' || code === 'ENOTFOUND' || code === 'ETIMEDOUT';
      if (!retryable || i === attempts - 1) throw e;
      const delay = baseDelayMs * Math.pow(2, i);
      console.log(`[pg-migrate] retry in ${delay}ms (dns: ${code})`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

const pool = createPoolFromEnv();
try {
  await withRetries(() => ensurePostgresSchema(pool));
  console.log('[pg-migrate] OK');
} finally {
  await pool.end();
}

