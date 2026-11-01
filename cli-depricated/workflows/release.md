# Release Workflow

## Overview

A release groups completed tasks into a named version, produces a changelog, and communicates what shipped to stakeholders. This happens after tasks reach **Completed** status.

---

## 1. Identify What's in the Release

Query completed tasks since the last release:

```bash
notion task list --filter Status "Completed"
```

Group them by type:
- Features (new functionality)
- Fixes (bug corrections)
- Improvements (performance, UX, internal changes)
- Infrastructure (migrations, env changes, dependency updates)

---

## 2. Name the Release

Use semantic versioning (`MAJOR.MINOR.PATCH`) or a date-based version (`YYYY-MM-DD`), depending on project conventions.

- **MAJOR** — breaking changes or significant new capabilities
- **MINOR** — new features, backward compatible
- **PATCH** — bug fixes, minor improvements

---

## 3. Write the Changelog

Format each entry as: `type: description (No.X)`

```
## v1.4.0 — 2026-09-20

### Features
- Add CSV export to reports dashboard (No.64)
- Add role-based dashboard redirect on login (No.71)

### Fixes
- Fix login redirect loop for admin users on expired sessions (No.58)

### Improvements
- Reduce reports query time by 40% with index optimisation (No.62)

### Infrastructure
- Migrate users table to add role column (No.60)
```

---

## 4. Post the Changelog

Where the changelog lives depends on the project — check the project's README or infrastructure docs. Common locations:
- A `CHANGELOG.md` file in the repo
- A Notion page linked from the project's home
- A Slack/Teams announcement

---

## 5. Tag the Release in Git

```bash
git tag v1.4.0
git push origin v1.4.0
```

Only after explicit instruction from the user.

---

## 6. Update Notion Tasks

Add a comment on each task included in the release:

```bash
notion comment add <No.> "Included in release v1.4.0."
```

---

## Notes

- Don't release tasks that are still in **Pending Acceptance** — wait for stakeholder sign-off first.
- If a release includes a `has-migration` task, confirm the migration was already run on the server at deploy time.
- If a release includes a `has-env-change` task, confirm the server `.env` was updated before deploy.
