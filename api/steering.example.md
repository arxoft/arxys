<!--
  Copy this file to .kiro/steering/<your-project>.md in your project root.
  Then update the front-matter below and fill in the placeholders throughout.

  inclusion: auto
  name: arxys
  description: Agent instructions for arxys API — task management via Notion and/or GitHub Projects, GitHub operations, and workspace workflows via HTTP. Activate when the agent is working on tasks, PRs, branches, or anything involving Notion or GitHub.
-->

# arxys — Agent Instructions (API Edition)

**arxys** is the Arxoft workspace management API. It wraps Notion task management, GitHub Projects, and GitHub operations behind a single authenticated HTTP interface. This file is the agent's primary reference for all task, PR, and workflow operations in this project.

---

## What arxys does

- Manages tasks on a Notion board and/or GitHub Projects board (create, update, assign, comment, status transitions)
- Manages GitHub PRs and issues (create, review, merge, check CI status)
- Enforces workflow rules: status audit comments, title prefixes, Slack notifications
- Sends Slack notifications on every state-changing operation

---

## API

**Base URL:** `https://arxysapis.arxoft.com`  
**Full reference:** `GET https://arxysapis.arxoft.com/` — returns all endpoints, parameters, and auth details.

### Authentication

Every `/v1/*` request requires two headers:

```
X-Api-Key:   axk_...          # your personal arxys key
X-Workspace: <workspace-slug> # e.g. arxoft-main, alqada, sensei
```

The workspace slug tells the API which board(s), GitHub org, and Slack channel to use. You never pass credentials directly.

Copy `.env.arxys.example` from `api/` into your project root as `.env.arxys` and fill in your values. The agent reads `ARXYS_API_KEY` and `ARXYS_WORKSPACE` from there.

---

## Board Configuration — Notion, GitHub Projects, or Both

A workspace can use Notion, GitHub Projects, or both simultaneously. The board configuration is determined by which credentials are present on the workspace — there is no explicit mode flag.

**To detect which boards are active, call:**

```http
GET https://arxysapis.arxoft.com/
```

Look at the workspace context from the auth response, or simply attempt the board-specific list endpoint and check for a credential error:

- If `GET /v1/notion/task/list` returns `200` → Notion is active
- If `GET /v1/github/project/<project_id>/issues` returns `200` → GitHub Projects is active
- Both can be active at the same time

When both are active, task tracking happens on both boards. Keep them in sync manually or use the migrate route to move tasks from Notion → GitHub Projects.

**When in doubt, ask the human which board to use for new tasks in this workspace.**

---

## Quick Reference

### Notion Tasks (when Notion is active)

```http
GET    /v1/notion/task/list
GET    /v1/notion/task/list?mine=1
GET    /v1/notion/task/list?review_queue=1
GET    /v1/notion/task/list?status=In+Progress
GET    /v1/notion/task/:no
POST   /v1/notion/task                       { "title": "..." }
PATCH  /v1/notion/task/:no                   { "property": "Status", "value": "In Progress" }
PATCH  /v1/notion/task/:no/assign            { "emails": ["user@example.com"] }
PATCH  /v1/notion/task/:no/unassign          { "emails": ["user@example.com"] }
POST   /v1/notion/comment/:no               { "text": "..." }
```

### GitHub Projects Tasks (when GHP is active)

The project ID (`PVT_...`) is stored on the workspace — you do not need to pass it manually.

```http
# List issues in the workspace project
GET    /v1/github/project/<project_id>/issues
GET    /v1/github/project/<project_id>/issues?mine=1
GET    /v1/github/project/<project_id>/issues?status=In+Progress
GET    /v1/github/project/<project_id>/issues?icebox=1          # Icebox hidden by default

# Create an issue and add to project
POST   /v1/github/issue                      { "repo": "owner/repo", "title": "..." }
POST   /v1/github/project/<project_id>/issues  { "repo": "owner/repo", "issue_number": 42 }

# Update Status field (fires Slack + posts audit comment)
# Get field_id first: GET /v1/github/project/<project_id>/fields
PATCH  /v1/github/project/<project_id>/issues/<item_id>  { "field_id": "PVTF_...", "value": "In Progress" }

# Assign / unassign
PATCH  /v1/github/project/<project_id>/issues/<item_id>/assign    { "repo": "owner/repo", "assignees": ["login"] }
PATCH  /v1/github/project/<project_id>/issues/<item_id>/unassign  { "repo": "owner/repo", "assignees": ["login"] }

# Comment (fires Slack)
POST   /v1/github/project/<project_id>/issues/<issue_number>/comment  { "repo": "owner/repo", "text": "..." }

# Project members (equivalent of notion/user/list)
GET    /v1/github/project/members
```

### Pull Requests

```http
GET    /v1/github/pr/list?repo=owner/repo
GET    /v1/github/pr/:number?repo=owner/repo
GET    /v1/github/pr/:number/files?repo=owner/repo
GET    /v1/github/pr/:number/status?repo=owner/repo
GET    /v1/github/pr/base-check?repo=o/r&base=main&sha=abc123
POST   /v1/github/pr                        { "repo": "owner/repo", "title": "...", "head": "branch" }
POST   /v1/github/pr/:number/merge          { "method": "squash" }
POST   /v1/github/pr/:number/review         { "action": "approve" }
```

### Issues (repo-level, not project-level)

```http
GET    /v1/github/issue/list?repo=owner/repo
GET    /v1/github/issue/:number?repo=owner/repo
POST   /v1/github/issue                     { "repo": "owner/repo", "title": "..." }
PATCH  /v1/github/issue/:number             { "state": "closed" }
POST   /v1/github/issue/:number/comment     { "text": "..." }
```

### Repos & Slack

```http
GET    /v1/github/repo/list
GET    /v1/github/repo/search?q=query
POST   /v1/slack/notify                     { "text": "..." }
```

---

## Git Repos in This Workspace

<!-- List all repos, their root/default branch, and any notes. -->

| Repo path | Root / default branch | Notes |
|-----------|-----------------------|-------|
| `.`       | `main`                |       |

---

## Status Flow

```
Planning → Backlog → Up Next → In Progress → Pending Review → Awaiting Deployment → Testing → Pending Acceptance → Completed
```

Side states: **Icebox** (parked), **Cancelled** (terminal).  
Hotfixes start directly at `In Progress` on a compressed timeline.

This flow applies to both Notion and GitHub Projects. On GitHub Projects, the Status field options are added manually in the project settings (GitHub does not allow API modification of the built-in Status field).

---

## Hard Rules — Agent Must Never Break These

### Git — Humans Only
- **Never run `git add`** — staging is human-only.
- **Never run `git commit`** — committing is human-only.
- **Never run `git push`** — pushing is human-only.
- **Never run `git branch -d` / `git branch -D`** — branch deletion is human-only.
- **Never create branches via the arxys API or any other API** — local `git checkout -b` only, after human approval.

### 🚨 Never commit on the root/default branch
The root/default branch is sacred. No commits are ever made directly on it — no exceptions.

### 🚨 Clean working directory before starting any workflow session
Before starting any workflow, all repos must have a clean working directory. A dirty working directory means work is in progress — finish it or park it first.

### Notion (when active)
- **Always comment before changing task Status** — `POST /v1/notion/comment/:no` first, then update status.
- **Never replace Duration — always increment it.**

### GitHub Projects (when active)
- **Always comment before changing Status** — `POST /v1/github/project/.../issues/:number/comment` first, then update status. The status update also auto-posts an audit comment, but your reasoning comment must come first.
- Status changes fire Slack automatically — do not duplicate with manual `/v1/slack/notify`.

### Production
- **Never deploy to production** — deployment is human-only.

---

## Task Rules

| Rule        | Guideline                                                                                                    |
|-------------|--------------------------------------------------------------------------------------------------------------|
| Title       | 9–12 words max; no filler words                                                                              |
| Description | Always fill in: what, why, acceptance criteria                                                               |
| Comments    | Short and focused; one concern per comment; full URLs when referencing tasks or PRs (never just `#42`)       |
| Status      | Always comment first explaining why, then update                                                             |
| Effort      | Fibonacci 1–13; 13 = consider splitting                                                                      |
| Tags        | Add `has-migration` or `has-env-change` when applicable                                                      |
| Duration    | HH:MM; always increment — never replace; confirm with human each time (Notion only)                         |

---

## Workflow Summaries

### Development (Notion)
1. Pick task → assign self: `PATCH /v1/notion/task/:no/assign { "emails": ["you@venture.com"] }`
2. Create branch locally: `git checkout -b <branch>`
3. Comment then move to In Progress
4. Implement, propose commit message — human commits and pushes
5. Human creates PR: `POST /v1/github/pr { "repo": "...", "title": "...", "head": "..." }`
6. Comment with full PR URL on the task, then move to Pending Review

### Development (GitHub Projects)
1. Pick issue from project: `GET /v1/github/project/<project_id>/issues?status=Up+Next`
2. Assign self: `PATCH /v1/github/project/<project_id>/issues/<item_id>/assign { "repo": "...", "assignees": ["login"] }`
3. Create branch locally: `git checkout -b <branch>`
4. Comment then update status to In Progress: comment first, then `PATCH /v1/github/project/<project_id>/issues/<item_id> { "field_id": "PVTF_...", "value": "In Progress" }`
5. Implement, propose commit message — human commits and pushes
6. Human creates PR: `POST /v1/github/pr { "repo": "...", "title": "...", "head": "..." }`
7. Comment with full PR URL on the issue, then move to Pending Review

### Development (Both active)
Follow both workflows above in parallel — update the task on both boards.

### Review
1. Pick from pending review list (Notion: `?review_queue=1`, GHP: `?status=Pending+Review`)
2. Check base staleness: `GET /v1/github/pr/base-check?repo=o/r&base=main&sha=<recorded>`
3. **Issues found** → comment, increment Review round, move back to Up Next
4. **Approved** → move to Awaiting Deployment

### Hotfix
- Task starts directly at `In Progress` — skip Planning/Backlog/Up Next
- Same review and deployment steps, compressed timeline

---

## Slack — Manual Messaging

arxys automatically sends Slack notifications for every status change, assignment, PR event, and comment — on both Notion and GitHub Projects. Do not manually notify for those.

Use `POST /v1/slack/notify` only for significant events outside the automatic flow:
- Blocked and why
- Flagging a risk before acting
- Unexpected findings that need human review
- Confirming a manual step is done

```http
POST /v1/slack/notify
{ "text": "Blocked on issue #42 — waiting for API credentials from the team." }
```

---

## Workspace-Specific Overrides

<!-- Replace or extend defaults below for this specific project -->

### Board(s) in Use
<!-- Specify which board(s) are active for this workspace -->
_e.g. Notion only / GitHub Projects only / Both_

### GitHub Project ID
<!-- The PVT_... node ID for the GitHub Project, if active -->
_e.g. PVT_kwDO..._

To find it, call the list endpoint with your arxys key — it returns the `id` (`PVT_...`) for every project in the org:

```bash
curl https://arxysapis.arxoft.com/v1/github/project/list \
  -H "X-Api-Key: axk_..." \
  -H "X-Workspace: your-workspace"
```

### Branch Naming
_Default: `<root>_<milestone>_<No.>-slug` — override here if different._

### Status Flow Overrides
_Using defaults._

### Coding Standards
_See other steering files in `.kiro/steering/` for language and framework conventions._

### Deploy Process
_Refer to project README or infrastructure docs._

### Notes
_None._
