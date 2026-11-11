---
inclusion: auto
name: arxys-deploy
description: Deployment procedures for arxys API and admin — Cloudflare Workers, D1 migrations, secrets, and known failure modes. Activate when deploying, debugging a deploy, or touching wrangler config.
---

# arxys — Deployment Reference

## Overview

Both workers deploy automatically via GitHub Actions on push to `main`. The workflows are path-scoped — only the affected service redeploys.

| Service | Trigger path | URL | Workflow |
|---------|-------------|-----|----------|
| API Worker | `api/**` | `arxysapis.arxoft.com` | `deploy-api.yml` |
| Admin Worker | `admin/**` | `arxysadmin.arxoft.com` | `deploy-admin.yml` |

Manual trigger is available on both via `workflow_dispatch` in GitHub Actions.

---

## Normal Deploy Flow

### When only code changes (no migration)

1. Human stages and commits changes
2. Human pushes to `main`
3. GitHub Actions picks it up — no manual steps needed
4. Verify by hitting `GET https://arxysapis.arxoft.com/` and checking the response

### When a migration is pending

**Always apply the migration before pushing the code.** Deploying code that depends on a schema change before the migration runs will cause 500s.

```bash
# Check what's pending remotely
cd api
npx wrangler d1 migrations list arxys-db --remote

# Apply pending migrations
npx wrangler d1 migrations apply arxys-db --remote

# Then commit + push — Actions deploys the Worker
```

Confirm the migration applied:
```bash
npx wrangler d1 execute arxys-db --remote --command \
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='<changed_table>';"
```

---

## Secrets Management

Secrets are **not** in `wrangler.toml` or any committed file. They live as Cloudflare Worker secrets and are sourced from GitHub repo secrets on each CI deploy.

### Set a new secret manually

```bash
cd api
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_DOMAIN
```

### CI secret sync (deploy-api.yml)

The workflow injects secrets via `--secrets-file` on every deploy. This means:
- Secrets are always current as of the last push — no drift between code and secrets
- `keep_vars = true` in `wrangler.toml` prevents Cloudflare from wiping secrets on deploy
- If a GitHub secret is empty, the workflow fails loudly (`exit 1`) before anything deploys

### Required GitHub repo secrets

| Secret | Used by |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Both deploy workflows |
| `RESEND_API_KEY` | API Worker — OTP email |
| `RESEND_DOMAIN` | API Worker — OTP email sender domain |

---

## Cloudflare Configuration

### Account + Zone

| Field | Value |
|-------|-------|
| Account ID | `0a3777c8ac5ed393ad6b580e151cb3a9` |
| Zone ID | `ae4186f372f44167db1b35d905e51f2d` |
| D1 database | `arxys-db` (`ac5e4204-5b76-4eae-a1b7-da27a01a687b`) |

### workers_dev = false

Both workers have `workers_dev = false`. This is intentional — it disables the `*.workers.dev` subdomain, forcing all traffic through the custom domain routes. This prevents Cloudflare edge caching from serving stale API responses (a past incident — `workers_dev = true` allowed CF to cache responses, causing stale data to be served).

---

## Known Issues and Past Incidents

### Route displacement (fixed)

**Symptom:** Admin UI stops working after an API redeploy, or vice versa.  
**Cause:** Cloudflare Workers route registration is global per zone. If two workers claim overlapping routes and one is deployed, the new deploy can displace the other's route.  
**Fix:** Both workers use non-overlapping explicit patterns:
- API: `arxysapis.arxoft.com/*`
- Admin: `arxysadmin.arxoft.com/*`

They are on separate subdomains now — no overlap possible. This replaced the old same-domain path routing (`arxoft.com/api/*` vs `arxoft.com/*`).

### Stale edge caching (fixed)

**Symptom:** API responses don't reflect latest data; old responses served after updates.  
**Cause:** `workers_dev = true` or missing `Cache-Control` header allowed Cloudflare to cache API responses at the edge.  
**Fix:** `workers_dev = false` in both wrangler configs + `Cache-Control: no-store` header added to every API response in `src/index.ts`.

### CORS errors from admin UI (fixed)

**Symptom:** Admin UI gets CORS errors on API calls.  
**Cause:** Manual CORS header setting in route handlers was inconsistent; `OPTIONS` preflights weren't handled.  
**Fix:** Replaced manual CORS with `hono/cors` middleware in `src/index.ts`. Origin allowlist: `arxysadmin.arxoft.com` + `*.arxys-admin.pages.dev` (Cloudflare Pages preview URLs).

### _redirects conflict with Cloudflare assets (resolved)

**Symptom:** Admin SPA routing broken; assets serving wrong content.  
**Cause:** Cloudflare's static assets binding (`ASSETS`) + `html_handling = "none"` + a `_redirects` file created conflicting rewrite rules.  
**Fix:** Removed `_redirects`. Used `not_found_handling = "single-page-application"` in `wrangler.toml` instead — this is the correct Cloudflare-native way to handle SPA fallback routing.

### SQLite ALTER COLUMN not supported

**Symptom:** Migration fails with "near COLUMN: syntax error".  
**Cause:** SQLite (and therefore D1) does not support `ALTER TABLE … ALTER COLUMN` or adding CHECK constraints after the fact.  
**Pattern:** When a column constraint needs to change, recreate the table:
```sql
CREATE TABLE t_new (...new schema...);
INSERT INTO t_new SELECT * FROM t;
DROP TABLE t;
ALTER TABLE t_new RENAME TO t;
CREATE INDEX ...;  -- recreate any indexes
```
See `0011_board_type_both.sql` as the reference example.

---

## Admin UI Deploy Notes

The admin deploy is a two-step Worker deploy:
1. `npm run build` → Vite compiles React to `admin/dist/`
2. `npx wrangler deploy` → uploads `dist/` as static assets + deploys `worker.js`

`worker.js` is a minimal pass-through that serves assets via the `ASSETS` binding. It does not contain application logic.

---

## Local Development

### API (local D1)

```bash
cd api
npm install
npx wrangler dev   # starts local Worker with local D1 at localhost:8787
```

Local D1 state lives in `api/.wrangler/state/v3/d1/`. It is independent of remote — run migrations locally with:
```bash
npx wrangler d1 migrations apply arxys-db   # no --remote = local
```

### Admin

```bash
cd admin
npm install
npm run dev   # Vite dev server at localhost:5173
```

The admin dev server proxies API calls. Update `admin/src/api.ts` base URL if testing against local API instead of production.

### Environment files

- `api/.env` — local wrangler dev secrets (never committed; see `.env.example`)
- `api/.env.arxys.example` — template for agent `.env.arxys` file (copy to project root as `.env.arxys`)

---

## Deployment Checklist

Before deploying any change:

- [ ] Working directory is clean (`git status`)
- [ ] If migration pending → apply it remotely first (`wrangler d1 migrations apply --remote`)
- [ ] Verify migration applied (`wrangler d1 execute --remote --command "SELECT sql FROM sqlite_master..."`)
- [ ] Code builds locally without errors (`cd api && npx tsc --noEmit` or `cd admin && npm run build`)
- [ ] Push to `main` — Actions handles the rest
- [ ] After deploy: spot-check `GET https://arxysapis.arxoft.com/` returns expected schema
- [ ] If admin changed: load `https://arxysadmin.arxoft.com` and verify UI
