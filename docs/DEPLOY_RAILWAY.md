# Deploy on Railway (API + optional SPA in one service)

**Starting from scratch?** Use the step-by-step guide: [RAILWAY_FRESH_DEPLOY.md](./RAILWAY_FRESH_DEPLOY.md).

Zarewa is a **Node** API (`server/index.js`) plus a **Vite** frontend. Railway can run **one web service** that:

- Serves **`/api/*`** from Express
- Serves the **built SPA** from `dist/` when `dist/index.html` exists (same origin — good for cookies and CSRF)

The repo ships a root **`Dockerfile`** (and **`railway.toml` uses `builder = DOCKERFILE`**) so Railway does not use Railpack’s `node_modules` cache, which can leave **`node_modules/.vite` busy** (`EBUSY` / “device busy”) during `npm ci` or `rm`. The image runs **`npm ci --omit=dev`**, **`VITE_CACHE_DIR=/tmp/vite-cache`**, then **`npm run build`**, and starts with **`node server/index.js`** with **`ZAREWA_LISTEN_HOST=0.0.0.0`** so platform health probes (IPv4) reach the process. **`.dockerignore`** keeps `node_modules` out of the build context.

## Checklist

1. **Create a Railway project** and connect this GitHub repo.
2. **Database:** use **either** Railway’s Postgres plugin **or** **Supabase** (recommended: one system of record). If the app uses **only** Supabase, you do **not** need a Railway Postgres service; remove it if it is crash-looping on an empty `POSTGRES_PASSWORD`.
3. **Set variables** on the **web** service (minimum):

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Postgres connection string (required). With Supabase, use the **transaction pooler** URI from the dashboard (port **6543**; user `postgres.<project-ref>`). **URL-encode** special characters in the password (`@` → `%40`, etc.). |
| `NODE_ENV` | `production` |
| `ZAREWA_LISTEN_HOST` | `0.0.0.0` (also set in the Dockerfile; required so probes are not IPv6-only.) |
| `COOKIE_SECURE` | `1` when users only use HTTPS |
| `PORT` | Railway usually **injects** this; set only if your service has no `PORT` (e.g. match **8787** locally). |
| `ZAREWA_ALLOW_SEEDED_USERS` | Set to `1` **only** if you need to re-apply dev passwords from `server/auth.js` when `app_users` is **not** empty (then remove after changing passwords). |

When `DATABASE_URL` is set, **do not** set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, or `PGDATABASE` on the web service for Zarewa (they are ignored and confuse operators). Do not set `POSTGRES_*` on the Node service unless you are configuring a **separate** Postgres container.

### Example: Supabase-only (paste into Railway web service)

```env
DATABASE_URL=postgresql://postgres.atffelbliqaarmalgvjw:<URL_ENCODED_DB_PASSWORD>@aws-1-eu-north-1.pooler.supabase.com:6543/postgres
NODE_ENV=production
PORT=8787
ZAREWA_LISTEN_HOST=0.0.0.0
COOKIE_SECURE=1
```

Replace `<URL_ENCODED_DB_PASSWORD>` with your Supabase **database** password (encoded for URLs). If Railway already provides `PORT`, you may omit the `PORT` line or align it with the value Railway assigns.

4. **First sign-in:** If `app_users` is **empty**, startup creates **`admin`** with password **`Admin@123`**. If login still fails, the DB already had users with different credentials — use **`ZAREWA_ALLOW_SEEDED_USERS=1`** once (redeploy), sign in, change passwords, then **unset** it.

5. **Optional:** `CORS_ORIGIN` — only needed if the browser calls a **different** API origin. For a **single Railway URL** (SPA + API same host), you usually omit it or set to your Railway public URL.

6. **Schema:** After first deploy, run migrations from your machine (or use Railway **Pre-deploy** / one-off command):

   ```bash
   DATABASE_URL="..." npm run db:migrate
   ```

   Optional: keep [`supabase/migrations/`](../supabase/migrations) in sync with [`npm run db:export-supabase-baseline`](../package.json) and apply with **`supabase db push`** after `supabase link` — see [`supabase/README.md`](../supabase/README.md).

7. **Health check:** Configured as `GET /health` in `railway.toml` (plain `ok` text, registered before CORS/auth/STARTING gate). `GET /api/health` remains for JSON diagnostics.

## If you still use Vercel for the frontend

Point Vercel’s rewrite `destination` at your **Railway public URL** instead of Render, e.g.:

`https://<your-railway-service>.up.railway.app/api/:path*`

…or drop Vercel and use only Railway’s URL for the SPA + API.

## Troubleshooting

### `Database is uninitialized and superuser password is not specified`

Those messages come from the **Railway Postgres** Docker image (logs on the **Postgres** service), **not** from the Zarewa Node app. On first boot the data volume is empty; the image **requires** a non-empty `POSTGRES_PASSWORD` **on that Postgres service**.

**If Zarewa uses only Supabase** (`DATABASE_URL` points at Supabase): you do not need Railway Postgres. In the Railway project, select the **Postgres** plugin service → **Settings → Remove service** (or delete the database resource). The crash loop stops immediately.

**If you want Railway Postgres running:** open the **Postgres** service (not the web/API service) → **Variables**. Set **`POSTGRES_PASSWORD`** to a **literal** long random string (20+ characters). Save and redeploy. Do not leave it blank, and avoid references that resolve empty (e.g. a variable that does not exist on **that** service). Optionally set `POSTGRES_USER` and `POSTGRES_DB`; defaults are fine for many setups.

Variables on your **web** service do **not** fix this error: the Postgres container only reads env vars **injected into the Postgres deployment**.

## Related

- [DEPLOY_SUPABASE_VERCEL.md](./DEPLOY_SUPABASE_VERCEL.md) — original Supabase + Render + Vercel layout
- [ENVIRONMENT.md](./ENVIRONMENT.md) — all env vars
