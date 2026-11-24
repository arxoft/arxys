# Development Workflow

There can be multiple repos in a workspace. The "developer" or "dev" is the human instructing you to complete a task.

---

## 1. Pick Up a Task

Human tells you the task number to start.

Before anything else:
- Verify all repos are on the root branch with a clean working directory. If not, stop and ask the developer how they want to proceed.

Fetch the task:

```http
GET /v1/task/:ref
```

Read the description and all comments for context. If anything is unclear, post a comment before starting:

```http
POST /v1/task/:ref/comment
{ "text": "Question before starting: ..." }
```

Then move it back to `Up Next` with label/tag `need-info` and wait.

Assign the task to the developer:

```http
PATCH /v1/task/:ref/assign
{ "assignees": ["github-login"] }     ← GHP: GitHub login
{ "assignees": ["user@email.com"] }   ← Notion: email
```

---

## 2. Set Up the Branch

Branch naming: `<root-branch>_<milestone>_<No.>-short-task-name` or `<root-branch>_<No.>-short-task-name` for standalone tasks.

`<No.>` is the task's issue number, zero-padded to 4 digits (#71 → `0071`). Example: issue #71 in milestone `auth` → `main_auth_0071-token-refresh`.

Suggest a branch name. After human approves, create it locally:

```bash
git checkout -b <branch-name>
```

Never create branches via any API. Never push directly to the root branch.

Set the Git Branch field on the task:

```http
PATCH /v1/task/:ref
{ "field": "Git Branch", "value": "<branch-name>" }
```

---

## 3. Move to In Progress

Comment first, then update status:

```http
POST /v1/task/:ref/comment
{ "text": "Starting implementation. Branch: <branch-name>." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "In Progress" }
```

On GHP, also add the `coding` label:

```http
PATCH /v1/github/issue/:number
{ "labels": ["coding"] }
```

---

## 4. Implement

Follow the workspace's coding standards from the steering docs.

- If the task needs a DB migration: add label/tag `has-migration`.
- If `.env` changes are needed: document what changed and add label/tag `has-env-change`.

---

## 5. Test

After coding, post manual testing instructions as a comment:

```http
POST /v1/task/:ref/comment
{ "text": "Testing instructions: 1. ... 2. ... Expected: ..." }
```

Ask the developer to test. Make further changes if issues are reported.

When the developer confirms the task is complete, a screenshot must be attached as a comment showing the working result. No task moves forward without it.

---

## 6. Commits

The agent never commits. Propose the commit message; the human stages and commits.

Commit message format:
```
type(scope): short description

#<issue-number> — Task title
What changed and why.

<issue-url>
```

After the human commits, get the hash from `git log`, confirm it matches the right message, then post it as a comment:

```http
POST /v1/task/:ref/comment
{ "text": "Committed: abc1234 — <commit message>\nhttps://github.com/org/repo/commit/abc1234" }
```

---

## 7. Push and Open a PR

The agent never pushes. After the human pushes, create the PR:

```http
POST /v1/github/pr
{
  "title": "Concise title under 70 chars",
  "head": "<branch-name>",
  "body_text": "Closes <tracking-repo>#<issue-number>.\n\n<description>"
}
```

Use the full form `Closes <owner>/<tracking-repo>#<issue-number>` — the task lives in the workspace tracking repo, which is often not the repo the PR is in. A bare `Closes #N` in another repo would link to the wrong issue.

Then post the PR URL as a comment on the task:

```http
POST /v1/task/:ref/comment
{ "text": "PR opened: https://github.com/org/repo/pull/<number>" }
```

---

## 8. Move to Testing

Post testing instructions (what to test, how to trigger, expected outcome), then update status:

```http
POST /v1/task/:ref/comment
{ "text": "Ready for review. Testing: 1. ... 2. ... Expected: ..." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Testing" }
```

Remove the `coding` label if present. Set `Pull Request` field:

```http
PATCH /v1/task/:ref
{ "field": "Pull Request", "value": "https://github.com/org/repo/pull/<number>" }
```

**Resubmission after Issues Found**: if the task was previously reviewed and returned, increment `Review round` before moving back to Testing:

```http
PATCH /v1/task/:ref
{ "field": "Review round", "value": "<incremented>" }
```

---

## 9. Switch Back to Root Branch

```bash
git checkout <root-branch>
```

Do this in all repos in the workspace.
