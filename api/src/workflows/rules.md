# arxys Task Rules

| Rule | Guideline |
|---|---|
| **Title** | 9–12 words max. Describes the work clearly — no filler ("we need to", "please", "I want to"). |
| **Description** | Every task must answer: *what*, *why*, and *acceptance criteria*. Set via `PATCH /v1/task/:ref { "field": "Description", "value": "..." }` or in the GitHub issue body. |
| **Comments** | Short and focused. One concern per comment. Reference tasks and PRs with `#42` (GHP) or full URL (Notion). Never just a bare number on Notion. |
| **Status change** | Always post a comment explaining *why* before changing Status. The API auto-posts an audit comment too — yours is the reasoning one. |
| **Effort** | Fibonacci points: 1 · 2 · 3 · 5 · 8 · 13. Set on every task. 13 = too big, consider splitting. |
| **Tags / Labels** | Add `has-migration` if the task ships a DB schema change. Add `has-env-change` if `.env` changes are needed. These are labels in GHP, Tags in Notion. |
| **Icebox** | Parked work. Ignore unless a human names it explicitly. `GET /v1/task/list` excludes Icebox by default. |
| **Priority** | Critical · High · Medium · Low. Set by ako (CTO). Do not change without explicit instruction. If something feels wrong, comment on the task. |

## Git Rules — Agent Must Never Break

- **`git add`, `git commit`, `git push`, branch deletion** — seek explicit permission from the human before running any of these. Do not assume permission from context.
- **Never commit on the root/default branch** — it is sacred. No exceptions.
- **Never skip hooks (`--no-verify`)** unless explicitly asked.

## Working Directory Rule

Before starting any workflow, every repo must have a clean working directory. If `git status` shows anything staged or unstaged, stop. Either finish the in-progress work or ask the human to park it as a WIP commit before continuing.

## Production Rule

Never deploy to production. Never SSH, restart services, or run server-side migrations. Deployment is human-only.
