# Deployment Workflow

## Overview

> ⛔ Production deployment must only be performed by a human. The AI agent must never execute deployment steps — not SSH, not server restarts, not migrations on the server.

Tasks reach **Awaiting Deployment** after review passes. This workflow covers what to do before, during, and after deploying to production.

---

## 1. Check the Task

```bash
notion task show <No.>
```

Before deploying, verify:
- Task is tagged `reviewed`.
- If tagged `has-migration` — prepare to run the migration on the server.
- If tagged `has-env-change` — update `.env` on the server before deploying.

---

## 2. Pre-Deploy Checks

**If `has-env-change`:**
- SSH into the server.
- Update the `.env` file with the required changes (check task description and comments for details).
- Do this before deploying the code.

**If `has-migration`:**
- Know which migration command to run and when — before or after the deploy, depending on the project conventions.
- Check the project's infrastructure docs for the correct migration command.

---

## 3. Deploy

Refer to the project's infrastructure docs for the deployment procedure. Each project defines its own deploy steps.

Common steps may include:
- Pull the latest code on the server.
- Run the build step.
- Restart the application service.
- Run migrations (if `has-migration` and migration runs post-deploy).

---

## 4. Post-Deploy

After deploying, move the task to **Testing** and leave a comment:

```bash
notion comment add <No.> "Deployed to production. [Note anything relevant — migration run, env updated, etc.]"
notion task update <No.> Status "Testing"
```

---

## 5. If Deployment Fails

If the deploy fails or causes a regression:

```bash
notion comment add <No.> "Deployment failed: [describe what went wrong]"
notion task update <No.> Tags "issue-persists"
notion task update <No.> "Assigned To" "<developer-email>"
notion task update <No.> Status "Up Next"
```

Rollback if necessary, following project infrastructure docs.

---

## Tags Reference

| Tag | Check at deploy time |
|-----|----------------------|
| `has-migration` | Run migration on server before or after deploy |
| `has-env-change` | Update server `.env` before deploying |
| `reviewed` | Confirm this is present before deploying |

---

## Status Flow

`Awaiting Deployment → Testing`  (deployed successfully)
`Awaiting Deployment → Up Next`  (deployment failed)
