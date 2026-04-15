import 'dotenv/config';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { readAiAssistConfig } from './aiAssist.js';
import { openDatabasePoolOnly } from './db.js';
import { createApp } from './app.js';
import { attachReadinessGate } from './readinessGate.js';

// Never crash-loop without logs on PaaS. Keep the process alive so /health can report status.
process.on('unhandledRejection', (reason) => {
  console.error('[zarewa] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[zarewa] Uncaught exception:', err);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const bootstrapScript = path.join(projectRoot, 'scripts', 'bootstrap-bg.mjs');

// Bind HTTP before schema + seeding so PaaS port probes see PORT open quickly.
// Also: if DATABASE_URL/PG* is missing, still bind HTTP so Railway healthchecks show a clear error.
let db;
let dbConfigError = null;
try {
  db = openDatabasePoolOnly();
} catch (e) {
  dbConfigError = e;
  db = null;
}
const bootState = { apiReady: false };
const app = db
  ? createApp(db, {
      beforeRegisterHttpApi(app) {
        attachReadinessGate(app, bootState);
      },
    })
  : (() => {
      const app = express();
      app.disable('x-powered-by');
      app.get('/health', (_req, res) => {
        res.status(200).type('text/plain').send('ok');
      });
      app.get('/api/health', (_req, res) => {
        res.status(200).json({
          ok: false,
          service: 'zarewa-api',
          time: new Date().toISOString(),
          code: 'DB_NOT_CONFIGURED',
          error: String(dbConfigError?.message || dbConfigError || 'Postgres is not configured.'),
        });
      });
      app.use('/api', (_req, res) => {
        res.status(503).json({
          ok: false,
          code: 'DB_NOT_CONFIGURED',
          error: 'Postgres is not configured on this server. Set DATABASE_URL (or PGHOST+PGUSER+PGPASSWORD+PGDATABASE).',
        });
      });
      return app;
    })();

const port = Number(process.env.PORT || 8787);
// PaaS/container networking: if PORT is provided, bind externally so platform probes can reach the app.
// Do NOT rely on Node defaults (can end up on 127.0.0.1 / :: only depending on environment).
const listenHost =
  String(process.env.ZAREWA_LISTEN_HOST || '').trim() ||
  (process.env.PORT ? '0.0.0.0' : process.env.NODE_ENV === 'production' ? '0.0.0.0' : undefined);

function onListen(server) {
  try {
    const addr = server?.address?.();
    const host =
      typeof addr === 'object' && addr && addr.address
        ? addr.address === '::'
          ? '[::]'
          : addr.address
        : listenHost || '127.0.0.1';
    console.log(`Zarewa listening on http://${host}:${port} (PostgreSQL)`);
    // Avoid noisy network interface logs on PaaS unless explicitly requested.
    if ((listenHost === '0.0.0.0' || listenHost === '::') && process.env.ZAREWA_LOG_NETWORKS) {
      for (const nets of Object.values(os.networkInterfaces())) {
        for (const net of nets || []) {
          if (net && net.family === 'IPv4' && !net.internal) {
            console.log(`  Same network: http://${net.address}:${port}`);
          }
        }
      }
    }
  } catch (e) {
    console.error('[zarewa] onListen logging failed:', e);
  }
  // Schema + seed can take minutes of synchronous CPU/DB work; run in a child process
  // so this process's event loop stays free (health checks, /api/health, 503 gate).
  if (!db) {
    console.error('[zarewa] Postgres is not configured; bootstrap will not run.');
    return;
  }
  setImmediate(() => {
    const child = spawn(process.execPath, [bootstrapScript], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', (err) => {
      console.error('[zarewa] Failed to spawn bootstrap subprocess:', err);
      // Keep HTTP up for platform healthchecks and debugging.
    });
    child.on('exit', (code, signal) => {
      if (code !== 0) {
        console.error('[zarewa] Bootstrap subprocess failed', { code, signal });
        // Keep HTTP up so healthchecks and logs work while you fix DATABASE_URL / migrations.
        return;
      }
      bootState.apiReady = true;
      const ai = readAiAssistConfig();
      if (!ai.enabled) {
        console.log(
          '[zarewa] AI assistant off — set ZAREWA_AI_API_KEY (or OPENAI_API_KEY). Local Ollama: ZAREWA_AI_BASE_URL=http://127.0.0.1:11434/v1 ZAREWA_AI_API_KEY=ollama ZAREWA_AI_MODEL=llama3.2'
        );
      } else {
        console.log(`[zarewa] AI assistant on (model: ${ai.model}).`);
      }
    });
  });
}

if (listenHost) {
  const server = app.listen(port, listenHost, () => onListen(server));
} else {
  const server = app.listen(port, () => onListen(server));
}
