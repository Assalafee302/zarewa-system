/**
 * Single process for Playwright: API (8787) first, then Vite (5173).
 * Avoids proxy ECONNREFUSED when the UI server becomes "ready" before the API binds.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const env = {
  ...process.env,
  ZAREWA_DB: process.env.ZAREWA_DB || 'data/playwright.sqlite',
  PORT: process.env.PORT || '8787',
};

function waitHealth(url, maxMs) {
  const deadline = Date.now() + maxMs;
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timeout waiting for ${url}`));
          return;
        }
        setTimeout(ping, 250);
      });
    };
    ping();
  });
}

const api = spawn(process.execPath, ['server/playwrightServer.js'], {
  cwd: root,
  env,
  stdio: 'inherit',
});

await waitHealth('http://127.0.0.1:8787/api/health', 120_000);

const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5173'], {
  cwd: root,
  env: { ...env, NODE_ENV: 'development' },
  stdio: 'inherit',
});

function shutdown() {
  try {
    api.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  try {
    vite.kill('SIGTERM');
  } catch {
    /* ignore */
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

api.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  if (code && code !== 0) process.exit(code);
});

vite.on('exit', (code) => {
  shutdown();
  process.exit(code ?? 0);
});
