/**
 * Local dev: Zarewa API (default :8787) + Vite (:5173) in one process.
 * Stops both on Ctrl+C or if either child exits.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiEntry = path.join(root, 'server', 'index.js');
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const children = [];

function spawnChild(args, label) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    // Ignore stdin so the API does not exit when the parent/CI closes the stdin pipe (common on Windows).
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env },
  });
  child.on('error', (err) => console.error(`[${label}]`, err));
  children.push({ child, label });
  return child;
}

const api = spawnChild([apiEntry], 'api');
const vite = spawnChild([viteEntry], 'vite');

function shutdown(code = 0) {
  for (const { child, label } of children) {
    if (child.exitCode == null && child.signalCode == null) {
      try {
        child.kill('SIGTERM');
      } catch (e) {
        console.error(`[${label}] kill`, e);
      }
    }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

function onChildExit(which, code, signal) {
  const reason = signal ? `signal ${signal}` : `code ${code}`;
  console.error(`[${which}] exited (${reason}); stopping dev stack.`);
  shutdown(code === 0 || code === null ? 0 : 1);
}

api.on('exit', (code, signal) => onChildExit('api', code, signal));
vite.on('exit', (code, signal) => onChildExit('vite', code, signal));

process.on('SIGINT', () => {
  console.error('\nStopping API + Vite…');
  shutdown(0);
});
process.on('SIGTERM', () => shutdown(0));
