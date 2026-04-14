import { openSchemaOnlyDatabase, resetDatabaseDataForTests } from './db.js';
import { createApp } from './app.js';

const db = openSchemaOnlyDatabase();
resetDatabaseDataForTests(db);
const app = createApp(db);
const port = Number(process.env.PORT || 8787);

app.listen(port, () => {
  console.log(`Zarewa Playwright API listening on http://127.0.0.1:${port} (postgres, DATABASE_URL set)`);
});
