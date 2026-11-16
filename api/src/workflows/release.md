# Release Workflow

## Overview

A release groups completed tasks into a named version, produces a changelog, and communicates what shipped to stakeholders. This happens after tasks reach **Completed**.

---

## 1. Identify What's in the Release

```http
GET /v1/task/list?status=Completed
```

Group by type:
- **Features** — new functionality
- **Fixes** — bug corrections
- **Improvements** — performance, UX, internal changes
- **Infrastructure** — migrations, env changes, dependency updates

Do not include tasks still in Pending Acceptance — wait for sign-off first.

---

## 2. Name the Release

Use semantic versioning (`MAJOR.MINOR.PATCH`) or date-based (`YYYY-MM-DD`) per project convention:

- **MAJOR** — breaking changes or significant new capabilities
- **MINOR** — new features, backward compatible
- **PATCH** — bug fixes, minor improvements

---

## 3. Write the Changelog

Format: `type: description (#ref)`

```
## v1.4.0 — 2026-09-20

### Features
- Add CSV export to reports dashboard (#64)
- Add role-based dashboard redirect on login (#71)

### Fixes
- Fix login redirect loop for admin users on expired sessions (#58)

### Improvements
- Reduce reports query time by 40% with index optimisation (#62)

### Infrastructure
- Migrate users table to add role column (#60)
```

---

## 4. Post the Changelog

Check the project README or infrastructure docs for where the changelog lives:
- `CHANGELOG.md` in the repo
- A linked Notion page
- A Slack announcement

---

## 5. Tag the Release in Git

Human does this after explicit instruction:

```bash
git tag v1.4.0
git push origin v1.4.0
```

---

## 6. Comment on Each Task

```http
POST /v1/task/:ref/comment
{ "text": "Included in release v1.4.0." }
```

---

## Notes

- If the release includes a `has-migration` task, confirm the migration was already run at deploy time.
- If the release includes a `has-env-change` task, confirm the server `.env` was updated before deploy.
