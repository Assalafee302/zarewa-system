# Environment variables (Zarewa API)

Use these when deploying or running automated tests. There is no committed `.env` in the repo; set values in your host environment or your deployment platform.

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | Set to `production` in live environments. Affects cookie `Secure` flag (see below) and CORS defaults in `server/app.js`. |
| `COOKIE_SECURE` | If `1` or `true`, session and CSRF cookies use the `Secure` attribute. If unset, `Secure` is enabled when `NODE_ENV=production`. Set **`0` or `false`** to force **no** `Secure` flag (e.g. HTTP trial by IP); use HTTPS and `1` for real deployments. |
| `ZAREWA_DB` | Path to the SQLite database file (or `:memory:` for tests). Playwright uses `data/playwright.sqlite` via `server/playwrightServer.js`. |
| `PORT` | HTTP listen port (default from `server/index.js` / Playwright server). |
| `CORS_ORIGIN` | Comma-separated allowed origins for the SPA. Do not use `*` in production (`server/app.js`). |
| `ZAREWA_TEST_ENFORCE_CSRF` | When `1`, API tests enforce CSRF on mutating routes (optional stricter CI). |
| `ZAREWA_EMPTY_SEED` | When `1` or `true`, a **new** database gets schema, migrations, default users, master templates, one zero-balance treasury account, and HR profile stubs — **no** demo customers, quotations, receipts, procurement, or legacy demo pack. Use after `npm run db:wipe` (or `db:wipe-empty-client`) for client UAT. |
| `ZAREWA_STATIC_DIR` | Optional absolute path to the Vite `dist` folder. Defaults to `dist` under the current working directory. If `index.html` exists there, the API process also serves the SPA and client routes (same origin as `/api`). |

Demo users and passwords are seeded for development and automated tests. **Before production:** change every seeded password (or replace users entirely), restrict who can create users, and run `npm run verify:complete` (or your CI equivalent) before cutover. See `docs/ACCESS_CONTROL.md`, `docs/DEPLOYMENT.md`, and the staff-facing summary `docs/STAFF_APPROVALS.md`.
