# Environment variables (Zarewa API)

Use these when deploying or running automated tests. There is no committed `.env` in the repo; copy [`.env.example`](../.env.example) to `.env` locally or set values in your host / platform dashboard.

The application is **PostgreSQL-only**: **`DATABASE_URL` is required** for `npm run server`, `npm run start`, Vitest suites that open the DB, Playwright’s API server, and `npm run db:migrate`. Vitest loads `vitest.pg-env.js` first for the **node** project; if `DATABASE_URL` is unset, tests fail immediately with a short message (set it in `.env` or the shell before `npm run test`).

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | **Required.** Postgres connection URI (e.g. Supabase pooler). Used by `server/db.js` and migration scripts. |
| `NODE_ENV` | Set to `production` in live environments. Affects cookie `Secure` flag (see below) and CORS defaults in `server/app.js`. |
| `COOKIE_SECURE` | If `1` or `true`, session and CSRF cookies use the `Secure` attribute. If unset, `Secure` is enabled when `NODE_ENV=production`. Set **`0` or `false`** to force **no** `Secure` flag (e.g. HTTP trial by IP); use HTTPS and `1` for real deployments. |
| `ZAREWA_LISTEN_HOST` | Optional host to bind (e.g. `0.0.0.0` on Render). If unset, Node listens on all interfaces in some setups; set explicitly on PaaS. |
| `E2E_UI_PORT` | Optional. Vite port for Playwright (default **5180**). Set when **5180 is already in use** (e.g. a leftover `e2e-web` process) so `npm run test:e2e` can start: `E2E_UI_PORT=5182 E2E_API_PORT=8789 npm run test:e2e`. |
| `E2E_API_PORT` | Optional. API port paired with `E2E_UI_PORT` (default **8788**). |
| `E2E_REUSE_SERVER` | When `1`, Playwright does not spawn `scripts/e2e-web.mjs` and expects a stack already listening on the configured ports — use only when you intentionally reuse a running dev server. |
| `PORT` | HTTP listen port (default from `server/index.js` / Playwright server). |
| `CORS_ORIGIN` | Comma-separated allowed origins for the SPA. Do not use `*` in production (`server/app.js`). On **Render**, include your **Vercel** origins if you hit the API directly from the browser (previews, debugging). |
| `ZAREWA_TEST_ENFORCE_CSRF` | When `1`, API tests enforce CSRF on mutating routes (optional stricter CI). |
| `ZAREWA_EMPTY_SEED` | When `1` or `true`, a **new** database gets schema, migrations, default users, master templates, one zero-balance treasury account, and HR profile stubs — **no** demo customers, quotations, receipts, procurement, or legacy demo pack. Use after `npm run db:wipe` (or `db:wipe-empty-client`) for client UAT. |
| `ZAREWA_STATIC_DIR` | Optional absolute path to the Vite `dist` folder. Defaults to `dist` under the current working directory. If `index.html` exists there, the API process also serves the SPA and client routes (same origin as `/api`). |
| `ZAREWA_AI_API_KEY` | Optional. API key for the in-app AI assistant (OpenAI-compatible chat). If unset, `OPENAI_API_KEY` is used. When neither is set, assistant UI stays hidden and `/api/ai/chat` returns 503. |
| `OPENAI_API_KEY` | Fallback API key when `ZAREWA_AI_API_KEY` is not set. |
| `ZAREWA_AI_BASE_URL` | Optional. Provider base URL, default `https://api.openai.com/v1`. Use your vendor’s root if it follows the same `/v1/chat/completions` layout. |
| `ZAREWA_AI_MODEL` | Optional. Chat model id. If unset: default is `gpt-4o-mini` for OpenAI-style bases, or `llama3.2` when `ZAREWA_AI_BASE_URL` uses Ollama’s default port **11434** (`server/aiAssist.js`). |
| `ZAREWA_CSP` | Optional. Overrides the `Content-Security-Policy` header for all HTTP responses (default policy is set in `server/app.js`). |
| `ZAREWA_LEDGER_POST_MAX` | Optional. Max authenticated **ledger money POSTs** (receipt, advance, apply-advance, refund-advance) per user per rolling window. Default `45`; clamped 1–50000. |
| `ZAREWA_LEDGER_POST_WINDOW_MS` | Optional. Rolling window for the ledger POST limiter in milliseconds. Default `60000` (one minute); clamped 5000–3600000. |
| `ZAREWA_TEST_SKIP_RATE_LIMIT` | When `1`, authenticated rate limiters (including ledger POSTs) are disabled — **tests and scripted stress only**, never in production. |

**Reset E2E Postgres data only:** `npm run wipe:e2e-db` truncates application tables in the database pointed to by **`DATABASE_URL`** and re-seeds (intended for a **dedicated E2E database**, not production).

## HR and long-lived records

HR audit events, payroll runs, discipline cases, and branch history live in the same Postgres database as the rest of the app. For retention comparable to “life of the company”, rely on **managed backups** (Supabase / your provider) plus any **legal/export** process you require; consider cold storage exports if tables grow very large.

Demo users and passwords are seeded for development and automated tests. **Before production:** change every seeded password (or replace users entirely), restrict who can create users, and run `npm run verify:complete` (or your CI equivalent) before cutover. See `docs/ACCESS_CONTROL.md`, `docs/DEPLOYMENT.md`, and the staff-facing summary `docs/STAFF_APPROVALS.md`.
