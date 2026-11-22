# Hotfix Workflow

## Overview

A hotfix is a fast-track path for critical production issues. It intentionally bypasses parts of the normal workflow to minimise downtime.

**When to use:**
- Critical bug in production (data loss, security issue, system down, complete feature failure)
- Cannot wait for the normal cycle

**When NOT to use:**
- Medium/low priority issues — use the normal development workflow
- When a workaround exists and there's no urgency

---

## 1. Create the Hotfix Task

```http
POST /v1/task
{ "title": "Hotfix: short description of the issue" }
```

Then immediately set priority and status:

```http
PATCH /v1/task/:ref
{ "field": "Priority", "value": "Urgent" }

PATCH /v1/task/:ref
{ "field": "Status", "value": "In Progress" }
```

Add `hotfix` label:

```http
PATCH /v1/github/issue/:number
{ "labels": ["hotfix"] }
```

Write a full bug description (follow the bug-reporting workflow format).

---

## 2. Create the Hotfix Branch

Hotfixes are cut directly from the root branch:

```bash
git checkout <root-branch>
git pull
git checkout -b <root-branch>_<ref>-hotfix-short-description
```

Confirm the branch name with the human first. Then set it on the task:

```http
PATCH /v1/task/:ref
{ "field": "Git Branch", "value": "<branch-name>" }
```

---

## 3. Implement and Commit

Keep the change minimal and surgical — no refactors, no opportunistic improvements.

Propose commit message; human commits:

```
fix(scope): short description

#<issue-number> — Hotfix: task title
What was broken and what was changed to fix it.

<issue-url>
```

---

## 4. Review

Hotfixes still get reviewed — but fast. Reviewer focuses only on:
- Does the fix address the issue?
- Does it introduce any new risk?

If approved:

```http
POST /v1/task/:ref/comment
{ "text": "Hotfix reviewed and approved." }

PATCH /v1/github/issue/:number
{ "labels": ["reviewed"] }
```

Skip the normal review queue — merge immediately.

---

## 5. Deploy

Follow the deployment workflow. Human deploys.

After deployment:

```http
POST /v1/task/:ref/comment
{ "text": "Hotfix deployed to production. Monitoring for stability." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Testing" }
```

Monitor production after deploy.

---

## 6. Testing and Close

If stable:

```http
POST /v1/task/:ref/comment
{ "text": "Hotfix verified in production. No regressions observed." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Completed" }
```

If issues persist:

```http
POST /v1/task/:ref/comment
{ "text": "Hotfix did not resolve the issue: [details]" }

PATCH /v1/github/issue/:number
{ "labels": ["issue-persists"] }

PATCH /v1/task/:ref
{ "field": "Status", "value": "In Progress" }
```

---

## What's Different from Normal Flow

| Normal | Hotfix |
|---|---|
| Backlog → Up Next → In Progress | Created directly as In Progress |
| Branch from milestone or parent | Branch from root branch directly |
| Standard review queue (issue number order) | Fast-track review, skip queue |
| Normal deploy window | Deploy immediately after review |
| Full testing cycle | Targeted production verification |
