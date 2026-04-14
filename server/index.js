import http from 'node:http';
import os from 'node:os';
import { readAiAssistConfig } from './aiAssist.js';
import { createDatabase, defaultDbPath } from './db.js';
import { createApp } from './app.js';
import { createStaticOnlyApp } from './staticOnlyApp.js';

const dbPath = process.env.ZAREWA_DB || defaultDbPath();

const port = Number(process.env.PORT || 8787);
const listenHost =
  String(process.env.ZAREWA_LISTEN_HOST || '').trim() ||
  (process.env.RENDER === 'true' ? '0.0.0.0' : undefined);

const staticOnly =
  process.env.ZAREWA_STATIC_ONLY === '1' || process.env.ZAREWA_STATIC_ONLY === 'true';

/** Respond while DB is still initializing (Render needs an open port + 2xx on /api/health quickly). */
function bootHandler(req, res) {
  const u = (req.url || '').split('?')[0];
  if (u === '/api/health' || u === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'zarewa-api',
        starting: true,
        time: new Date().toISOString(),
      })
    );
    return;
  }
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, starting: true }));
}

function logReady(dbMode) {
  console.log(`Zarewa ready (db: ${dbMode})`);
  const listenHint = listenHost === '0.0.0.0' || listenHost === '::';
  console.log(`Zarewa listening on http://127.0.0.1:${port}`);
  if (listenHint) {
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const net of nets || []) {
        if (net && net.family === 'IPv4' && !net.internal) {
          console.log(`  Same network: http://${net.address}:${port}`);
        }
      }
    }
  }
  const ai = readAiAssistConfig();
  if (!ai.enabled) {
    console.log(
      '[zarewa] AI assistant off — set ZAREWA_AI_API_KEY (or OPENAI_API_KEY). Local Ollama: ZAREWA_AI_BASE_URL=http://127.0.0.1:11434/v1 ZAREWA_AI_API_KEY=ollama ZAREWA_AI_MODEL=llama3.2'
    );
  } else {
    console.log(`[zarewa] AI assistant on (model: ${ai.model}).`);
  }
}

if (staticOnly) {
  const app = createStaticOnlyApp();
  const server = http.createServer(app);
  function onStaticListen() {
    console.log(
      '[zarewa] ZAREWA_STATIC_ONLY=1 — serving SPA from dist/ only. No database, no full API. Remove this env var to restore the real backend.'
    );
    logReady('static-only');
  }
  if (listenHost) {
    server.listen(port, listenHost, onStaticListen);
  } else {
    server.listen(port, onStaticListen);
  }
} else {
  const server = http.createServer(bootHandler);

  function mountApp() {
    try {
      const db = createDatabase(dbPath);
      const app = createApp(db);
      server.removeListener('request', bootHandler);
      server.on('request', app);
      const dbMode = process.env.DATABASE_URL ? 'postgres' : `sqlite:${dbPath}`;
      logReady(dbMode);
    } catch (err) {
      console.error('[zarewa] Fatal startup error (database / app init):', err);
      process.exit(1);
    }
  }

  function onListen() {
    console.log(
      `Zarewa listening on port ${port} — initializing database (Render can probe this port now)...`
    );
    setImmediate(mountApp);
  }

  if (listenHost) {
    server.listen(port, listenHost, onListen);
  } else {
    server.listen(port, onListen);
  }
}
