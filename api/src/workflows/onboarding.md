# Onboarding Workflow

## Overview

What a new developer needs to know before picking up their first task. Also useful as a checklist when setting up a new machine.

---

## 1. Read First

Before touching any code or tasks:

```http
GET https://arxysapis.arxoft.com/v1/rules
GET https://arxysapis.arxoft.com/v1/workflow/list
```

Then read the project's own README for the local dev stack, available commands, and service URLs.

---

## 2. Set Up arxys API Access

Every workspace needs two things in its `.env.arxys` (copy from `api/.env.arxys.example`):

```
ARXYS_API_KEY=axk_...
ARXYS_WORKSPACE=<workspace-slug>
```

Get your API key from the arxys admin UI (`arxysadmin.arxoft.com`). The workspace slug is the identifier for the specific project (e.g. `arxoft-main`, `alqada`).

Verify access:

```http
GET https://arxysapis.arxoft.com/auth/me
X-Session-Token: <your-token>
```

---

## 3. Verify Board Access

```http
GET https://arxysapis.arxoft.com/v1/task/list
X-Api-Key: axk_...
X-Workspace: <slug>
```

Should return the task list. If it errors, check that your API key and workspace slug are correct and that you have been added to the venture.

---

## 4. Set Up the Local Dev Stack

Refer to the project README for setup instructions. Common steps:
- Clone the repo(s)
- Install dependencies
- Copy `.env.example` → `.env` and fill in values
- Run the local dev server

---

## 5. Understand the Board

```http
GET /v1/task/list
```

Get familiar with the current state:
- What's In Progress?
- What's Up Next?
- Who is assigned to what?

Ask questions as comments on the relevant task — not in chat. Comments are the record.

```http
POST /v1/task/:ref/comment
{ "text": "Question: ..." }
```

---

## 6. Pick Up Your First Task

Read the development workflow before starting:

```http
GET https://arxysapis.arxoft.com/v1/workflow/development
```

When in doubt — read the task, read the comments, read the existing code. Ask before assuming.

---

## Key Conventions

| Rule | Detail |
|---|---|
| Comment before status change | Always explain why before updating Status |
| Branch names | Confirmed by human — never auto-created without approval |
| Never commit without instruction | Agent proposes commit messages; human commits |
| No new abstractions | Match existing code patterns exactly |
| Short titles | 9–12 words, describes the work clearly |
| Effort | Set Effort (Low / Medium / High) on every task |
