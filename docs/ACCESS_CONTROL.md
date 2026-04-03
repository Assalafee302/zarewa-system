# Access control (Zarewa)

This document summarizes how roles, API routes, and the workspace bootstrap relate. For the canonical permission matrix, see `ROLE_DEFINITIONS` in `server/auth.js`.

## Roles

Each user has a `role_key` mapped to a label and a list of permission strings. `admin` has `*` (all permissions). Other roles combine granular strings such as `sales.view`, `finance.post`, `hr.directory.view`, etc.

Demo accounts ship with the dev database; change passwords before any production use. The read-only demo user is **`viewer`** / **`Viewer@123456!`** (role `viewer`: `dashboard.view`, `reports.view` only).

## Bootstrap (`GET /api/bootstrap`)

The SPA loads a single snapshot. Row-level lists are **filtered by role** in `server/bootstrap.js` using helpers in `server/workspaceAccess.js`. Sensitive domains (customers, finance, procurement, operations, etc.) are omitted unless the user has a matching permission. Treasury **movements** stay finance-only; treasury **account names** are included for roles that post receipts or request refunds (cash/bank pickers).

## Read APIs

`GET` handlers under `/api` that return business data use `requirePermission(...)` (or internal checks) so empty bootstrap cannot be bypassed by calling the API directly. Examples: customers and quotations require sales-domain permissions; ledger and advances require ledger-related permissions; suppliers require procurement-domain permissions.

`GET /api/reports/summary` returns **counts only** (no row payloads) for anyone with `reports.view`, respecting branch scope. The Reports page uses this when the user has reports access but no line-level snapshot data.

`GET /api/inventory/snapshot` mirrors bootstrap with the same filtering; it still requires an authenticated session.

## HR

- Directory, payroll, attendance, and salary snapshots use explicit HR permissions.
- `GET /api/hr/requests` scopes results by query (`mine`, `hr_queue`, `exec_queue`, `all`) with permission checks on non-mine scopes.
- `GET /api/hr/employment-letters` requires `hr.self`, `hr.staff.manage`, or `hr.letters.generate` (admin passes via `*`).

## Hardening checklist for production

- Replace demo passwords and restrict who can create users.
- Serve the API over HTTPS and set `COOKIE_SECURE` appropriately.
- Review new `GET` routes and add `requirePermission` aligned with `workspaceAccess.js`.
- Run `npm run test` and `npm run test:e2e` in CI.

## E2E (`npm run test:e2e`)

Playwright starts `server/playwrightServer.js` (deletes and recreates `data/playwright.sqlite` each time) on port **8787** and Vite on **5173**. Free those ports locally, or stop any other Zarewa API using 8787. Role checks live in `e2e/access-control.spec.js` (viewer + procurement API assertions and viewer Reports count-only UI).

## API test suite note

`server/api.test.js` uses `describe.sequential` so Vitest does not run those cases concurrently against shared globals (concurrency was causing flaky `FOREIGN KEY` errors on purchase-order inserts).

## Related files

| Area | File |
|------|------|
| Roles & session | `server/auth.js` |
| Domain helpers | `server/workspaceAccess.js` |
| Bootstrap builder | `server/bootstrap.js` |
| HTTP routes | `server/httpApi.js` |
| Aggregate report counts | `server/readModel.js` → `workspaceReportAggregateCounts` |
