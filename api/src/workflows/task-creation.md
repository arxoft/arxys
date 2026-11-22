# Task Creation Workflow

Every piece of work starts as a task. A well-written task saves time for everyone — the developer knows what to build, the reviewer knows what to check, the tester knows what to validate.

---

## 1. Create the Task

```http
POST /v1/task
{ "title": "Short descriptive title here" }
```

Title rules:
- 9–12 words maximum.
- Describes the work clearly — no filler like "we need to", "please", "I want to".
- Describes the behaviour or outcome, not the implementation.

**Good:** `Fix login redirect loop on expired sessions`
**Bad:** `We need to fix the issue where users get stuck in a redirect loop`

On GHP the issue number is assigned automatically. On Notion the unique_id increments automatically. Neither needs a prefix in the title.

---

## 2. Write the Description

A good description answers three questions: **what**, **why**, and **acceptance criteria**.

On GHP, set it in the issue body at creation time via `body_text`:

```http
POST /v1/task
{
  "title": "Fix login redirect loop on expired sessions",
  "body_text": "What: ...\nWhy: ...\nAcceptance Criteria:\n- ..."
}
```

Or update it after creation by editing the issue body:

```http
PATCH /v1/github/issue/:number
{ "body": "What: ...\nWhy: ...\nAcceptance Criteria:\n- ..." }
```

**Example:**
```
What: The login page should redirect to /dashboard after successful auth.
Currently it redirects to / for admin users.

Why: Admin users land on the wrong page and navigate manually every time.

Acceptance Criteria:
- Admin users land on /dashboard after login.
- Non-admin users still land on /.
- Works for new logins and session restores.
```

---

## 3. Link Relevant Docs

If specs, designs, or API docs exist for this work, include them in the description or as a comment:

```http
POST /v1/task/:ref/comment
{ "text": "Spec: figma.com/file/abc. API contract: openapi.yaml section /auth/login." }
```

---

## 4. Set Effort Points

```http
PATCH /v1/task/:ref
{ "field": "Effort", "value": "3" }
```

| Points | Meaning |
|---|---|
| 1 | Trivial — config change, typo fix |
| 2 | Small — straightforward, well-understood |
| 3 | Medium-small — some thought required |
| 5 | Medium — meaningful work, some unknowns |
| 8 | Large — complex, touches multiple areas |
| 13 | Very large — high uncertainty; consider splitting |

If a task feels like 13, try to break it into smaller tasks first.

---

## 5. Set Priority

```http
PATCH /v1/task/:ref
{ "field": "Priority", "value": "Medium" }
```

Priority is set by ako. Default to Medium if not specified. Do not change priority without explicit instruction.

---

## 6. Add Labels/Tags (if applicable)

On GHP, use `PATCH /v1/github/issue/:number` with `{ "labels": ["has-migration"] }`.
On Notion: `PATCH /v1/task/:ref { "field": "Tags", "value": "has-migration" }`.

Add these immediately if you already know the task will require them:
- `has-migration` — task ships a DB schema change
- `has-env-change` — task requires `.env` updates

---

## Checklist Before Leaving Backlog

- [ ] Title is 9–12 words, clear intent
- [ ] Description answers: what, why, acceptance criteria
- [ ] Relevant docs or designs linked
- [ ] Effort points set
- [ ] Priority set
- [ ] `has-migration` or `has-env-change` labels/tags added if known
