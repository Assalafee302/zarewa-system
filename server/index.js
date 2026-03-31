import { createDatabase, defaultDbPath } from './db.js';
import { createApp } from './app.js';

const dbPath = process.env.ZAREWA_DB || defaultDbPath();
const db = createDatabase(dbPath);
const app = createApp(db);

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`Zarewa API listening on http://localhost:${port} (db: ${dbPath})`);
});
