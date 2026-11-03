# Upcoming — Ventures → Clients → Projects → Workspaces

## Overview

Introduce two new hierarchy levels between ventures and workspaces:

```
Venture  (Arxoft, MAK-TG, Vaylour)
  └── Client  (a company or product the venture serves)
        └── Project  (a scoped initiative for that client)
              └── Workspace  (git repo anchor — unchanged)
```

Current: `ventures → workspaces` (2 levels)
Target:  `ventures → clients → projects → workspaces` (4 levels)

---

## Schema changes

Two new tables. Workspaces get `project_id` FK instead of `venture_id`.

```sql
CREATE TABLE clients (
  id           TEXT PRIMARY KEY,        -- slug: "acme", "internal"
  venture_id   TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE projects (
  id           TEXT PRIMARY KEY,        -- slug: "acme-platform", "acme-mobile"
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- workspaces: replace venture_id with project_id
ALTER TABLE workspaces ADD COLUMN project_id TEXT REFERENCES projects(id);
-- migrate existing data, then drop venture_id
```

---

## API changes

- Auth middleware: resolve workspace → project → client → venture (one extra join)
- `Credentials` type unchanged — workspace still owns Notion/Slack config
- Admin routes: full CRUD for clients and projects
- New endpoints:
  - `GET  /admin/ventures/:id/clients`
  - `POST /admin/ventures/:id/clients`
  - `GET  /admin/clients/:id/projects`
  - `POST /admin/clients/:id/projects`
  - `GET  /admin/projects/:id/workspaces`
  - Existing workspace endpoints updated to accept `project_id`

---

## Admin UI changes

- Venture detail: shows clients list (not workspaces directly)
- New Client detail page: shows projects
- New Project detail page: shows workspaces (current workspace section moves here)
- Navigation: Ventures → Client → Project → Workspace (3 levels deep)
- Breadcrumb navigation needed across all detail pages

---

## Effort estimate

| Area                                    | Effort |
|-----------------------------------------|--------|
| Schema migration                        | 2h     |
| Auth middleware update                  | 1h     |
| Admin API routes (clients + projects)   | 2h     |
| Admin UI (2 new pages + nav updates)    | 4h     |
| Testing + deploy                        | 1h     |
| **Total**                               | **~10h** |
