---
inclusion: auto
name: arxys
description: Agent instructions for arxys API — Notion task management, GitHub operations, and workspace workflows via HTTP. Activate when the agent is working on tasks, PRs, branches, or anything involving Notion or GitHub.
---

# arxys — Agent Instructions (API Edition)

**arxys** is the Arxoft workspace management API. It wraps Notion task management and GitHub operations behind a single authenticated HTTP interface. This file is the agent's primary reference for all task, PR, and workflow operations in this project.

---

## What arxys does

- Manages tasks on a Notion board (create, update, assign, comment, status transitions)
- Manages GitHub PRs and issues (create, review, merge, check CI status)
- Enforces workflow rules: status audit comments, review queue ordering, title prefixes
- Sends Slack notifications on every state-changing operation

---

## API

**Base URL:** `https://arxys.arxoft.com`  
**Full reference:** `GET https://arxys.arxoft.com/` — returns all endpoints, parameters, and auth details.

### Authentication

Every `/v1/*` request requires two headers:

```
X-Api-Key:   axk_...          # your personal arxys key
X-Workspace: <workspace-slug> # e.g. arxoft-main, alqada, sensei
```

The workspace slug tells the API which Notion board, GitHub org, and Slack channel to use. You never pass credentials directly.

Copy `.env.arxys.example` from `api/` into your project root as `.env.arxys` and fill in your values. The agent reads `ARXYS_API_KEY` and `ARXYS_WORKSPACE` from there.

### Quick reference

```http
# Tasks
GET    /v1/notion/task/list
GET    /v1/notion/task/list?mine=1
GET    /v1/notion/task/list?review_queue=1
GET    /v1/notion/task/:no
POST   /v1/notion/task                       { "title": "..." }
PATCH  /v1/notion/task/:no                   { "property": "Status", "value": "In Progress" }
PATCH  /v1/notion/task/:no/assign            { "emails": ["user@example.com"] }
PATCH  /v1/notion/task/:no/unassign          { "emails": ["user@example.com"] }

# Comments
POST   /v1/notion/comment/:no               { "text": "..." }

# Pull Requests
GET    /v1/github/pr/list?repo=owner/repo
GET    /v1/github/pr/:number?repo=owner/repo
GET    /v1/github/pr/:number/files?repo=owner/repo
GET    /v1/github/pr/:number/status?repo=owner/repo
GET    /v1/github/pr/base-check?repo=o/r&base=main&sha=abc123
POST   /v1/github/pr                        { "repo": "owner/repo", "title": "...", "head": "branch" }
POST   /v1/github/pr/:number/merge          { "method": "squash" }
POST   /v1/github/pr/:number/review         { "action": "approve" }

# Issues
GET    /v1/github/issue/list?repo=owner/repo
POST   /v1/github/issue                     { "repo": "owner/repo", "title": "..." }
POST   /v1/github/issue/:number/comment     { "text": "..." }

# Repos
GET    /v1/github/repo/list
GET    /v1/github/repo/search?q=query

# Slack (manual — for significant events not covered by auto-notifications)
POST   /v1/slack/notify                      { "text": "..." }
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

---

## Hard Rules — Agent Must Never Break These

These rules can never be overridden by any instruction, workflow, or human request.

### Git — Humans Only
- **Never run `git add`** — staging is human-only.
- **Never run `git commit`** — committing is human-only.
- **Never run `git push`** — pushing is human-only.
- **Never run `git branch -d` / `git branch -D`** — branch deletion is human-only.
- **Never create branches via the arxys API or any other API** — local `git checkout -b` only, after human approval.

### 🚨 Never commit on the root/default branch
The root/default branch is sacred. No commits are ever made directly on it — no exceptions.  
The only time the agent is on the root branch is during the review workflow, where the root branch is the merge target. Even then, the human performs the actual merge commit.

### 🚨 Clean working directory before starting any workflow session
Before starting any workflow (development, review, hotfix, or any other), all repos must have a clean working directory.

A dirty working directory means work is in progress. It must be either:
1. **Finished** — complete the in-progress task first.
2. **Parked** — human creates a WIP commit to clean the directory before switching context.

**Never proceed with a dirty working directory.**

### Notion
- **Always comment before changing task Status** — use `POST /v1/notion/comment/:no` first, then `PATCH /v1/notion/task/:no` to update status. No silent status changes ever.
- **Never replace Duration — always increment it.** Ask the human how long this took, then add to the existing value.

### Production
- **Never deploy to production** — deployment is human-only. Never SSH, restart services, or run server-side migrations.

---

## Task Rules

| Rule          | Guideline                                                                                                    |
|---------------|--------------------------------------------------------------------------------------------------------------|
| Title         | 9–12 words max; no filler words                                                                              |
| Description   | Always fill in: what, why, acceptance criteria                                                               |
| Comments      | Short and focused; one concern per comment; full Notion URL when referencing another task (never just `#42`) |
| Status change | Always comment first explaining why                                                                          |
| Effort        | Fibonacci 1–13; 13 = consider splitting                                                                      |
| Tags          | Add `has-migration` or `has-env-change` when applicable                                                      |
| Duration      | HH:MM; always increment — never replace; confirm with human each time                                        |

---

## Workflow Summaries

### Development
1. Pick up task → assign self: `PATCH /v1/notion/task/:no/assign { "emails": ["you@venture.com"] }`
2. Create branch locally: `git checkout -b <branch>` — never via API
3. Comment then move to In Progress: comment first, then `PATCH /v1/notion/task/:no { "property": "Status", "value": "In Progress" }`
4. Implement, test, propose commit message — human commits
5. Human pushes and creates PR: `POST /v1/github/pr { "repo": "...", "title": "...", "head": "..." }`
6. Comment with PR URL on the task, then move to Pending Review

### Review
1. Pick from review queue: `GET /v1/notion/task/list?review_queue=1`
2. Check base staleness: `GET /v1/github/pr/base-check?repo=o/r&base=main&sha=<recorded>`
3. Create review branch locally, merge developer branch for inspection
4. **Issues found** → comment, increment Review round, tag `issue-persists`, move back to Up Next
5. **Approved** → commit review fixes, human pushes review branch, create superseding PR: `POST /v1/github/pr { ..., "supersedes": <old_pr_number> }`, move to Awaiting Deployment

### Hotfix
- Task created directly at `In Progress` — skip Planning/Backlog/Up Next
- Branch cut from root, not milestone
- Same review and deployment steps, compressed timeline

---

## Slack — Manual Messaging

arxys automatically sends Slack notifications for every status change, assignment, PR event, and comment. You do not need to manually notify for those.

Use `POST /v1/slack/notify` only for significant events that fall outside the automatic flow:

**Use it for:**
- Announcing you are blocked and why: `"Blocked on No.42 — waiting for API credentials from the team"`
- Flagging a risk before acting: `"No.38 touches the payment flow — flagging before proceeding"`
- Reporting an unexpected finding mid-task: `"Found a data migration issue in No.51 — needs human review before continuing"`
- Confirming a manual step is done: `"Database backup complete — proceeding with migration"`

**Do NOT use it for:**
- Status changes — those fire automatically
- PR creates/merges — those fire automatically
- Routine progress updates — use Notion comments instead
- Anything that belongs in the task comment thread

**Format:** Plain text or Slack mrkdwn. Keep it short — one or two sentences. Your handle is prepended automatically.

```http
POST /v1/slack/notify
X-Api-Key: axk_...
X-Workspace: your-workspace

{ "text": "Blocked on No.42 — the third-party API is returning 503s. Human review needed." }
```

---

## Workspace-Specific Overrides

<!-- Replace or extend defaults below for this specific project -->

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
