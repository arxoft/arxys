# Review Workflow

## Overview

Reviews are picked up from tasks in **Pending Review**, ordered by PR number ascending (lowest first) — unless explicitly told otherwise.

A review ends in one of two outcomes: **Approved** or **Issues Found**.

All review work happens on a dedicated **review branch** — never on the root branch. This keeps the root branch clean for hotfixes and parallel reviews at all times.

---

## 1. Prepare

Ensure git working directories are clean in all relevant repos:

```bash
git status
```

If the workspace has multiple repos (e.g. frontend + backend), run `git status` in each and ensure all are clean before starting.

---

## 2. Pick Up the Next Review

```bash
arxys notion task list --review-queue
```

This filters `Status = Pending Review`, topologically sorts by `Depends on` (dependencies first), and tie-breaks by PR number ascending. A task is blocked if its dependency is not yet in `Awaiting Deployment` or `Completed` — the command fails loudly in that case.

Alternatively, list manually:

```bash
arxys notion task list --filter Status "Pending Review"
```

Read the full task:

```bash
arxys notion task show <No.>
```

**Before inspecting any diff**, read all comments and check for manual testing instructions left by the developer. If no manual testing instructions are present, that is an automatic **Issues Found** — do not proceed to review. Leave a comment asking for testing instructions and follow the Issues Found steps.

---

## 3. Check PR State

Fetch the PR with `github pr show <number> --repo <owner/repo>`. Check the `state` field:

- **`open`** — proceed to step 4.
- **`merged`** — branch is already in main/master. Skip the review-branch protocol. Inspect the code directly on the target branch and fix any bugs in place.
- **`closed`** (not merged) — abandoned PR. Flag for clarification before proceeding; do not review.

---

## 4. Create the Review Branch

**Never merge into a root branch. Never review inside a working tree that already has an in-progress merge.**

Determine the review round from the task's `Review round` property. Construct the branch name:

```
review/<task_no>-r<review_round>-<slug>
```

where `slug` is the task title in kebab-case, truncated to 40 characters.

Example: `review/123-r1-fix-login-redirect-on-oauth`

Cut the branch from the **fetched remote target** — never from a local ref:

```bash
git fetch origin
git switch -c review/<task_no>-r<review_round>-<slug> origin/<target-branch>
```

Record the base SHA immediately:

```bash
git rev-parse origin/<target-branch>
# e.g. → a3f9c1d
```

Post a Notion comment recording the branch and base SHA:

```bash
arxys notion comment add <No.> "Review branch: review/<...>  Base SHA: <sha>  Round: <n>"
```

The base SHA must also appear in the new PR body when the branch is pushed (see step 8).

---

## 5. Inspect the Diff

Merge the developer's branch into the review branch in `--no-commit` mode so the diff is staged for inspection:

```bash
git merge --no-ff --no-commit origin/<developer-branch>
```

If the workspace has multiple repos, repeat steps 4–5 in each.

Things to check:

- Does the implementation match the acceptance criteria?
- Are there any regressions or unintended side effects?
- Does the code follow existing patterns (no new abstractions, no new packages without approval)?
- If tagged `has-migration` — is the migration file present and correct?
- If tagged `has-env-change` — are the env changes documented?

Minor issues (typos, formatting, small logic fixes):

- Fix the file directly on the review branch.
- The AI agent must **never** stage files — the human stages and commits on the review branch.

---

## 6. Conflict Resolution

If `git merge` reports a conflict:

- Open the conflicted file(s) and resolve manually.
- Duplicate additions (two PRs adding the same thing) — take the incoming version unless HEAD has a known improvement.
- All resolutions are committed on the review branch. The root branch is never touched.
- Do not abort unless the conflict is unresolvable without the developer's input — in that case, follow the Issues Found path (step 7) and abort the review branch.

---

## 7. Abort a Review

To abandon a review in progress (wrong order, unresolvable conflict, missing dependency):

```bash
git merge --abort          # only needed if a merge is in progress
git switch <root-branch>
git branch -D review/<task_no>-r<review_round>-<slug>
```

`git reset --hard` is **not** used in this workflow. The review branch is disposable; the root branch is never modified.

---

## 8. Outcome: Issues Found

If a significant issue is found, or if testing instructions were absent:

1. Abort and delete the review branch (step 7).
2. Increment the `Review round` on the task:

```bash
arxys notion task update <No.> "Review round" <new_round>
```

3. Record the issue and reassign:

```bash
arxys notion comment add <No.> "Review round <n>: [describe the issue clearly]"
arxys notion task update <No.> Tags "issue-persists"
arxys notion task update <No.> "Assigned To" "<developer-email>"
arxys notion task update <No.> Status "Up Next"
```

4. Add a review comment on the GitHub PR describing the issue.

The discarded review branch is not reused. The developer will open a new PR (or push to the existing branch); the next review starts a new `review/<...>-r<n>` branch.

---

## 9. Outcome: Approved

If the review passes:

1. Commit any in-review fixes on the review branch. Propose a commit message; the human stages and commits.

2. Propose the push command — the human pushes:

```bash
git push -u origin review/<task_no>-r<review_round>-<slug>
```

3. Create a new PR from the review branch into the original target branch. Include:
   - The base SHA recorded in step 4.
   - A "Supersedes #`<original-pr-number>`" reference in the body.

```bash
arxys github pr create \
  --repo <owner/repo> \
  --head review/<task_no>-r<review_round>-<slug> \
  --base <target-branch> \
  --title "<original title>" \
  --body "Supersedes #<original-pr>.\n\nBase SHA at review start: <sha>\n\n<body>"
```

Or use the `--supersedes` flag (which adds the cross-reference and closes the old PR automatically):

```bash
arxys github pr create \
  --repo <owner/repo> \
  --head review/<task_no>-r<review_round>-<slug> \
  --base <target-branch> \
  --title "<original title>" \
  --body "Base SHA at review start: <sha>" \
  --supersedes <original-pr-number>
```

4. Close the original PR with a comment pointing to the new one:

```bash
arxys github issue comment <original-pr-number> --repo <owner/repo> \
  "Superseded by #<new-pr-number>."
```

   *(If `--supersedes` was used above, this is done automatically.)*

5. Tag the task and move status:

```bash
arxys notion comment add <No.> "Review passed (round <n>). Review PR: #<new-pr-number>. Moving to Awaiting Deployment."
arxys notion task update <No.> Tags "reviewed"
arxys notion task update <No.> Tags "pending-merge"
arxys notion task update <No.> Status "Awaiting Deployment"
```

---

## 10. Staleness Check

Before starting a review (or at any point when a PR has been open a while), verify the base is not stale:

```bash
arxys review base-check <No.>
```

This fetches and verifies the recorded base SHA is still an ancestor of `origin/<target>`. If it reports `STALE`, re-cut the review branch from the current tip before proceeding.

---

## 11. Post-Review Status Transitions

These transitions are initiated by the human, not the agent:

- **Awaiting Deployment → UAT**: when the review PR (`review/<...>`) is merged into the target branch, whoever clears the `pending-merge` tag moves the task to `UAT`.
- **UAT → Completed**: when the change is accepted in UAT.

```bash
# On review PR merge:
arxys notion task update <No.> Tags ""   # remove pending-merge
arxys notion task update <No.> Status "UAT"

# On UAT acceptance:
arxys notion task update <No.> Status "Completed"
```

---

## Tags Reference

| Tag | Set by | Meaning |
|-----|--------|---------|
| `reviewed` | Reviewer | Code review passed; clear to deploy |
| `pending-merge` | Reviewer | Review PR is open; awaiting merge |
| `issue-persists` | Reviewer | Major issue found; sent back to developer |
| `has-migration` | Developer | Task ships a DB schema change; run migration before/after deploy |
| `has-env-change` | Developer | Task requires `.env` updates; update server `.env` before deploying |

---

## Status Flow

```
Pending Review → Awaiting Deployment   (approved — review PR opened)
Pending Review → Up Next              (issues found — back to developer)
Awaiting Deployment → UAT              (review PR merged; pending-merge cleared)
UAT → Completed                       (accepted in UAT)
```
