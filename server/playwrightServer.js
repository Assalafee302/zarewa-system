import fs from 'node:fs';
import { createDatabase, defaultDbPath } from './db.js';
import { createApp } from './app.js';

const dbPath = process.env.ZAREWA_DB || defaultDbPath();

if (dbPath !== ':memory:') {
  try {
    fs.rmSync(dbPath, { force: true });
  } catch {
    // Ignore stale or missing test DB cleanup failures.
  }
}

const db = createDatabase(dbPath);
const app = createApp(db);
const port = Number(process.env.PORT || 8787);

app.listen(port, () => {
  console.log(`Zarewa Playwright API listening on http://127.0.0.1:${port} (db: ${dbPath})`);
});
