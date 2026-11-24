# arxys Task Rules

| Rule | Guideline |
|---|---|
| **Title** | 9–12 words max. Describes the work clearly — no filler ("we need to", "please", "I want to"). |
| **Description** | Every task must answer: *what*, *why*, and *acceptance criteria*. Lives in the GitHub issue body — set at creation via `body_text`, or edit later with `PATCH /v1/github/issue/:number { "body": "..." }`. |
| **Comments** | Short and focused. One concern per comment. Reference issues and PRs with `#42` — GitHub auto-links with live title and status. |
| **Status change** | Always post a comment explaining *why* before changing Status. The API auto-posts an audit comment too — yours is the reasoning one. |
| **Effort** | Low · Medium · High (GitHub default Effort field). Set on every task. If a task feels bigger than High, consider splitting it. |
| **Labels** | Use GitHub labels. Standard labels are created by `POST /v1/github/project/bootstrap`. Add them to issues via `PATCH /v1/github/issue/:number { "labels": ["has-migration"] }`. |
| **Task repo** | Tasks (issues) live only in the workspace's tracking repo (`github_repo`), so task numbers are unique. Code repos link their PRs with `Closes <tracking-repo>#<number>`. If a number ever exists in several repos, task routes return 409 — pass `?repo=owner/repo`. |
| **Assignee logins** | GitHub login of any teammate: `GET /v1/workspace/members` (`display_name`, `notion_user`, `github_login` for everyone with access to this workspace). Do not use `/v1/github/project/members` — it lists only public org members. A member must also be a collaborator on the tracking repo to be assignable. |
| **Task number `<No.>`** | The task's GitHub issue number in the tracking repo, zero-padded to 4 digits: issue #71 → `0071`. Used in every branch name. API calls use the plain number (`/v1/task/71`). |
| **Git Branch** | Set on the task after creating the branch: `PATCH /v1/task/:ref { "field": "Git Branch", "value": "..." }`. |
| **Pull Request** | Set on the task after opening the PR: `PATCH /v1/task/:ref { "field": "Pull Request", "value": "https://github.com/..." }`. |
| **Review round** | Incremented by the reviewer before sending a task back. `PATCH /v1/task/:ref { "field": "Review round", "value": "2" }`. |
| **Icebox** | Parked work. Ignore unless a human names it explicitly. `GET /v1/task/list` excludes Icebox by default. |
| **Priority** | Urgent · High · Medium · Low (GitHub default Priority field). Set by ako (CTO). Do not change without explicit instruction. If something feels wrong, comment on the task. |

## Status Options

These are the Status options on the project board (names must match exactly when you `PATCH` Status):

| Status | Meaning |
|---|---|
| **Planning** | Being shaped: acceptance criteria, sizing, splitting. Not ready to start. |
| **Backlog** | Shaped and ready to be pulled when capacity allows. |
| **Up Next** | This is ready to be picked up |
| **In Progress** | This is actively being worked on |
| **Testing** | Being verified against the acceptance criteria — peer, dev, stage or production. Labels say which. |
| **Deploying** | Reviewed, merged and deployed in one pass. |
| **Pending Acceptance** | Testing passed. Waiting for stakeholder sign-off. |
| **Completed** | This has been completed |
| **Cancelled** | Won't be done. Dropped or no longer needed. |
| **Icebox** | Parked. Hidden from task lists unless asked for by name. |

Flow: Planning → Backlog → Up Next → In Progress → Testing → Deploying → Testing → Pending Acceptance → Completed. Side states: Icebox (parked), Cancelled (terminal).

Testing appears twice: before deploy (peer, dev or stage testing) and after deploy (production testing). Labels record which environments have passed: `peer-tested`, `stage-tested`, `prod-tested`. Review and deploy are one step — **Deploying**. A failed test sends the task back to Up Next.

## Standard Labels

Created automatically by `POST /v1/github/project/bootstrap`. Apply with `PATCH /v1/github/issue/:number { "labels": [...] }`.

| Label | When to use |
|---|---|
| `has-migration` | Task ships a DB schema change — run migration before/after deploy |
| `has-env-change` | Task requires `.env` updates on the server before deploying |
| `coding` | Actively being implemented — add when moving to In Progress |
| `reviewed` | Code review passed |
| `pending-merge` | Review PR is open, awaiting merge |
| `issue-persists` | Major issue found — sent back to developer |
| `hotfix` | Fast-track critical production fix |
| `need-info` | Blocked on missing information before work can start |
| `peer-tested` | Passed peer testing (another tester or developer, usually on dev) |
| `stage-tested` | Passed testing on stage |
| `prod-tested` | Passed production testing |

## Git Rules

- **`git add`, `git commit`, `git push`, branch deletion** — seek explicit permission from the human before running any of these. Do not assume permission from context.
- **Never create branches via any API** — local `git checkout -b` only, after human approval.
- **Never commit on the root/default branch** — it is sacred. No exceptions.
- **Never skip hooks (`--no-verify`)** unless explicitly asked.

## Working Directory Rule

Before starting any workflow, every repo must have a clean working directory. If `git status` shows anything staged or unstaged, stop. Either finish the in-progress work or ask the human to park it as a WIP commit before continuing.

## Production Rule

Never deploy to production. Never SSH, restart services, or run server-side migrations. Deployment is human-only.
