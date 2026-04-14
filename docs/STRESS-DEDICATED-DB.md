# Dedicated PostgreSQL database for stress / heavy scripts

Use a **separate Postgres database** (or separate Supabase project) so your normal dev database is never truncated.

## Recommended layout

- **Normal dev:** `DATABASE_URL` → e.g. `postgresql://…/zarewa_dev`
- **Stress / mega scripts:** `DATABASE_URL` → e.g. `postgresql://…/zarewa_stress` (create empty DB once; run `npm run db:migrate` against it)
- **Playwright E2E:** another dedicated DB URI in `DATABASE_URL` when running `npm run test:e2e` (CI uses `zarewa_ci`)

## Wipe and re-seed the stress database

1. Stop any Node process using that `DATABASE_URL`.
2. From the repo root (PowerShell), point at the stress database and truncate + seed:

```powershell
$env:DATABASE_URL = 'postgresql://USER:PASS@HOST:5432/zarewa_stress'
npm run db:wipe
```

`db:wipe` runs `scripts/wipe-playwright-e2e.mjs`: it truncates application tables and re-applies the same bootstrap as API startup.

3. Start the API with the same `DATABASE_URL` if a script expects a live server:

```powershell
$env:DATABASE_URL = 'postgresql://USER:PASS@HOST:5432/zarewa_stress'
npm run server
```

## Run the 50-scenario lifecycle stress script

With the API listening (default port `8787`):

```powershell
$env:STRESS_API_URL = 'http://127.0.0.1:8787'
npm run stress:lifecycle
```

Optional:

- **Slice:** `$env:STRESS_FROM='0'; $env:STRESS_TO='9'` — first 10 scenarios only.
- **Stable keys:** `$env:STRESS_RUN_KEY='MYRUN1'`
- **Skip bootstrap hammer:** `$env:STRESS_SKIP_PHASE2='1'`
- **Multi-user refund smoke** (sales.staff → sales.manager): enabled by default; disable with `$env:STRESS_MULTIUSER_REFUND='0'`

## Reports

After a run, see:

- `scripts/output/fifty-lifecycle-report.json`
- `scripts/output/fifty-lifecycle-report.csv`

## Safety

Never point stress tooling at **production** `DATABASE_URL`. Use a disposable database name and restricted credentials.
