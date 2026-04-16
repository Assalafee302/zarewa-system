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

// ---------------------------
// Crash Safety (IMPORTANT)
// ---------------------------
process.on('unhandledRejection', (reason) => {
  console.error('[zarewa] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[zarewa] Uncaught exception:', err);
});

// ---------------------------
// Paths
// ---------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const bootstrapScript = path.join(projectRoot, 'scripts', 'bootstrap-bg.mjs');

// ---------------------------
// Database Init (safe)
// ---------------------------
let db;
let dbConfigError = null;

try {
  db = openDatabasePoolOnly();
} catch (e) {
  dbConfigError = e;
  db = null;
}

// ---------------------------
// Boot State
// ---------------------------
const bootState = {
  apiReady: false,
  bootstrapFailed: false,
  bootstrapExitCode: null,
  bootstrapSignal: null,
  bootstrapSpawnError: null,
};

// ---------------------------
// App Creation
// ---------------------------
let app;

if (db) {
  app = createApp(db, {
    bootState,
    beforeRegisterHttpApi(appInstance) {
      attachReadinessGate(appInstance, bootState);
    },
  });
} else {
  // Fallback if DB is not configured
  app = express();
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
      error: String(
        dbConfigError?.message ||
          dbConfigError ||
          'Postgres is not configured.'
      ),
    });
  });

  app.use('/api', (_req, res) => {
    res.status(503).json({
      ok: false,
      code: 'DB_NOT_CONFIGURED',
      error:
        'Postgres is not configured. Set DATABASE_URL or PG* variables.',
    });
  });
}

// Static + SPA fallback live in createApp (app.js): skips /api, avoids sending index.html for
// missing hashed assets, honors ZAREWA_STATIC_DIR. Do not duplicate here.

// ---------------------------
// Port & Host (Railway Safe)
// ---------------------------
const port = Number(process.env.PORT || 8787);

function resolveListenHost() {
  let h = String(process.env.ZAREWA_LISTEN_HOST || '').trim();

  if (h === '::') h = '0.0.0.0';
  if (h) return h;

  if (process.env.PORT || process.env.NODE_ENV === 'production') {
    return '0.0.0.0';
  }

  return undefined;
}

const listenHost = resolveListenHost();

// ---------------------------
// On Server Start
// ---------------------------
function onListen(server) {
  try {
    const addr = server?.address?.();

    const host =
      typeof addr === 'object' && addr?.address
        ? addr.address === '::'
          ? '[::]'
          : addr.address
        : listenHost || '127.0.0.1';

    console.log(`Zarewa running on http://${host}:${port}`);

    if (
      (listenHost === '0.0.0.0' || listenHost === '::') &&
      process.env.ZAREWA_LOG_NETWORKS
    ) {
      for (const nets of Object.values(os.networkInterfaces())) {
        for (const net of nets || []) {
          if (net?.family === 'IPv4' && !net.internal) {
            console.log(`  Network: http://${net.address}:${port}`);
          }
        }
      }
    }
  } catch (e) {
    console.error('[zarewa] Listen logging failed:', e);
  }

  // ---------------------------
  // Bootstrap (background)
  // ---------------------------
  if (!db) {
    console.error('[zarewa] No DB → skipping bootstrap');
    return;
  }

  setImmediate(() => {
    const child = spawn(process.execPath, [bootstrapScript], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', (err) => {
      console.error('[zarewa] Bootstrap spawn failed:', err);
      bootState.bootstrapFailed = true;
      bootState.bootstrapSpawnError = String(err?.message || err);
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        bootState.apiReady = true;

        const ai = readAiAssistConfig();

        if (!ai.enabled) {
          console.log(
            '[zarewa] AI OFF → set ZAREWA_AI_API_KEY to enable'
          );
        } else {
          console.log(`[zarewa] AI ON (model: ${ai.model})`);
        }

        return;
      }

      console.error('[zarewa] Bootstrap failed', { code, signal });

      bootState.bootstrapFailed = true;
      bootState.bootstrapExitCode = code ?? null;
      bootState.bootstrapSignal = signal ?? null;
    });
  });
}

// ---------------------------
// Start Server
// ---------------------------
const server =
  listenHost !== undefined
    ? app.listen(port, listenHost, () => onListen(server))
    : app.listen(port, () => onListen(server));