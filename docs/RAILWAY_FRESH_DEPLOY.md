# Railway: fresh deploy from zero (Zarewa + Supabase)

Follow these steps **in order**. This path uses **Supabase** for Postgres and **one Railway service** for the API + built SPA (same origin). You do **not** add Railway’s Postgres plugin.

---

## Part A — Supabase (do this first)

1. **Open** [Supabase](https://supabase.com) → your project (or create one).
2. Go to **Project Settings → Database**.
3. Under **Connection string**, choose **URI** and the **Transaction pooler** (port **6543**). Copy the string; it should look like  
   `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-....pooler.supabase.com:6543/postgres`
4. If you change the database password, update the URI. **URL-encode** characters that break URLs in the password segment (`@` → `%40`, `#` → `%23`, `/` → `%2F`, etc.).
5. Keep this URI somewhere safe; you will paste it into Railway as `DATABASE_URL` and use the **same** URI when running migrations locally.

---

## Part B — Railway project

6. **Log in** to [Railway](https://railway.app) and open your **team** or personal workspace.
7. **New project** → **Deploy from GitHub repo** → select **`zarewa-system`** (or fork). Authorize Railway if prompted.
8. Railway will create a **service** from the repo. The repo’s **`railway.toml`** forces the **Dockerfile** build (not Railpack). Wait for the first build to finish or fail; if it fails, open **Deployments → Build logs** and fix errors before continuing.

---

## Part C — Remove extra Postgres (important)

9. In the project canvas, look for a separate **Postgres** or **Database** service (elephant icon) **besides** your GitHub app service.
10. If you are using **only Supabase** for data: click that Postgres service → **Settings** (gear) → **Delete service** / remove resource.  
    This avoids the crash loop: *“Database is uninitialized and superuser password is not specified.”*  
    If you **intend** to use Railway Postgres instead of Supabase, stop here and use **only** that database: set `POSTGRES_PASSWORD` **on the Postgres service**, then point Zarewa at it (see [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md)); do not mix both unless you know which `DATABASE_URL` wins.

---

## Part D — Environment variables (Zarewa service only)

11. Click the **GitHub / web** service (the one that builds your Dockerfile), **not** a removed Postgres service.
12. Open **Variables**.
13. **Add** (or edit) these. Use **Raw editor** or one variable per line; do not paste secrets into public chats.

| Name | Value |
|------|--------|
| `DATABASE_URL` | Full Supabase transaction pooler URI (step 3–4), password URL-encoded inside the URI. |
| `NODE_ENV` | `production` |
| `ZAREWA_LISTEN_HOST` | `0.0.0.0` |
| `COOKIE_SECURE` | `1` |

14. **Optional:** `PORT` — Railway often injects `PORT` automatically. If your service has no `PORT`, set `8787` to match the image `EXPOSE`, or use whatever Railway assigns and do not override.
15. **Remove** from this service any unused vars that confuse setup: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `POSTGRES_*`, `PGDATA` — not needed when `DATABASE_URL` is set for Zarewa.
16. **Save**. Railway will **redeploy** the service.

---

## Part E — Database schema (migrations)

17. On your **PC** (with Node 20+ and this repo cloned), set the **same** `DATABASE_URL` as in Railway (PowerShell example):

    ```powershell
    cd c:\Project\Zarewa-System
    $env:DATABASE_URL = 'postgresql://...your full URI...'
    npm run db:migrate
    ```

    You should see `[pg-migrate] OK`. If you see password or SSL errors, fix the URI in Supabase and in Railway, then retry.

---

## Part E.2 — Supabase CLI (optional, recommended for schema in git)

The repo includes [`supabase/`](../supabase/) (migrations + `config.toml`). This mirrors the same baseline DDL as `npm run db:migrate` and is the path toward **`supabase db push`** in CI.

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started).
2. From the repo root: `supabase login`, then `supabase link --project-ref <your-project-ref>`.
3. If the CLI warns about Postgres version, set **`[db].major_version`** in `supabase/config.toml` to match **Supabase → Project Settings → Database** (then link again if needed).
4. Apply hosted schema: **`supabase db push`** (or paste the migration file in the SQL Editor once).
5. When you change Zarewa tables, regenerate the baseline file: **`npm run db:export-supabase-baseline`**, commit the new `supabase/migrations/*_zarewa_baseline.sql`, then `db push` again.

Until CI uses only Supabase migrations, keep running **`npm run db:migrate`** with the same `DATABASE_URL` before deploy so Railway’s first boot stays fast. Details: [`supabase/README.md`](../supabase/README.md).

---

## Part F — Verify the live app

18. In Railway, open the web service → **Settings → Networking** (or the generated **public URL**). Open `https://<your-domain>/health` — plain text **`ok`**.
19. Open `https://<your-domain>/api/bootstrap-status` — JSON with **`phase`**: `starting` → wait; **`ready`** → you can sign in; **`failed`** → read `hint` and deploy logs (`[zarewa-bootstrap]`). You can also use `GET /api/health` and inspect **`bootstrap.ready`** / **`bootstrap.failed`**.
20. Open the **site root** `https://<your-domain>/` — the SPA should load (same container serves `dist/`).
21. **Sign in** only when **`/api/bootstrap-status`** shows **`phase":"ready"`** (or `bootstrap.ready` is true on `/api/health`). Use **`admin`** / **`Admin@123`** on an empty database (change the password after first login).

    **If you stay stuck on “starting” or sign-in never succeeds:**

    1. **Pre-migrate** (strongly recommended): from your PC, `npm run db:migrate` with the **same** `DATABASE_URL` as Railway, then redeploy. That skips most slow DDL on first container boot.
    2. **Faster seed (optional):** on the web service add **`ZAREWA_EMPTY_SEED=1`** before the first successful boot if you want **no** demo customers/POs (UAT-style empty client). Remove later if you want full demo data.
    3. **Logs:** in the **Zarewa** service deploy logs, confirm **`[zarewa-bootstrap] … finished OK`**. If you see **`Postgres is not configured`**, `DATABASE_URL` is missing on **that** service. If login returns **401** after `phase` is **ready**, try **`ZAREWA_ALLOW_SEEDED_USERS=1`** once (see [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md)), or set **`ZAREWA_DIAGNOSTIC_LOGIN=1`** briefly to get more detail on **500** errors.

### Sign-in spinner lasts many minutes, then fails

That almost always means the browser is waiting on **`STARTING`** while the container runs **schema + seed** (`[zarewa-bootstrap]` in deploy logs). Until **`/api/bootstrap-status`** shows **`phase":"ready"`**, login is intentionally delayed.

1. **Confirm state:** open `https://<your-railway-host>/api/bootstrap-status` in another tab. If **`phase":"starting"`**, the server is still working (or stuck). If **`failed`**, read **`hint`** and the deploy log lines around **`[zarewa-bootstrap] FAILED`**.
2. **Speed up first boot (most important):** on your PC, run migrations **before** relying on in-container bootstrap. Use the **direct** Postgres URI from Supabase (**Project Settings → Database → Connection string → URI**, host like `db.<project-ref>.supabase.co`, port **5432**), not the pooler, for this step only — large DDL over the **transaction pooler (6543)** is often very slow or unreliable. Then:
   ```powershell
   $env:DATABASE_URL = 'postgresql://postgres:...@db.<project-ref>.supabase.co:5432/postgres'
   npm run db:migrate
   ```
   After `[pg-migrate] OK`, redeploy Railway (pooler `6543` URL on the service is still fine for normal app traffic once the schema exists).
3. **Less demo data on first boot:** set **`ZAREWA_EMPTY_SEED=1`** on the Railway service for the first successful boot if you do not need the full demo pack (then remove it if you want demo data later). See [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md).
4. **After `phase` is `ready`:** use **`admin`** / **`Admin@123`** on an empty database, or your real credentials. If you only get **401**, see **`ZAREWA_ALLOW_SEEDED_USERS`** in [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md).

5. **Still `starting` after `npm run db:migrate` on your PC?** Migrate only applies **schema** (`[pg-migrate] OK`). Railway’s child process still runs **all demo seeds** plus legacy demo unless you opt out — that can take **many minutes** over Supabase, especially on the **transaction pooler**. In logs, if you already see **`schema OK; bootstrapDataLayer`**, it is working on data, not DDL. Mitigations:
   - Set **`ZAREWA_EMPTY_SEED=1`** on the Railway service and **redeploy** (minimal seed; much faster).
   - Optionally lower pool size so the bootstrap child does not open many DB connections: **`PGPOOL_MAX=2`** (same for the main process; fine for single-user smoke tests).
   - Confirm PC migrate and Railway use the **same** Supabase project: in the SQL editor run `SELECT id FROM zarewa_migrations LIMIT 3;` — if empty on the project Railway uses, you migrated a different connection string than `DATABASE_URL` on Railway.

---

## Part G — After it works

22. **Rotate** any passwords that were ever pasted into tickets or chat.
23. Optional regression pass: [SMOKE_CHECKLIST.md](./SMOKE_CHECKLIST.md).
24. Optional: attach a **custom domain** in Railway **Networking**.
25. Read [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md) for `CORS_ORIGIN`, `ZAREWA_ALLOW_SEEDED_USERS`, and troubleshooting.

---

## Quick reference

| What | Where |
|------|--------|
| Build | Root `Dockerfile` + `railway.toml` |
| Start command | `node server/index.js` (from `railway.toml`) |
| Health check path | `/health` |
| App listens | `0.0.0.0` + `PORT` from Railway |
| Database | Supabase URI in `DATABASE_URL` only |

If anything fails, collect **build logs** (Docker), **deploy logs** (Node), and **the exact error** from `npm run db:migrate` — all against the same `DATABASE_URL`.
