# Review Workflow

## Overview

Reviews are picked up from tasks in **Pending Review**, ordered by issue number ascending (lowest first) — unless explicitly told otherwise.

A review ends in one of two outcomes: **Approved** or **Issues Found**.

All review work happens on a dedicated **review branch** — never on the root branch.

---

## 1. Prepare

Ensure git working directories are clean in all repos:

```bash
git status
```

If the workspace has multiple repos, run `git status` in each. All must be clean before starting.

---

## 2. Pick Up the Next Review

```http
GET /v1/task/list?status=Pending+Review
```

Tasks come back in project order. Pick the one with the lowest issue number unless told otherwise.

Read the full task:

```http
GET /v1/task/:ref
```

**Before inspecting any diff**, read all comments and check for manual testing instructions left by the developer. If no testing instructions are present, that is an automatic **Issues Found** — do not proceed. Comment asking for testing instructions and follow the Issues Found steps.

---

## 3. Check PR State

```http
GET /v1/github/pr/:number
```

Check the `state` field:

- **`open`** — proceed to step 4.
- **`merged`** — branch is already in the target. Skip the review-branch protocol. Inspect the code on the target branch directly.
- **`closed`** (not merged) — abandoned PR. Flag for clarification before proceeding.

---

## 4. Staleness Check

Before creating the review branch, verify the recorded base SHA is still current:

```http
GET /v1/github/pr/base-check?base=<target-branch>&sha=<recorded-sha>
```

If `status: stale` — the base has moved. Note this. The review branch will be cut from the current tip, not the recorded SHA.

---

## 5. Create the Review Branch

Determine the review round from the task's `Review round` field. Construct the branch name:

```
review/<No.>-r<review_round>-<slug>
```

where `<No.>` is the task's issue number zero-padded to 4 digits (#123 → `0123`) and `slug` is the task title in kebab-case, truncated to 40 characters.

Example: `review/0123-r1-fix-login-redirect-on-oauth`

Cut the branch from the fetched remote target — never from a local ref:

```bash
git fetch origin
git switch -c review/<No.>-r<n>-<slug> origin/<target-branch>
```

Record the base SHA:

```bash
git rev-parse origin/<target-branch>
```

Post a comment on the task recording the branch and base SHA:

```http
POST /v1/task/:ref/comment
{ "text": "Review branch: review/<...>  Base SHA: <sha>  Round: <n>" }
```

---

## 6. Inspect the Diff

Merge the developer's branch into the review branch in `--no-commit` mode:

```bash
git merge --no-ff --no-commit origin/<developer-branch>
```

Repeat in each repo if the workspace has multiple.

Check:
- Does the implementation match the acceptance criteria?
- Any regressions or unintended side effects?
- Does the code follow existing patterns? No new abstractions or packages without approval?
- If `has-migration` label — is the migration file present and correct?
- If `has-env-change` label — are the env changes documented?

Minor fixes (typos, small logic issues): fix directly on the review branch. The agent never stages — human stages and commits on the review branch.

---

## 7. Conflict Resolution

If `git merge` reports a conflict:
- Resolve manually in the conflicted files.
- Duplicate additions — take the incoming version unless HEAD has a known improvement.
- If unresolvable without the developer, follow Issues Found (step 8) and abort.

Do not use `git reset --hard`. The review branch is disposable; the root branch is never touched.

---

## 8. Abort a Review

```bash
git merge --abort        # only if a merge is in progress
git switch <root-branch>
git branch -D review/<No.>-r<n>-<slug>
```

---

## 9. Outcome: Issues Found

1. Abort and delete the review branch (step 8).
2. Increment `Review round`:

```http
PATCH /v1/task/:ref
{ "field": "Review round", "value": "<new_round>" }
```

3. Comment, add `issue-persists` label, reassign, move to `Up Next`:

```http
POST /v1/task/:ref/comment
{ "text": "Review round <n>: [describe the issue clearly]" }

PATCH /v1/github/issue/:number
{ "labels": ["issue-persists"] }

PATCH /v1/task/:ref/assign
{ "assignees": ["developer-login"] }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Up Next" }
```

4. Add a review comment on the GitHub PR describing the issue.

The discarded review branch is not reused. The developer opens a new PR; the next review starts a new `review/...-r<n>` branch.

---

## 10. Outcome: Approved

1. Commit any in-review fixes on the review branch. Propose the commit message; human stages and commits.

2. Human pushes the review branch.

3. Create the review PR, superseding the original:

```http
POST /v1/github/pr
{
  "head": "review/<No.>-r<n>-<slug>",
  "base": "<target-branch>",
  "title": "<original title>",
  "body_text": "Base SHA at review start: <sha>",
  "supersedes": <original-pr-number>
}
```

The `supersedes` flag cross-references and closes the original PR automatically.

4. Update task labels and move to `Awaiting Deployment`:

```http
POST /v1/task/:ref/comment
{ "text": "Review passed (round <n>). Review PR: #<new-pr-number>. Moving to Awaiting Deployment." }

PATCH /v1/github/issue/:number
{ "labels": ["reviewed", "pending-merge"] }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Awaiting Deployment" }
```

---

## 11. Post-Review Status Transitions

Initiated by the human, not the agent:

- **`Awaiting Deployment → Testing`**: after the review PR is merged, clear `pending-merge` and move to Testing.
- **`Testing → Pending Acceptance`**: testing passed.
- **`Pending Acceptance → Completed`**: stakeholder sign-off.

---

## Labels Reference

| Label | Set by | Meaning |
|---|---|---|
| `reviewed` | Reviewer | Code review passed |
| `pending-merge` | Reviewer | Review PR open, awaiting merge |
| `issue-persists` | Reviewer | Major issue found, sent back to developer |
| `has-migration` | Developer | Ships a DB schema change |
| `has-env-change` | Developer | Requires `.env` updates |
