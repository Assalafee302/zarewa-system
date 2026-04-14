/**
 * Run timestamp-style LE-/CL- id rewrite (SQLite-era one-off). On PostgreSQL this is a no-op.
 */
import { createDatabase } from '../server/db.js';
import { migrateTimestampStyleDocumentIds } from '../server/migrateTimestampDocIds.js';

const db = createDatabase();
migrateTimestampStyleDocumentIds(db);
db.close();
console.log('Timestamp document id migration applied (no-op if nothing matched or if using Postgres).');
