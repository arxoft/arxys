---
inclusion: auto
name: arxys-arch
description: Architecture reference for the arxys monorepo — data model, auth, service topology, and planned evolution. Activate when working on schema, auth, routing, or new features.
---

# arxys — Architecture Reference

## Repository Layout

```
.arxys/
├── api/          Cloudflare Worker — Hono HTTP API (TypeScript)
├── admin/        Cloudflare Worker — React SPA admin UI (Vite + TypeScript)
└── cli-depricated/  Bash CLI (deprecated; kept for workflow reference)
```

Both `api/` and `admin/` are independent Cloudflare Workers deployed to the same zone (`arxoft.com`) via separate wrangler configs.

---

## Service Topology

```
Browser / Agent / CLI
        │
        ▼
arxysadmin.arxoft.com   (admin Worker — serves React SPA)
        │  API calls
        ▼
arxysapis.arxoft.com    (api Worker — Hono router)
        │
        ├── Cloudflare D1  (arxys-db — SQLite)
        ├── Notion API
        ├── GitHub REST + GraphQL API
        └── Slack API
```

Both workers share the same Cloudflare account (`0a3777c8ac5ed393ad6b580e151cb3a9`) and zone (`ae4186f372f44167db1b35d905e51f2d`).

The admin SPA makes all API calls to `arxysapis.arxoft.com`. CORS is explicitly allowed for `arxysadmin.arxoft.com` and `*.arxys-admin.pages.dev` (preview deploys).

No direct database access from the admin — everything goes through the API.

---

## Data Model

### Current hierarchy (2 levels)

```
Venture  (arxoft, alqada, sensei …)
  └── Workspace  (git repo anchor — one per repo)
```

Planned evolution → 4 levels: `Venture → Client → Project → Workspace` (see `api/upcoming.md`).

### Core tables

| Table | Key columns | Notes |
|-------|-------------|-------|
| `ventures` | `id` (slug), `slack_bot_token`, `slack_channel_id` | Top-level org unit |
| `workspaces` | `id`, `venture_id`, `github_repo`, `board_type`, `notion_api_key`, `notion_database_id`, `github_project_id`, `slack_channel_id` | Anchors to one git repo; owns Notion + GitHub credentials |
| `members` | `id` (slug), `api_key` (`axk_…`), `login_email` | Global; not venture-scoped |
| `venture_members` | `venture_id`, `member_id`, `venture_role`, `github_pat`, `notion_user`, `email` | PAT lives here — per-venture per-member |
| `workspace_members` | `workspace_id`, `member_id`, `workspace_role` | Explicit access grant; venture admins bypass |
| `sessions` | `token`, `member_id`, `expires_at` | 7-day OTP sessions for admin UI |
| `otp_codes` | `email`, `code`, `expires_at`, `used` | 10-min one-time login codes |
| `workspace_repos` | `workspace_id`, `repo`, `alias` | Additional repos associated with a workspace |
| `venture_boards` | `venture_id`, `database_id`, `alias` | Additional Notion boards per venture |

### `board_type` values

| Value | Meaning |
|-------|---------|
| `notion` | Notion only — `notion_api_key` + `notion_database_id` required |
| `github` | GitHub Projects only — `github_project_id` required |
| `both` | Both active simultaneously — all three fields required |

---

## Auth

### Operational API (`/v1/*`)
- **Headers:** `X-Api-Key` (member's `axk_…` key) + `X-Workspace` (workspace slug)
- Middleware (`src/middleware/auth.ts`) resolves: member → workspace → venture → `venture_members` row
- Venture admin → implicit access to all workspaces in their venture
- Venture member → needs explicit `workspace_members` row
- Resolved context is available to all route handlers via Hono `c.get()` variables: `member`, `workspace`, `venture`, `ventureMember`, `credentials`

### Admin UI (`/admin/*`)
- **Header:** `X-Session-Token` (7-day token from OTP flow)
- OTP flow: `POST /auth/otp/request { email }` → email → `POST /auth/otp/verify { email, code }` → token
- Session auth is handled inside `adminRoutes` middleware, not in the shared `authMiddleware`
- Must be `venture_role = 'admin'` in at least one venture (or have zero venture memberships — bootstrap state)

### Credentials bundle
After auth resolves, `c.get('credentials')` contains everything a route handler needs:
```typescript
{
  notionApiKey, notionDatabaseId, notionUser, notionUserEmail,
  githubToken,  // the calling member's PAT from venture_members
  githubProjectId,
  slackBotToken, slackChannelId,
}
```
Route handlers never read from `c.env` directly for credentials — always use `c.get('credentials')`.

---

## Routing

```
GET  /                   → API reference (no auth)
/auth/*                  → OTP login/logout/me (no auth)
/v1/*      + authMiddleware → all operational routes
/admin/*   + session auth   → venture/workspace/member management
```

Hono sub-apps are mounted in `src/index.ts`. Each domain (notion, github, slack) is its own file under `src/notion/`, `src/github/`, `src/slack/`.

---

## Secrets

Stored as Cloudflare Worker secrets (never in `wrangler.toml`):
- `RESEND_API_KEY` — email OTP delivery
- `RESEND_DOMAIN` — sender domain

GitHub PATs and Notion API keys are stored in D1 (`venture_members.github_pat`, `workspaces.notion_api_key`). Slack tokens are in `ventures.slack_bot_token`.

The `keep_vars = true` flag in `api/wrangler.toml` ensures secrets survive code deploys (not wiped on each push).

---

## D1 Migrations

- Files live in `api/migrations/` — numbered sequentially `0001_…`
- Applied via `wrangler d1 migrations apply arxys-db --remote`
- **Always run migrations before deploying code** when a migration is pending
- Local state (`--local`) and remote state are independent — always check `--remote` before deploying

### Migration history

| File | Change |
|------|--------|
| `0001_initial.sql` | Base schema: ventures, workspaces, members, venture_members |
| `0002` | Member email added to venture_members |
| `0003` | Notion API key moved to workspace (from venture) |
| `0004` | Drop title_property from workspaces |
| `0005` | Rename notion_database fields |
| `0006` | workspace_members table |
| `0007` | sessions + otp_codes tables |
| `0008` | login_email on members |
| `0009` | Drop venture.github_org |
| `0010` | board_type column on workspaces (notion/github) |
| `0011` | Extend board_type CHECK to allow 'both' (table recreate — SQLite ALTER limitation) |

---

## Admin UI

React SPA served by a Cloudflare Worker (`admin/worker.js`) that acts as a static asset host. Vite builds to `admin/dist/`. The worker uses `html_handling = "none"` + `not_found_handling = "single-page-application"` so client-side routing works.

Key pages:
- `/login` — OTP auth
- `/ventures` — venture + member management (VentureDetail.tsx)
- `/workspaces` — workspace CRUD with dual-board selector
- `/members` — member list

API calls are centralized in `admin/src/api.ts`.

---

## Upcoming: 4-Level Hierarchy

See `api/upcoming.md` for full spec. Summary:

```
Venture → Client → Project → Workspace
```

- Two new tables: `clients`, `projects`
- Workspaces get `project_id` FK, lose `venture_id`
- Auth middleware gets one more join in the resolution chain
- Two new admin pages (Client detail, Project detail)
- Effort: ~10h
