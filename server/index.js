import 'dotenv/config';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAiAssistConfig } from './aiAssist.js';
import { openDatabasePoolOnly } from './db.js';
import { createApp } from './app.js';
import { attachReadinessGate } from './readinessGate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const bootstrapScript = path.join(projectRoot, 'scripts', 'bootstrap-bg.mjs');

// Bind HTTP before schema + seeding so PaaS (e.g. Render) port probes see PORT open quickly.
const db = openDatabasePoolOnly();
const bootState = { apiReady: false };
const app = createApp(db, {
  beforeRegisterHttpApi(app) {
    attachReadinessGate(app, bootState);
  },
});

const port = Number(process.env.PORT || 8787);
const listenHost = String(process.env.ZAREWA_LISTEN_HOST || '').trim() || undefined;

function onListen() {
  console.log(`Zarewa listening on http://127.0.0.1:${port} (PostgreSQL)`);
  if (listenHost === '0.0.0.0' || listenHost === '::') {
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const net of nets || []) {
        if (net && net.family === 'IPv4' && !net.internal) {
          console.log(`  Same network: http://${net.address}:${port}`);
        }
      }
    }
  }
  // Schema + seed can take minutes of synchronous CPU/DB work; run in a child process
  // so this process's event loop stays free (Render health checks, /api/health, 503 gate).
  setImmediate(() => {
    const child = spawn(process.execPath, [bootstrapScript], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', (err) => {
      console.error('[zarewa] Failed to spawn bootstrap subprocess:', err);
      process.exit(1);
    });
    child.on('exit', (code, signal) => {
      if (code !== 0) {
        console.error('[zarewa] Bootstrap subprocess failed', { code, signal });
        process.exit(code ?? 1);
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
  app.listen(port, listenHost, onListen);
} else {
  app.listen(port, onListen);
}
