import 'dotenv/config';
import os from 'node:os';
import { readAiAssistConfig } from './aiAssist.js';
import { openDatabasePoolOnly, blockUntilSchema, bootstrapDataLayer } from './db.js';
import { createApp } from './app.js';

// Bind HTTP before schema + seeding so PaaS (e.g. Render) port probes see PORT open quickly.
const db = openDatabasePoolOnly();
const app = createApp(db);

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
  try {
    blockUntilSchema(db);
    bootstrapDataLayer(db);
  } catch (err) {
    console.error('[zarewa] Schema or data bootstrap failed:', err);
    process.exit(1);
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

if (listenHost) {
  app.listen(port, listenHost, onListen);
} else {
  app.listen(port, onListen);
}
