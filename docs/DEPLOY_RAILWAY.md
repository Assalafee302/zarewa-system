# Deploy on Railway (API + optional SPA in one service)

Zarewa is a **Node** API (`server/index.js`) plus a **Vite** frontend. Railway can run **one web service** that:

- Serves **`/api/*`** from Express
- Serves the **built SPA** from `dist/` when `dist/index.html` exists (same origin — good for cookies and CSRF)

The build in `railway.toml` runs a **clean** `npm ci` (removes `node_modules` first) and sets `VITE_CACHE_DIR=/tmp/vite-cache` so Docker/Railway does not hit **`EBUSY` removing `node_modules/.vite`**. Then `npm run build` produces `dist/` before `npm run start`.

## Checklist

1. **Create a Railway project** and connect this GitHub repo.
2. **Add a Postgres database** (Railway Postgres plugin) **or** use **Supabase** (set `DATABASE_URL` from Supabase).
3. **Set variables** on the web service (minimum):

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Postgres connection string (required). |
| `NODE_ENV` | `production` |
| `ZAREWA_LISTEN_HOST` | `0.0.0.0` |
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
