# Deploy: Supabase + Render + Vercel

The app is **PostgreSQL-only** (`DATABASE_URL` required). The UI is a **Vite SPA**; the API is **Express** on Node.

**Why three services:** the SPA benefits from **Vercel**; the API needs an **always-on Node** process (**Render**); the database is **Supabase Postgres**. The browser should call **`/api/*` on the same origin as the SPA** (Vercel rewrite → Render) so **cookie sessions** (`SameSite=Strict`) and **CSRF** behave correctly.

## Implementation checklist (order)

1. **Supabase** — Create a project, choose a region, note the **connection string** (prefer the **pooler** host/port Supabase documents for server apps).
2. **Schema** — From a trusted machine with Node 20+:
   - Set `DATABASE_URL` to the Supabase URI.
   - Run `npm ci` then `npm run db:migrate` (applies Postgres schema via `scripts/pg-migrate.mjs`).
3. **Data** — Load production data using your chosen path (`pg_restore`, SQL import, Supabase tooling, or a one-off migration). There is no committed SQLite→Postgres importer in this repo; plan this step explicitly.
4. **Render** — Create a **Web Service** from this Git repo (see `render.yaml`). Set **secrets** in the Render dashboard (at minimum `DATABASE_URL`). Confirm `ZAREWA_LISTEN_HOST=0.0.0.0` and `NODE_ENV=production`.
5. **Vercel** — Import the same repo. **Do not set** `VITE_API_BASE` in production so the UI uses relative `/api/...` URLs.
6. **Same-origin API** — In `vercel.json`, set the rewrite destination to your real Render service URL, e.g. `https://<your-service>.onrender.com/api/:path*`. Commit or manage via your deployment process so preview deployments can point at a **staging** API when needed.
7. **Smoke test** — Open the Vercel URL, log in, hit a mutating action, confirm `/api/health` and logs on Render.

## Environment variables (Render API)

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Supabase Postgres (pooler URI when applicable). |
| `NODE_ENV` | Yes | `production`. |
| `ZAREWA_LISTEN_HOST` | Yes on PaaS | `0.0.0.0` so Render can route traffic in. |
| `COOKIE_SECURE` | Recommended | `1` when users only use **HTTPS** (Vercel + TLS). |
| `CORS_ORIGIN` | Recommended | Comma-separated list of **Vercel** origins (`https://your-app.vercel.app`, custom domain, preview URLs if you test the API directly from the browser). Same-origin requests through the Vercel rewrite are usually fine; this helps previews and direct Render debugging. |
| `PORT` | Auto | Render sets `PORT`; do not override unless you know the platform. |

Copy from [`.env.example`](../.env.example) when running locally. Full variable list: [ENVIRONMENT.md](./ENVIRONMENT.md).

## Vercel `vercel.json`

This repo ships a default rewrite (adjust the host to match your Render service name):

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://zarewa-system.onrender.com/api/:path*"
    }
  ]
}
```

`vercel.json` cannot read Render URLs from environment variables; update the `destination` when your API URL changes.

## Runtime note (Postgres adapter)

With `DATABASE_URL` set, the API uses a **synchronous-style** adapter over `pg` (see `server/pg/pgSyncDb.js`). It minimizes rewrite surface during migration but **blocks the Node event loop during queries**. For a small team this is often acceptable; plan a gradual async refactor if concurrency grows.

## Staging then production

- Use a **separate** Supabase project (or separate DB) for staging; run `npm run db:migrate` and import test data; deploy a **staging** Render service; point a **Vercel preview** project’s rewrite at staging.
- For production cutover: take a **backup**, apply schema if needed, import or switch `DATABASE_URL`, redeploy API, verify, then switch traffic.

## Backups

- Enable **Supabase** backups / PITR for the tier you use.
- Keep an off-site export policy (e.g. periodic `pg_dump`) that matches your RPO/RTO.

## Related docs

- [ENVIRONMENT.md](./ENVIRONMENT.md) — all env vars.
- [DEPLOYMENT.md](./DEPLOYMENT.md) — general go-live checklist (VM path is optional; prefer this doc for Supabase + Render + Vercel).
