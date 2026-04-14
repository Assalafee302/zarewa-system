#!/usr/bin/env node
/**
 * Ensures the built-in `admin` user exists with the default dev password from server/auth.js.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/ensure-default-admin.mjs
 */

import { createDatabase } from '../server/db.js';
import { ensureDefaultAdminUser } from '../server/auth.js';

const db = createDatabase();
ensureDefaultAdminUser(db);
db.close();
console.log('Default admin ensured (Postgres).');
