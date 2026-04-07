# Zarewa System

Internal operations app: sales, production, HR, treasury, and role-based access. The UI is **React + Vite**; the API and persistence live under `server/` (SQLite via better-sqlite3).

## Quick start

```bash
npm ci
npm run dev          # Vite (frontend)
# In another terminal:
npm run server       # API on the port in your env (see docs)
```

Apply schema changes when pulling updates:

```bash
npm run db:migrate
```

## Documentation

- [Access control & APIs](docs/ACCESS_CONTROL.md) — permissions, approvals, sensitive routes  
- [Environment variables](docs/ENVIRONMENT.md) — ports, DB path, cookies, Playwright  
- [Staff approvals (who does what)](docs/STAFF_APPROVALS.md)  
- [Customer refunds — operations & UAT](docs/REFUND_OPERATIONS.md)  
- [Production / cutover checklist](docs/DEPLOYMENT.md)

## Quality gates

| Command | Purpose |
|--------|---------|
| `npm run lint` | ESLint |
| `npm run test` | Vitest (full server + shared suite) |
| `npm run test:e2e` | Playwright (`e2e/`) |
| `npm run test:all` | Vitest then Playwright (no production build) |
| `npm run verify:complete` | **Release gate:** production build + Vitest + all E2E (same as CI) |

CI (GitHub Actions on `main` / `master` and PRs) runs `node scripts/verify-complete.mjs` after lint and Playwright browser install.

## Stack notes

- Vite React frontend; routing in `src/App.jsx`  
- REST-style handlers in `server/httpApi.js` with auth in `server/auth.js`  
- Migrations in `server/migrate.js` (invoked by `db:migrate`)
