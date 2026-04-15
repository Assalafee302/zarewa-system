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

## Part F — Verify the live app

18. In Railway, open the web service → **Settings → Networking** (or the generated **public URL**). Open `https://<your-domain>/health` — plain text **`ok`**.
19. Open `https://<your-domain>/api/health` — JSON with `ok: true`. After bootstrap, `bootstrap.ready` should be `true` (on builds that include that field).
20. Open the **site root** `https://<your-domain>/` — the SPA should load (same container serves `dist/`).
21. **Sign in:** default empty DB creates **`admin`** / **`Admin@123`** (change password after first login). The first boot can take **several minutes** (schema + seed over the network). The UI waits up to **10 minutes** for startup. While waiting, open **API deploy logs** and look for `[zarewa-bootstrap]` lines: you should see `schema OK` then `finished OK`. If you see `FAILED`, fix `DATABASE_URL` or run `npm run db:migrate` and redeploy. Also open `GET /api/health` and check `bootstrap.ready` / `bootstrap.failed`.

---

## Part G — After it works

22. **Rotate** any passwords that were ever pasted into tickets or chat.
23. Optional: attach a **custom domain** in Railway **Networking**.
24. Read [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md) for `CORS_ORIGIN`, `ZAREWA_ALLOW_SEEDED_USERS`, and troubleshooting.

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
