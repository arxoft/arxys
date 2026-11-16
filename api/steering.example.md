<!--
  Copy this file to .kiro/steering/<your-project>.md in your project root.
  Update the workspace-specific overrides section at the bottom.

  inclusion: auto
  name: arxys
  description: Agent instructions for arxys API — task management via GitHub Projects and/or Notion, GitHub operations, and workspace workflows via HTTP. Activate when the agent is working on tasks, PRs, branches, or anything involving Notion or GitHub.
-->

# arxys — Agent Instructions (API Edition)

**arxys** is the Arxoft workspace management API. It wraps GitHub Projects, Notion, and GitHub operations behind a single authenticated HTTP interface.

The canonical version of this file is always available at:

```http
GET https://arxysapis.arxoft.com/v1/steering
```

Fetch it if you suspect your local copy is outdated.

---

## Before Starting Any Task or PR Work

**Always fetch the relevant workflow first. Do not proceed without reading it.**

```http
GET https://arxysapis.arxoft.com/v1/workflow/development    ← picking up a task
GET https://arxysapis.arxoft.com/v1/workflow/review         ← reviewing a PR
GET https://arxysapis.arxoft.com/v1/workflow/hotfix         ← critical production issue
GET https://arxysapis.arxoft.com/v1/workflow/planning       ← grooming the backlog
GET https://arxysapis.arxoft.com/v1/workflow/deployment     ← deploying
GET https://arxysapis.arxoft.com/v1/workflow/testing        ← testing after deploy
GET https://arxysapis.arxoft.com/v1/workflow/task-creation  ← writing a new task
GET https://arxysapis.arxoft.com/v1/workflow/bug-reporting  ← filing a bug
GET https://arxysapis.arxoft.com/v1/workflow/release        ← cutting a release
GET https://arxysapis.arxoft.com/v1/workflow/onboarding     ← new developer setup
```

For the full rules (git, production, task conventions):

```http
GET https://arxysapis.arxoft.com/v1/rules
```

For a list of all available workflows:

```http
GET https://arxysapis.arxoft.com/v1/workflow/list
```

These endpoints require no authentication.

---

## API

**Base URL:** `https://arxysapis.arxoft.com`
**Full reference:** `GET https://arxysapis.arxoft.com/` — returns all endpoints, parameters, and auth details.

### Authentication

Every `/v1/*` request (except `/v1/workflow/*`, `/v1/rules`, `/v1/steering`) requires:

```
X-Api-Key:   axk_...          # your personal arxys key
X-Workspace: <workspace-slug> # e.g. arxoft-main, alqada, sensei
```

---

## Unified Task Abstraction

Use `/v1/task` for all task operations — it works regardless of whether the workspace uses GHP or Notion:

```http
GET    /v1/task/list              ?mine=1  ?icebox=1  ?status=In+Progress
GET    /v1/task/:ref
POST   /v1/task                  { "title": "..." }
PATCH  /v1/task/:ref             { "field": "Status", "value": "In Progress" }
PATCH  /v1/task/:ref/assign      { "assignees": ["login"] }
PATCH  /v1/task/:ref/unassign    { "assignees": ["login"] }
POST   /v1/task/:ref/comment     { "text": "..." }
```

`:ref` = GitHub issue number for GHP workspaces, Notion unique_id No. for Notion workspaces.

Status changes automatically post an audit comment and fire Slack. `repo` is never required — defaults to workspace primary repo.

---

## Pull Requests

```http
GET    /v1/github/pr/list
GET    /v1/github/pr/:number
GET    /v1/github/pr/:number/files
GET    /v1/github/pr/:number/status
GET    /v1/github/pr/base-check?base=main&sha=<sha>
POST   /v1/github/pr    { "title": "...", "head": "branch", "body_text": "...", "supersedes"?: number }
POST   /v1/github/pr/:number/merge   { "method": "squash" }
POST   /v1/github/pr/:number/review  { "action": "approve" }
```

`supersedes` closes the original PR and cross-links it automatically.

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

---

## Hard Rules (summary — full version at /v1/rules)

- Never `git add`, `git commit`, `git push`, or delete branches without explicit permission from the human.
- Never commit on the root branch.
- Never start a workflow without a clean working directory in all repos.
- Always comment before changing Status — the workflow doc shows the exact call order.
- Never deploy to production.
- Do not construct GitHub Projects v2 GraphQL queries directly — use the arxys API endpoints.

---

## Workspace-Specific Overrides

<!-- Update this section for each project that copies this file -->

### Board in Use
<!-- GHP / Notion / Both -->
_e.g. GitHub Projects only_

### GitHub Project ID
<!-- The PVT_... node ID for the GitHub Project linked to this workspace. -->
<!-- Find it by calling: GET /v1/github/project/list (returns id, title, url for each project) -->
_e.g. PVT_kwDO..._

### Branch Naming
<!-- Default: <root>_<milestone>_<No.>-slug — override here if different -->
_Using defaults._

### Coding Standards
_See other steering files in `.kiro/steering/` for language and framework conventions._

### Deploy Process
_Refer to project README or infrastructure docs._

### Notes
_None._
