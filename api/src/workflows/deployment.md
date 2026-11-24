# Deployment Workflow

> ⛔ Production deployment must only be performed by a human. The agent must never execute deployment steps — not SSH, not server restarts, not migrations on the server.

Tasks reach **Deploying** after pre-deploy testing passes. Review and deploy happen together in this status. This workflow covers what to do before, during, and after deploying to production.

---

## 1. Check the Task

```http
GET /v1/task/:ref
```

Before deploying, verify:
- Task has `reviewed` label.
- If `has-migration` label — prepare to run the migration on the server.
- If `has-env-change` label — update `.env` on the server before deploying.

---

## 2. Pre-Deploy Checks

**If `has-env-change`:**
- SSH into the server (human does this).
- Update `.env` with the required changes (check task description and comments for details).
- Do this before deploying the code.

**If `has-migration`:**
- Know which migration command to run and when — before or after the deploy.
- Check the project's infrastructure docs for the correct command.

---

## 3. Deploy

Refer to the project's infrastructure docs. Human performs the deploy. Agent does nothing here.

---

## 4. Post-Deploy

After the human deploys:

```http
POST /v1/task/:ref/comment
{ "text": "Deployed to production. [Note anything relevant — migration run, env updated, etc.]" }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Testing" }
```

---

## 5. If Deployment Fails

```http
POST /v1/task/:ref/comment
{ "text": "Deployment failed: [describe what went wrong]" }

PATCH /v1/github/issue/:number
{ "labels": ["issue-persists"] }

PATCH /v1/task/:ref/assign
{ "assignees": ["developer-login"] }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Up Next" }
```

Rollback if necessary — human does this.

---

## Labels Reference

| Label | Check at deploy time |
|---|---|
| `has-migration` | Run migration on server before or after deploy |
| `has-env-change` | Update server `.env` before deploying |
| `reviewed` | Confirm present before deploying |

---

## Status Flow

`Deploying → Testing`  (deployed successfully; production testing)
`Deploying → Up Next`  (deployment failed)
