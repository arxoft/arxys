import { Hono } from 'hono'
import type { AppEnv } from './types'

// ---------------------------------------------------------------------------
// Workflow and rules content
//
// Cloudflare Workers have no filesystem at runtime, so content is imported
// as raw text at build time via Vite/wrangler's ?raw loader. If that is not
// available in this build config, the strings are inlined directly below.
//
// All routes are public (no auth required) so agents can read them before
// they have a workspace context.
// ---------------------------------------------------------------------------

export const workflowRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Content registry
// ---------------------------------------------------------------------------

const WORKFLOWS: Record<string, { title: string; content: string }> = {}

// Populated below — defined as a function so the file stays readable.
function register(name: string, title: string, content: string) {
  WORKFLOWS[name] = { title, content }
}

// ---------------------------------------------------------------------------
// GET /v1/workflow/list
// ---------------------------------------------------------------------------
workflowRoutes.get('/list', (c) => {
  return c.json({
    workflows: Object.entries(WORKFLOWS).map(([name, { title }]) => ({
      name,
      title,
      url: `/v1/workflow/${name}`,
    })),
    rules:    '/v1/rules',
    steering: '/v1/steering',
  })
})

// ---------------------------------------------------------------------------
// GET /v1/workflow/:name
// ---------------------------------------------------------------------------
workflowRoutes.get('/:name', (c) => {
  const name = c.req.param('name')
  const workflow = WORKFLOWS[name]
  if (!workflow) {
    const valid = Object.keys(WORKFLOWS).join(', ')
    return c.json({ error: `Unknown workflow '${name}'. Valid: ${valid}` }, 404)
  }
  return c.text(workflow.content, 200, { 'Content-Type': 'text/markdown; charset=utf-8' })
})

// ---------------------------------------------------------------------------
// GET /v1/rules  and  GET /v1/steering
// Served directly from index.ts — exported as getters so index can use them
// without re-importing content.
// ---------------------------------------------------------------------------
export function getRulesContent(): string { return RULES_CONTENT }
export function getSteeringContent(): string { return STEERING_CONTENT }

// ===========================================================================
// Content — markdown files inlined at build time
// ===========================================================================

const RULES_CONTENT = `# arxys Task Rules

| Rule | Guideline |
|---|---|
| **Title** | 9–12 words max. Describes the work clearly — no filler ("we need to", "please", "I want to"). |
| **Description** | Every task must answer: *what*, *why*, and *acceptance criteria*. Lives in the GitHub issue body — set at creation via \`body_text\`, or edit later with \`PATCH /v1/github/issue/:number { "body": "..." }\`. |
| **Comments** | Short and focused. One concern per comment. Reference issues and PRs with \`#42\` — GitHub auto-links with live title and status. |
| **Status change** | Always post a comment explaining *why* before changing Status. The API auto-posts an audit comment too — yours is the reasoning one. |
| **Effort** | Low · Medium · High (GitHub default Effort field). Set on every task. If a task feels bigger than High, consider splitting it. |
| **Labels** | Use GitHub labels. Standard labels are created by \`POST /v1/github/project/bootstrap\`. Add them to issues via \`PATCH /v1/github/issue/:number { "labels": ["has-migration"] }\`. |
| **Task repo** | Tasks (issues) live only in the workspace's tracking repo (\`github_repo\`), so task numbers are unique. Code repos link their PRs with \`Closes <tracking-repo>#<number>\`. If a number ever exists in several repos, task routes return 409 — pass \`?repo=owner/repo\`. |
| **Git Branch** | Set on the task after creating the branch: \`PATCH /v1/task/:ref { "field": "Git Branch", "value": "..." }\`. |
| **Pull Request** | Set on the task after opening the PR: \`PATCH /v1/task/:ref { "field": "Pull Request", "value": "https://github.com/..." }\`. |
| **Review round** | Incremented by the reviewer before sending a task back. \`PATCH /v1/task/:ref { "field": "Review round", "value": "2" }\`. |
| **Icebox** | Parked work. Ignore unless a human names it explicitly. \`GET /v1/task/list\` excludes Icebox by default. |
| **Priority** | Urgent · High · Medium · Low (GitHub default Priority field). Set by ako (CTO). Do not change without explicit instruction. If something feels wrong, comment on the task. |

## Standard Labels

Created automatically by \`POST /v1/github/project/bootstrap\`. Apply with \`PATCH /v1/github/issue/:number { "labels": [...] }\`.

| Label | When to use |
|---|---|
| \`has-migration\` | Task ships a DB schema change — run migration before/after deploy |
| \`has-env-change\` | Task requires \`.env\` updates on the server before deploying |
| \`coding\` | Actively being implemented — add when moving to In Progress |
| \`reviewed\` | Code review passed |
| \`pending-merge\` | Review PR is open, awaiting merge |
| \`issue-persists\` | Major issue found — sent back to developer |
| \`hotfix\` | Fast-track critical production fix |
| \`need-info\` | Blocked on missing information before work can start |

## Git Rules

- **\`git add\`, \`git commit\`, \`git push\`, branch deletion** — seek explicit permission from the human before running any of these. Do not assume permission from context.
- **Never create branches via any API** — local \`git checkout -b\` only, after human approval.
- **Never commit on the root/default branch** — it is sacred. No exceptions.
- **Never skip hooks (\`--no-verify\`)** unless explicitly asked.

## Working Directory Rule

Before starting any workflow, every repo must have a clean working directory. If \`git status\` shows anything staged or unstaged, stop. Either finish the in-progress work or ask the human to park it as a WIP commit before continuing.

## Production Rule

Never deploy to production. Never SSH, restart services, or run server-side migrations. Deployment is human-only.
`

register('task-creation', 'Task Creation', `# Task Creation Workflow

Every piece of work starts as a task. A well-written task saves time for everyone — the developer knows what to build, the reviewer knows what to check, the tester knows what to validate.

---

## 1. Create the Task

\`\`\`http
POST /v1/task
{ "title": "Short descriptive title here" }
\`\`\`

Title rules:
- 9–12 words maximum.
- Describes the work clearly — no filler like "we need to", "please", "I want to".
- Describes the behaviour or outcome, not the implementation.

**Good:** \`Fix login redirect loop on expired sessions\`
**Bad:** \`We need to fix the issue where users get stuck in a redirect loop\`

On GHP the issue number is assigned automatically. On Notion the unique_id increments automatically. Neither needs a prefix in the title.

---

## 2. Write the Description

A good description answers three questions: **what**, **why**, and **acceptance criteria**.

On GHP, set it in the issue body at creation:

\`\`\`http
POST /v1/task
{
  "title": "Fix login redirect loop on expired sessions",
  "body_text": "What: ...\\nWhy: ...\\nAcceptance Criteria:\\n- ..."
}
\`\`\`

Or update it after creation by editing the issue body:

\`\`\`http
PATCH /v1/github/issue/:number
{ "body": "What: ...\\nWhy: ...\\nAcceptance Criteria:\\n- ..." }
\`\`\`

---

## 3. Set Effort

\`\`\`http
PATCH /v1/task/:ref
{ "field": "Effort", "value": "Medium" }
\`\`\`

| Effort | Meaning |
|---|---|
| Low | Small — straightforward, well-understood |
| Medium | Meaningful work, some unknowns |
| High | Large or uncertain — touches multiple areas; consider splitting |

---

## 4. Set Priority

\`\`\`http
PATCH /v1/task/:ref
{ "field": "Priority", "value": "Medium" }
\`\`\`

Priority is set by ako. Default to Medium if not specified.

---

## 5. Add Labels/Tags (if applicable)

GHP: \`PATCH /v1/github/issue/:number { "labels": ["has-migration"] }\`
Notion: \`PATCH /v1/task/:ref { "field": "Tags", "value": "has-migration" }\`

- \`has-migration\` — task ships a DB schema change
- \`has-env-change\` — task requires \`.env\` updates

---

## Checklist Before Leaving Backlog

- [ ] Title is 9–12 words, clear intent
- [ ] Description answers: what, why, acceptance criteria
- [ ] Relevant docs or designs linked
- [ ] Effort set
- [ ] Priority set
- [ ] \`has-migration\` or \`has-env-change\` labels added if known
`)

register('development', 'Development', `# Development Workflow

There can be multiple repos in a workspace. The "developer" or "dev" is the human instructing you to complete a task.

---

## 1. Pick Up a Task

Human tells you the task number. Before anything:
- Verify all repos are on the root branch with a clean working directory. If not, stop and ask.

\`\`\`http
GET /v1/task/:ref
\`\`\`

Read the description and all comments. If anything is unclear, comment and move back to Up Next:

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Question before starting: ..." }
\`\`\`

Assign to developer:

\`\`\`http
PATCH /v1/task/:ref/assign
{ "assignees": ["github-login"] }
\`\`\`

---

## 2. Set Up the Branch

Suggest a branch name. After human approves:

\`\`\`bash
git checkout -b <branch-name>
\`\`\`

Set it on the task:

\`\`\`http
PATCH /v1/task/:ref
{ "field": "Git Branch", "value": "<branch-name>" }
\`\`\`

Pattern: \`<root>_<milestone>_<No.>-short-name\` or \`<root>_<No.>-short-name\` for standalone tasks.

---

## 3. Move to In Progress

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Starting implementation. Branch: <branch-name>." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "In Progress" }
\`\`\`

---

## 4. Implement

Follow workspace coding standards. If the task needs a DB migration add \`has-migration\` label. If \`.env\` changes needed add \`has-env-change\`.

---

## 5. Test

Post manual testing instructions as a comment, then ask developer to test:

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Testing instructions: 1. ... 2. ... Expected: ..." }
\`\`\`

When developer confirms — a screenshot must be attached. No task moves forward without it.

---

## 6. Commits

Agent never commits. Propose the commit message; human stages and commits:

\`\`\`
type(scope): short description

#<issue-number> — Task title
What changed and why.

<issue-url>
\`\`\`

After commit, post hash as comment:

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Committed: abc1234\\nhttps://github.com/org/repo/commit/abc1234" }
\`\`\`

---

## 7. Push and Open a PR

Agent never pushes. After human pushes:

\`\`\`http
POST /v1/github/pr
{
  "title": "Concise title under 70 chars",
  "head": "<branch-name>",
  "body_text": "Closes <tracking-repo>#<issue-number>.\\n\\n<description>"
}
\`\`\`

Use the full form \`Closes <owner>/<tracking-repo>#<issue-number>\` — the task lives in the workspace tracking repo, which is often not the repo the PR is in. A bare \`Closes #N\` in another repo would link to the wrong issue.

Post PR URL on the task:

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "PR opened: https://github.com/org/repo/pull/<number>" }
\`\`\`

---

## 8. Move to Pending Review

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Ready for review. Testing: 1. ... Expected: ..." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Pending Review" }

PATCH /v1/task/:ref
{ "field": "Pull Request", "value": "https://github.com/org/repo/pull/<number>" }
\`\`\`

For resubmissions, increment Review round first:

\`\`\`http
PATCH /v1/task/:ref
{ "field": "Review round", "value": "<incremented>" }
\`\`\`

---

## 9. Switch Back to Root Branch

\`\`\`bash
git checkout <root-branch>
\`\`\`
`)

register('review', 'Review', `# Review Workflow

Reviews are picked up from **Pending Review**, ordered by issue number ascending (lowest first) unless told otherwise. A review ends in **Approved** or **Issues Found**. All review work happens on a dedicated review branch — never on the root branch.

---

## 1. Prepare

All repos must have a clean working directory before starting.

---

## 2. Pick Up the Next Review

\`\`\`http
GET /v1/task/list?status=Pending+Review
\`\`\`

Pick the lowest issue number. Read the full task:

\`\`\`http
GET /v1/task/:ref
\`\`\`

**Before inspecting any diff**, check for manual testing instructions in the comments. If absent — automatic Issues Found. Comment asking for instructions and follow step 7.

---

## 3. Check PR State

\`\`\`http
GET /v1/github/pr/:number
\`\`\`

- **open** — proceed.
- **merged** — inspect code on target branch directly.
- **closed** (not merged) — flag for clarification.

---

## 4. Staleness Check

\`\`\`http
GET /v1/github/pr/base-check?base=<target-branch>&sha=<recorded-sha>
\`\`\`

If \`status: stale\` — base has moved. Note this; cut review branch from current tip.

---

## 5. Create the Review Branch

\`\`\`bash
git fetch origin
git switch -c review/<ref>-r<n>-<slug> origin/<target-branch>
git rev-parse origin/<target-branch>   # record base SHA
\`\`\`

Post comment:

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Review branch: review/<...>  Base SHA: <sha>  Round: <n>" }
\`\`\`

---

## 6. Inspect the Diff

\`\`\`bash
git merge --no-ff --no-commit origin/<developer-branch>
\`\`\`

Check: acceptance criteria met, no regressions, existing patterns followed, \`has-migration\` / \`has-env-change\` labels handled. Minor fixes: edit on review branch, human stages and commits.

---

## 7. Outcome: Issues Found

\`\`\`bash
git merge --abort
git switch <root-branch>
git branch -D review/<ref>-r<n>-<slug>
\`\`\`

\`\`\`http
PATCH /v1/task/:ref
{ "field": "Review round", "value": "<new_round>" }

POST /v1/task/:ref/comment
{ "text": "Review round <n>: [describe the issue]" }

PATCH /v1/task/:ref/assign
{ "assignees": ["developer-login"] }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Up Next" }
\`\`\`

Also add a review comment on the GitHub PR.

---

## 8. Outcome: Approved

Human pushes the review branch. Create review PR (supersedes original):

\`\`\`http
POST /v1/github/pr
{
  "head": "review/<ref>-r<n>-<slug>",
  "base": "<target-branch>",
  "title": "<original title>",
  "body_text": "Base SHA at review start: <sha>",
  "supersedes": <original-pr-number>
}
\`\`\`

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Review passed (round <n>). Review PR: #<new-pr>. Moving to Awaiting Deployment." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Awaiting Deployment" }
\`\`\`

---

## Labels Reference

| Label | Meaning |
|---|---|
| \`reviewed\` | Code review passed |
| \`pending-merge\` | Review PR open, awaiting merge |
| \`issue-persists\` | Major issue found, sent back |
| \`has-migration\` | Ships a DB schema change |
| \`has-env-change\` | Requires \`.env\` updates |
`)

register('hotfix', 'Hotfix', `# Hotfix Workflow

Fast-track path for critical production issues only. Use when: system down, data loss, security issue, complete feature failure. Use the normal workflow for everything else.

---

## 1. Create the Task

\`\`\`http
POST /v1/task
{ "title": "Hotfix: short description", "body_text": "<full bug details>" }

PATCH /v1/task/:ref
{ "field": "Priority", "value": "Urgent" }

PATCH /v1/task/:ref
{ "field": "Status", "value": "In Progress" }
\`\`\`

---

## 2. Create the Branch

Cut directly from root branch:

\`\`\`bash
git checkout <root-branch> && git pull
git checkout -b <root-branch>_<ref>-hotfix-short-description
\`\`\`

Confirm name with human first. Set on task:

\`\`\`http
PATCH /v1/task/:ref
{ "field": "Git Branch", "value": "<branch-name>" }
\`\`\`

---

## 3. Implement, Review, Deploy

Keep the change minimal — no refactors. Fast review (does it fix the issue? does it introduce risk?). Skip the normal review queue — merge immediately on approval. Follow deployment workflow. Human deploys.

---

## 4. Close Out

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Hotfix verified in production. No regressions." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Completed" }
\`\`\`
`)

register('deployment', 'Deployment', `# Deployment Workflow

> ⛔ Deployment is human-only. Agent never SSHs, restarts services, or runs server-side migrations.

---

## 1. Check the Task

\`\`\`http
GET /v1/task/:ref
\`\`\`

Verify \`reviewed\` label is present. Note \`has-migration\` and \`has-env-change\` labels.

---

## 2. Pre-Deploy

**\`has-env-change\`**: human SSHs and updates \`.env\` before deploying.
**\`has-migration\`**: human runs the migration command before or after deploy per project conventions.

---

## 3. Deploy

Human performs the deploy per project infrastructure docs.

---

## 4. Post-Deploy

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Deployed to production. [migration run / env updated / etc.]" }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Testing" }
\`\`\`

---

## 5. If Deploy Fails

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Deployment failed: [what went wrong]" }

PATCH /v1/task/:ref/assign
{ "assignees": ["developer-login"] }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Up Next" }
\`\`\`
`)

register('testing', 'Testing', `# Testing Workflow

After deployment, tasks move to **Testing**. Validates the implementation in the deployed environment against acceptance criteria. Testing is performed by a human; the agent supports by reading the task and updating status.

---

## 1. Know What to Test

\`\`\`http
GET /v1/task/:ref
\`\`\`

Read the acceptance criteria and the developer's testing instructions from comments. Confirm \`has-migration\` / \`has-env-change\` were handled at deploy time.

---

## 2. Outcome: Issues Found

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Testing: [what was tested and what failed]" }

PATCH /v1/task/:ref/assign
{ "assignees": ["developer-login"] }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Up Next" }
\`\`\`

Screenshot required — do not report without one.

---

## 3. Outcome: All Good

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Testing passed. Moving to Pending Acceptance." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Pending Acceptance" }
\`\`\`

Screenshot required.

---

## 4. Pending Acceptance → Completed

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Accepted by [stakeholder]. Marking completed." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Completed" }
\`\`\`
`)

register('planning', 'Planning', `# Planning Workflow

XP + Kanban, continuous flow. No sprints. Priority is set by ako (CTO) — do not reprioritise without instruction.

---

## Backlog Standards

A task in **Backlog** is ready to be pulled, by definition:
- Title 9–12 words, clear intent
- Description: what, why, acceptance criteria
- Effort set (Low / Medium / High)
- Linked to milestone where applicable

Shape tasks in **Planning**. Move to **Backlog** only when nothing further is needed before someone starts.

---

## Key Operations

**Check backlog health:**
\`\`\`http
GET /v1/task/list?status=Backlog
GET /v1/task/list?status=Planning
\`\`\`

**Flag a task missing info:**
\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Missing acceptance criteria — needs detail before this can be picked up." }
\`\`\`

**Confirm branch name and move to Up Next:**
\`\`\`http
PATCH /v1/task/:ref
{ "field": "Git Branch", "value": "main_auth_0071-token-refresh" }

POST /v1/task/:ref/comment
{ "text": "Ready to be picked up. Moving to Up Next." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Up Next" }
\`\`\`

**Assign:**
\`\`\`http
PATCH /v1/task/:ref/assign
{ "assignees": ["github-login"] }
\`\`\`

**Escalate priority concern:**
\`\`\`http
POST /v1/task/:ref/comment
{ "text": "This may need to be elevated — [reason]. Flagging for ako." }
\`\`\`
`)

register('bug-reporting', 'Bug Reporting', `# Bug Reporting Workflow

Bugs are tasks — same status flow, same rules. The difference is in required fields.

---

## 1. Create the Bug Task

\`\`\`http
POST /v1/task
{
  "title": "Short description of the broken behaviour",
  "body_text": "<full bug description — see format below>"
}

PATCH /v1/task/:ref
{ "field": "Priority", "value": "High" }
\`\`\`

Title: describe the broken behaviour, not the fix.

---

## 2. Required Description Fields

- **Environment**: production / staging / local, browser, OS, version
- **Steps to Reproduce**: numbered, exact
- **Actual Behaviour**
- **Expected Behaviour**
- **Severity**: Critical / High / Medium / Low
- **Acceptance Criteria**: what does fixed look like?

---

## 3. Attach Evidence

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Error from server log:\\n\\\`\\\`\\\`\\n[paste excerpt]\\n\\\`\\\`\\\`" }
\`\`\`

---

## 4. Critical Bugs

Skip the backlog queue. Notify immediately:

\`\`\`http
POST /v1/slack/notify
{ "text": "Critical bug filed: #<ref> — <title>. Needs immediate attention." }
\`\`\`
`)

register('release', 'Release', `# Release Workflow

Groups completed tasks into a named version, produces a changelog, communicates what shipped.

---

## 1. Identify What's in the Release

\`\`\`http
GET /v1/task/list?status=Completed
\`\`\`

Do not include tasks still in Pending Acceptance.

---

## 2. Write the Changelog

\`\`\`
## v1.4.0 — 2026-09-20

### Features
- Add CSV export to reports dashboard (#64)

### Fixes
- Fix login redirect loop for admin users (#58)

### Infrastructure
- Migrate users table to add role column (#60)
\`\`\`

---

## 3. Tag the Release (human only)

\`\`\`bash
git tag v1.4.0 && git push origin v1.4.0
\`\`\`

---

## 4. Comment on Each Task

\`\`\`http
POST /v1/task/:ref/comment
{ "text": "Included in release v1.4.0." }
\`\`\`
`)

register('onboarding', 'Onboarding', `# Onboarding Workflow

What a new developer needs before picking up their first task.

---

## 1. Read First

\`\`\`http
GET https://arxysapis.arxoft.com/v1/rules
GET https://arxysapis.arxoft.com/v1/workflow/list
\`\`\`

Then read the project README.

---

## 2. Set Up API Access

Copy \`api/.env.arxys.example\` to your project root as \`.env.arxys\`:

\`\`\`
ARXYS_API_KEY=axk_...
ARXYS_WORKSPACE=<workspace-slug>
\`\`\`

Verify:

\`\`\`http
GET /v1/task/list
X-Api-Key: axk_...
X-Workspace: <slug>
\`\`\`

---

## 3. Understand the Board

\`\`\`http
GET /v1/task/list
\`\`\`

Ask questions as comments on the relevant task — not in chat. Comments are the record.

---

## 4. Pick Up Your First Task

\`\`\`http
GET https://arxysapis.arxoft.com/v1/workflow/development
\`\`\`

When in doubt — read the task, read the comments, read the existing code. Ask before assuming.
`)

// ---------------------------------------------------------------------------
// Steering example content
// ---------------------------------------------------------------------------

const STEERING_CONTENT = `# arxys — Agent Instructions (API Edition)

**arxys** is the Arxoft workspace management API. It wraps GitHub Projects, Notion, and GitHub operations behind a single authenticated HTTP interface.

The canonical version of this file is always available at:

\`\`\`http
GET https://arxysapis.arxoft.com/v1/steering
\`\`\`

Fetch it if you suspect your local copy is outdated.

---

## Before Starting Any Task or PR Work

**Always fetch the relevant workflow first. Do not proceed without reading it.**

\`\`\`http
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
\`\`\`

For the full rules (git, production, task conventions):

\`\`\`http
GET https://arxysapis.arxoft.com/v1/rules
\`\`\`

For a list of all available workflows:

\`\`\`http
GET https://arxysapis.arxoft.com/v1/workflow/list
\`\`\`

These endpoints require no authentication.

---

## API

**Base URL:** \`https://arxysapis.arxoft.com\`
**Full reference:** \`GET https://arxysapis.arxoft.com/\` — returns all endpoints, parameters, and auth details.

### Authentication

Every \`/v1/*\` request (except \`/v1/workflow/*\`, \`/v1/rules\`, \`/v1/steering\`) requires:

\`\`\`
X-Api-Key:   axk_...          # your personal arxys key
X-Workspace: <workspace-slug> # e.g. arxoft-main, alqada, sensei
\`\`\`

---

## Unified Task Abstraction

Use \`/v1/task\` for all task operations — it works regardless of whether the workspace uses GHP or Notion:

\`\`\`http
GET    /v1/task/list              ?mine=1  ?icebox=1  ?status=In+Progress
GET    /v1/task/:ref
POST   /v1/task                  { "title": "..." }
PATCH  /v1/task/:ref             { "field": "Status", "value": "In Progress" }
PATCH  /v1/task/:ref/assign      { "assignees": ["login"] }
PATCH  /v1/task/:ref/unassign    { "assignees": ["login"] }
POST   /v1/task/:ref/comment     { "text": "..." }
\`\`\`

\`:ref\` = GitHub issue number for GHP workspaces, Notion unique_id No. for Notion workspaces.

Status changes automatically post an audit comment and fire Slack. \`repo\` is never required — defaults to workspace primary repo.

---

## Pull Requests

\`\`\`http
GET    /v1/github/pr/list
GET    /v1/github/pr/:number
GET    /v1/github/pr/:number/files
GET    /v1/github/pr/:number/status
GET    /v1/github/pr/base-check?base=main&sha=<sha>
POST   /v1/github/pr    { "title": "...", "head": "branch", "body_text": "...", "supersedes"?: number }
POST   /v1/github/pr/:number/merge   { "method": "squash" }
POST   /v1/github/pr/:number/review  { "action": "approve" }
\`\`\`

\`supersedes\` closes the original PR and cross-links it automatically.

---

## Git Repos in This Workspace

<!-- List all repos, their root/default branch, and any notes. -->

| Repo path | Root / default branch | Notes |
|-----------|-----------------------|-------|
| \`.\`       | \`main\`                |       |

---

## Status Flow

\`\`\`
Planning → Backlog → Up Next → In Progress → Pending Review → Awaiting Deployment → Testing → Pending Acceptance → Completed
\`\`\`

Side states: **Icebox** (parked), **Cancelled** (terminal).

---

## Hard Rules (summary — full version at /v1/rules)

- Never \`git add\`, \`git commit\`, \`git push\`, or delete branches without explicit permission from the human.
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
_See other steering files in \`.kiro/steering/\` for language and framework conventions._

### Deploy Process
_Refer to project README or infrastructure docs._

### Notes
_None._
`
