# Deploy: Supabase Postgres + Vercel (same-origin)

This repo currently runs the API on Node/Express and the frontend as a Vite SPA.
The frontend uses **cookie sessions** (`SameSite=Strict`) and **CSRF** cookies, so production must keep `/api/*` calls on the **same origin** as the SPA.

## 1) Create Supabase project
- Create a Supabase project (prod).
- Copy the Postgres connection string as `DATABASE_URL` (server secret).

## 2) Create schema on Supabase
Run from your local machine:

```bash
set DATABASE_URL=postgres://...
npm run pg:migrate
```

This applies a Postgres-compatible baseline derived from `server/schemaSql.js` (with minimal compatibility transforms).

## 3) Import existing SQLite data
If you have an existing SQLite file (default `data/zarewa.sqlite`):

```bash
set DATABASE_URL=postgres://...
npm run pg:import:sqlite
```

## 4) Deploy API (Render)
- Create a Render **Web Service** from this repo.
- Use `render.yaml` as a starting point.
- Set env vars:
  - `DATABASE_URL` (Supabase)
  - `NODE_ENV=production`
  - `COOKIE_SECURE=1`
## 5) Deploy frontend (Vercel) with same-origin `/api`
- Deploy this repo as a Vercel project.
- Keep `VITE_API_BASE` **unset** (frontend will call `/api/...`).
- Ensure Vercel rewrites `/api/*` to your Render API.
  - This repo includes `vercel.json` defaulting to `https://zarewa-api.onrender.com`.
  - If your Render URL differs, update `vercel.json`.
## Notes
- The Postgres migration tools are in `scripts/pg-migrate.mjs` and `scripts/sqlite-to-postgres.mjs`.
- A full runtime switch of the API from SQLite to Postgres requires updating the API DB adapter (queries/transactions) to use Postgres at runtime. Keep SQLite for local development until that switchover is completed.

## Staging rehearsal + production cutover (recommended)

### Staging/UAT rehearsal
- First: set up a Supabase staging project and import data.
- Then: deploy the API to staging with `DATABASE_URL` set.
- Only after that: test and confirm all core workflows.

### Important: runtime Postgres mode
When `DATABASE_URL` is set, the API uses Postgres via a compatibility DB adapter that keeps the existing synchronous query style.\n+This is the fastest way to migrate without rewriting the entire backend, but it **blocks the Node event loop during DB calls**.\n+For ~15 users this can be acceptable in phase 1; later you should plan an async refactor for better concurrency.
- Create a separate Supabase project for staging.
- Run `npm run pg:migrate` against staging.
- Import a copy of your SQLite DB.
- Deploy a staging Render service pointed at staging `DATABASE_URL`.
- On Vercel, use a preview/development project (or branch deploy) that rewrites `/api/*` to the staging Render URL.
- Smoke test:
  - login
  - bootstrap/dashboard
  - create/update one record
  - refund/receipt flows

### Production cutover (short downtime)
- Schedule a short window.
- Stop writes (maintenance mode / stop the API temporarily).
- Take a final SQLite copy.
- Run `npm run pg:migrate` against production Supabase.
- Run `npm run pg:import:sqlite` against production Supabase.
- Start the API again.
- Verify core flows.

### Backups (minimum)
- Keep a dated SQLite backup file before cutover.
- Enable Supabase automated backups (if on a plan that supports it).
- Periodically export a SQL dump or use Supabase backup/export tooling.

