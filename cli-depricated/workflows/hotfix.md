# Hotfix Workflow

## Overview

A hotfix is a fast-track path for critical production issues. It intentionally bypasses parts of the normal workflow to minimise downtime. The trade-off is speed over process — use it only when necessary.

**When to use a hotfix:**
- Critical bug in production (data loss, security issue, system down, complete feature failure)
- Cannot wait for the normal sprint cycle

**When NOT to use a hotfix:**
- Medium/low priority issues — use the normal development workflow
- When a workaround exists and there's no urgency

---

## 1. Create the Hotfix Task

```bash
notion task create --title "Hotfix: short description of the issue" --Status "In Progress" --Priority "Critical"
```

- Tag it immediately:
```bash
notion task update <No.> Tags "hotfix"
```

- Write a description with full bug details (follow the Bug Reporting workflow format).

---

## 2. Create the Hotfix Branch

Hotfixes are cut directly from the root branch, not from a milestone branch:

```bash
git checkout <root-branch>   # e.g. main-master, main, master — check the project
git pull
git checkout -b <root-branch>_<No.>-hotfix-short-description
```

Confirm the branch name with the human first, then populate `Branch Name` on the task:

```bash
notion task update <No.> "Branch Name" "<root-branch>_0099-hotfix-short-description"
```

---

## 3. Implement and Commit

- Fix the issue. Keep the change minimal and surgical — no refactors, no opportunistic improvements.
- Commit (with explicit instruction) using the standard message format:

```
fix(scope): short description

No.<No.> — Hotfix: task title
What was broken and what was changed to fix it.

https://app.notion.com/p/<task-url>
```

---

## 4. Review

Hotfixes still get reviewed — but fast. The reviewer focuses only on:
- Does the fix address the issue?
- Does it introduce any new risk?

If approved, skip the normal queue — merge immediately.

```bash
notion comment add <No.> "Hotfix reviewed and approved. Merging."
notion task update <No.> Tags "reviewed"
```

---

## 5. Deploy

Follow the deployment workflow. Note the urgency in the deploy comment:

```bash
notion comment add <No.> "Hotfix deployed to production. Monitoring for stability."
notion task update <No.> Status "Testing"
```

Monitor production after the deploy.

---

## 6. Testing and Close

Test the fix in production. If stable:

```bash
notion comment add <No.> "Hotfix verified in production. No regressions observed."
notion task update <No.> Status "Completed"
```

If issues persist:

```bash
notion comment add <No.> "Hotfix did not resolve the issue: [details]"
notion task update <No.> Tags "issue-persists"
notion task update <No.> Status "In Progress"
```

---

## What's Different from Normal Flow

| Normal | Hotfix |
|--------|--------|
| Backlog → Up Next → In Progress | Created directly as In Progress |
| Branch from milestone or parent | Branch from root branch directly |
| Standard review queue (PR order) | Fast-track review, skip queue |
| Normal deploy window | Deploy immediately after review |
| Full testing cycle | Targeted production verification |

---

## Status Flow

`In Progress → Pending Review → Awaiting Deployment → Testing → Completed`
(same flow, compressed timeline)
