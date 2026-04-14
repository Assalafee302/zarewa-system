/**
 * Runs Postgres schema + seed in a subprocess so the API main process can
 * accept HTTP (e.g. Render health checks) while this work runs.
 */
import 'dotenv/config';
import { openDatabasePoolOnly, blockUntilSchema, bootstrapDataLayer } from '../server/db.js';

const db = openDatabasePoolOnly();
try {
  blockUntilSchema(db);
  bootstrapDataLayer(db);
} finally {
  db.close();
}
