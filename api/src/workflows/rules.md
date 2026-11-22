# arxys Task Rules

| Rule | Guideline |
|---|---|
| **Title** | 9–12 words max. Describes the work clearly — no filler ("we need to", "please", "I want to"). |
| **Description** | Every task must answer: *what*, *why*, and *acceptance criteria*. Lives in the GitHub issue body — set at creation via `body_text`, or edit later with `PATCH /v1/github/issue/:number { "body": "..." }`. |
| **Comments** | Short and focused. One concern per comment. Reference issues and PRs with `#42` — GitHub auto-links with live title and status. |
| **Status change** | Always post a comment explaining *why* before changing Status. The API auto-posts an audit comment too — yours is the reasoning one. |
| **Effort** | Low · Medium · High (GitHub default Effort field). Set on every task. If a task feels bigger than High, consider splitting it. |
| **Labels** | Use GitHub labels. Standard labels are created by `POST /v1/github/project/bootstrap`. Add them to issues via `PATCH /v1/github/issue/:number { "labels": ["has-migration"] }`. |
| **Git Branch** | Set on the task after creating the branch: `PATCH /v1/task/:ref { "field": "Git Branch", "value": "..." }`. |
| **Pull Request** | Set on the task after opening the PR: `PATCH /v1/task/:ref { "field": "Pull Request", "value": "https://github.com/..." }`. |
| **Review round** | Incremented by the reviewer before sending a task back. `PATCH /v1/task/:ref { "field": "Review round", "value": "2" }`. |
| **Icebox** | Parked work. Ignore unless a human names it explicitly. `GET /v1/task/list` excludes Icebox by default. |
| **Priority** | Urgent · High · Medium · Low (GitHub default Priority field). Set by ako (CTO). Do not change without explicit instruction. If something feels wrong, comment on the task. |

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

## Git Rules

- **`git add`, `git commit`, `git push`, branch deletion** — seek explicit permission from the human before running any of these. Do not assume permission from context.
- **Never create branches via any API** — local `git checkout -b` only, after human approval.
- **Never commit on the root/default branch** — it is sacred. No exceptions.
- **Never skip hooks (`--no-verify`)** unless explicitly asked.

## Working Directory Rule

Before starting any workflow, every repo must have a clean working directory. If `git status` shows anything staged or unstaged, stop. Either finish the in-progress work or ask the human to park it as a WIP commit before continuing.

## Production Rule

Never deploy to production. Never SSH, restart services, or run server-side migrations. Deployment is human-only.
