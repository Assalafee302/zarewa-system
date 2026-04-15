# Supabase (Zarewa)

This folder is the **Supabase CLI project** for Zarewa: versioned SQL under `migrations/`, plus local-dev defaults in `config.toml`.

## What runs where

| Layer | Role |
|--------|------|
| **Supabase Postgres** | System of record for tables (hosted project). |
| **Railway** (`node server/index.js`) | Express API + static SPA; connects with **`DATABASE_URL`** (transaction pooler, port **6543**). |
| **`npm run db:migrate`** | Applies the same baseline as `migrations/*_zarewa_baseline.sql` via [`server/pg/pgMigrate.js`](../server/pg/pgMigrate.js). Use until CI uses **`supabase db push`** only. |

Do **not** add Railway’s Postgres plugin if you use Supabase only — see [docs/RAILWAY_FRESH_DEPLOY.md](../docs/RAILWAY_FRESH_DEPLOY.md).

## One-time: link this repo to your Supabase project

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started).
2. From the repo root: `supabase login` then `supabase link --project-ref <your-project-ref>`.
3. If `supabase link` complains about Postgres version, set **`[db].major_version`** in `config.toml` to match the dashboard (**Project Settings → Database**), then retry.

## Apply migrations to the hosted project

```bash
# After link
supabase db push
```

Or run the SQL in the Supabase **SQL Editor** (single file for baseline).

## Regenerate the baseline migration file

When [`server/schemaSql.js`](../server/schemaSql.js) or extractions in [`server/pg/pgMigrate.js`](../server/pg/pgMigrate.js) change:

```bash
node scripts/export-supabase-baseline.mjs
```

Optional: `ZAREWA_BASELINE_STAMP=20260415180000` to pick the migration filename timestamp.

## Prove DB ↔ API ↔ UI (create + edit)

With `DATABASE_URL` pointed at the same database the API uses (local Postgres, Supabase pooler, or Railway’s secret), run:

`npm run db:migrate` (first time on that database) then **`npm run test:e2e:db-api-ui-link`**.

See [`docs/SMOKE_CHECKLIST.md`](../docs/SMOKE_CHECKLIST.md).

## Advisors (security / performance)

After `db push`, run **`supabase db advisors`** (CLI v2.81.3+) if available, or use **Supabase Dashboard → Advisors**, and fix issues (especially RLS if you later expose the Data API).

## Local stack (`supabase start`)

Optional for experimenting with local Postgres + Studio. Zarewa’s app still expects **`DATABASE_URL`** pointing at that local URL when you run `npm run server` against it.
