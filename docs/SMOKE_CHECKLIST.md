# Staging smoke checklist (Supabase + Railway)

Run after changing **`DATABASE_URL`**, **`supabase db push`**, or a new Railway deploy. Use a **non-production** Supabase project when possible.

## Preconditions

- `GET /health` returns plain text **`ok`**.
- `GET /api/bootstrap-status` reaches **`phase":"ready"`** (or `GET /api/health` shows `bootstrap.ready`).
- You can sign in (e.g. fresh DB: `admin` / `Admin@123` — change password immediately).

## Domains (one happy path each)

| Area | Suggested check |
|------|------------------|
| **Session / workspace** | Sign in, open session/bootstrap; switch branch if multi-branch. |
| **Admin / RBAC** | As settings-capable user: open users list, view roles. |
| **Office** | Open Office desk / threads; post a short message or use read-only thread list. |
| **Procurement** | List suppliers; open or create a PO (or view existing from seed). |
| **Inventory** | Open inventory snapshot or product movements for a known SKU. |
| **Production** | Open cutting list or production job list for the workspace branch. |
| **Finance** | Open GL accounts or trial balance with `finance.view`; avoid posting in prod smoke. |
| **Sales / customer** | Open customer list or a quotation from seed data. |

## Automated regression (CI / local with Postgres)

With **`DATABASE_URL`** set to a disposable Postgres 16 database:

```bash
npm run lint
npm run test:critical-workflows
```

Full gate (build + Vitest + Playwright) matches CI:

```bash
node scripts/verify-complete.mjs
```

### DB ↔ API ↔ UI link (create + edit)

Playwright spec [`e2e/db-api-ui-data-link.spec.js`](../e2e/db-api-ui-data-link.spec.js) waits for bootstrap **ready**, signs in as **admin**, creates a customer via **POST `/api/customers`**, updates tier via **PATCH**, then checks the name appears under **Sales → Customers** (same flow against Supabase or any Postgres).

```powershell
$env:DATABASE_URL = 'postgresql://...'   # same URI shape as Railway → Supabase pooler
npm run db:migrate                       # first-time schema on that DB
npm run test:e2e:db-api-ui-link
```

## Related docs

- [RAILWAY_FRESH_DEPLOY.md](./RAILWAY_FRESH_DEPLOY.md) — env, duplicate Postgres removal, migrations.
- [supabase/README.md](../supabase/README.md) — CLI link, `db push`, baseline export.
