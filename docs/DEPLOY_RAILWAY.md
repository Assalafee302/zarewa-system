# Deploy on Railway (API + optional SPA in one service)

Zarewa is a **Node** API (`server/index.js`) plus a **Vite** frontend. Railway can run **one web service** that:

- Serves **`/api/*`** from Express
- Serves the **built SPA** from `dist/` when `dist/index.html` exists (same origin — good for cookies and CSRF)

The repo ships a root **`Dockerfile`** (and **`railway.toml` uses `builder = DOCKERFILE`**) so Railway does not use Railpack’s `node_modules` cache, which can leave **`node_modules/.vite` busy** (`EBUSY` / “device busy”) during `npm ci` or `rm`. The image runs **`npm ci --omit=dev`**, **`VITE_CACHE_DIR=/tmp/vite-cache`**, then **`npm run build`**, and starts with **`node server/index.js`** with **`ZAREWA_LISTEN_HOST=0.0.0.0`** so platform health probes (IPv4) reach the process. **`.dockerignore`** keeps `node_modules` out of the build context.

## Checklist

1. **Create a Railway project** and connect this GitHub repo.
2. **Add a Postgres database** (Railway Postgres plugin) **or** use **Supabase** (set `DATABASE_URL` from Supabase).
3. **Set variables** on the web service (minimum):

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Postgres connection string (required). |
| `NODE_ENV` | `production` |
| `ZAREWA_LISTEN_HOST` | `0.0.0.0` (also set in the Dockerfile; required so probes are not IPv6-only.) |
| `COOKIE_SECURE` | `1` when users only use HTTPS |
| `PORT` | **Railway sets this automatically** — do not hardcode in Railway. |

4. **Optional:** `CORS_ORIGIN` — only needed if the browser calls a **different** API origin. For a **single Railway URL** (SPA + API same host), you usually omit it or set to your Railway public URL.

5. **Schema:** After first deploy, run migrations from your machine (or use Railway **Pre-deploy** / one-off command):

   ```bash
   DATABASE_URL="..." npm run db:migrate
   ```

6. **Health check:** Configured as `GET /api/health` in `railway.toml`.

## If you still use Vercel for the frontend

Point Vercel’s rewrite `destination` at your **Railway public URL** instead of Render, e.g.:

`https://<your-railway-service>.up.railway.app/api/:path*`

…or drop Vercel and use only Railway’s URL for the SPA + API.

## Related

- [DEPLOY_SUPABASE_VERCEL.md](./DEPLOY_SUPABASE_VERCEL.md) — original Supabase + Render + Vercel layout
- [ENVIRONMENT.md](./ENVIRONMENT.md) — all env vars
