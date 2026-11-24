# GHP-First Plan

## Philosophy

Notion and GitHub Projects are both kept, but for different purposes:
- **GitHub Projects** — all project management: tasks, sprints, reviews, priorities, assignments
- **Notion** — relational knowledge bases: docs, wikis, reference databases, non-project data

All new arxys workflows are designed for GHP. If GHP already does it natively — linked PRs,
issue timelines, labels — we use that and don't build it in the API. Minimum workarounds.
No feature parity busywork. No GHP built-in automations — they can't be scripted and have
known conflicts with API-driven status updates.

---

## What GHP does natively — don't replicate in arxys

These are things the current Notion implementation built by hand. On GHP they're free:

| Capability | GHP native mechanism |
|---|---|
| Sequential task numbering | Issue `#number` — permanent, never embedded in title |
| Assignee lookup | GitHub logins — pass directly, no email → UUID resolution |
| Status change history | Issue timeline — every state transition recorded automatically |
| PR linkage with live state | Linked issues — `Closes #42` in PR body wires them together |
| Icebox/backlog filtering | Saved project views with filter expressions, configured once in UI |
| Dependency signaling | PR body cross-references (`Blocked by #37`) with live open/closed badges |
| Categorical tags | Labels — multi-value, colored, queryable, no serialization logic needed |

---

## What to remove from arxys

### Remove immediately

**`src/github/pr.ts` — review queue endpoint**
The `GET /v1/github/project/:id/issues?review_queue=1` logic (Kahn's topological sort,
external dep fetching, cycle detection) is the most brittle piece in the codebase. Its
underlying need — "what order should we merge?" — is answered by PR cross-references in GitHub.
Delete it. Any equivalent behavior belongs in a GHP view filtered to `Status = Deploying`
sorted by issue number.

**`workspace_repos` table**
The table exists but no route uses it for access control or defaulting. Either wire it up or
remove it. Decision: remove it in the next schema migration. Routes that need a repo take
`?repo=owner/repo` explicitly — this is simpler and more predictable.

### Strip project-specific logic after Notion migration completes

`src/notion/` stays — it serves non-project Notion databases (knowledge bases, relational
reference data). But the project-management-specific code inside it gets removed once all
task boards are on GHP.

**Delete from `src/notion/task.ts`:**
- `fix-titles` endpoint and the `titleWithNo` / `titleWithoutNo` functions — only exist because of the `(No.)` prefix hack, which GHP doesn't need
- `reviewQueue` function and the `review_queue` branch — project-management-only logic
- `resolvePageId` lookup by `unique_id` in `client.ts` — resolves Notion's auto-increment field, which only exists on task databases; general knowledge base records are addressed by page ID directly

**Delete entirely:**
- `src/github/migrate.ts` — one-way migration tool, disposable once all boards are moved

**Keep everything else in `src/notion/`:**
- `client.ts` (minus `resolvePageId`) — the HTTP layer, needed for all Notion access
- The CRUD core of `task.ts` (`list`, `get`, `create`, `patch`) — generic enough to query any Notion database, not just task boards
- `comment.ts` — comments on Notion pages remain useful for knowledge base records
- `db.ts` — `db/list`, `db/info`, `db/bootstrap` are exactly how you manage non-project Notion databases; the bootstrap schema will need a cleanup pass to remove project-only fields (`Depends on`, `Pull Request`, `Git Branch`)
- `user.ts` — still needed if any Notion DB has person-type fields

**Also clean up:**
- `board_type = 'both'` and `board_type = 'notion'` handling in route dispatch
- `notion_database_id` on workspaces that have fully moved to GHP (nulled out, not removed from schema — some workspaces may still use Notion for knowledge bases)

**Estimated deletions: ~400 lines across `task.ts`, `client.ts`, `migrate.ts`.**

---

## What to build

### 1. Unified task abstraction — `/v1/task`

Currently callers must know the board type and pick the right route:
- `/v1/notion/task/:no` for Notion workspaces
- `/v1/github/project/:id/issues/:itemId` for GHP workspaces

This branches every agent and integration. Add a thin routing layer:

```
GET    /v1/task/list              → reads workspace.board_type, dispatches internally
GET    /v1/task/:ref              → :ref is #number for GHP, task No. for Notion
POST   /v1/task                  → create task
PATCH  /v1/task/:ref             → update field (status, priority, etc.)
PATCH  /v1/task/:ref/assign      → assign by login (GHP) or email (Notion)
PATCH  /v1/task/:ref/unassign
POST   /v1/task/:ref/comment
```

The underlying GHP and Notion route handlers stay as-is. The `/v1/task` layer just reads
`workspace.board_type` and calls the right one. Callers become board-type-agnostic.

**This is the highest-value build item.** Agents, the CLI, and future tooling address tasks
the same way regardless of backend.

### 2. `workspace_repos` replacement — repo allow-list behavior

When a workspace has associated repos (beyond the primary `github_repo`), routes that accept
`?repo=` should validate the value against the workspace's allowed repos instead of accepting
any arbitrary repo. This is a security improvement and replaces the unused table.

Implementation:
- Keep or repurpose `workspace_repos` for the allow-list
- In GHP routes that accept `?repo=`, validate it's in `{workspace.github_repo} ∪ workspace_repos`
- If `?repo=` is omitted, default to `workspace.github_repo`

### 3. `board_type = 'notion'` → deprecation path

For workspaces still on Notion for project management:
- Run `POST /v1/github/migrate/notion-to-project` with `?dry_run=1`, review, then execute
- Flip `board_type` to `github` in admin UI
- Keep Notion credentials on the workspace only if it's still used for knowledge bases
- Delete the Notion DB entry from `workspaces.notion_database_id` once fully migrated

Target: all workspaces at `board_type = 'github'` before the Notion code is deleted.

---

## GHP project setup checklist (per workspace)

When bootstrapping a new workspace on GHP:

1. `POST /v1/github/project/bootstrap` — provisions all arxys fields (Priority, Effort, Due Date,
   Git Branch, Pull Request, Review round, Tags)
2. Set up saved views: `Active` (excludes Icebox, Completed, Cancelled), `Review Queue`
   (Status = Deploying, sorted by number), `Icebox`

---

## What to defer

- **4-level hierarchy** (`Venture → Client → Project → Workspace`) — see `upcoming.md`
- **PAT → GitHub App** — see `pat-to-github-app.md`

---

## Priority order

| # | Work item | Complexity | Value |
|---|---|---|---|
| 1 | Remove review queue endpoint | Low | Medium — removes most fragile code |
| 2 | Remove `workspace_repos` table / replace with allow-list | Low | Low-medium |
| 3 | Complete Notion → GHP migration for all project boards | Medium (ops) | High — unblocks code deletion |
| 4 | Strip project-specific logic from `src/notion/` + delete `migrate.ts` | Low (after #3) | High — removes ~400 lines, clarifies Notion's role |
| 5 | Build `/v1/task` unified abstraction layer | Medium | High — clean agent interface |
| 6 | PAT → GitHub App | Medium | High (reliability) — see `pat-to-github-app.md` |
| 7 | 4-level hierarchy | Medium | High (scale) — see `upcoming.md` |
