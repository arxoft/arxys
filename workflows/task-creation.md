# Task Creation Workflow

## Overview

Every piece of work starts as a Notion task. A well-written task saves time for everyone — the developer knows what to build, the reviewer knows what to check, and the tester knows what to validate.

---

## 1. Create the Task

```bash
notion task create --title "Short descriptive title here" --Status "Backlog" --Priority "Medium"
```

Title rules (from RULES.md):
- 9–12 words maximum.
- Describes the work clearly — no filler like "we need to", "please", "I want to".
- Do **not** type the task number. The CLI stamps `(No.)` onto the title right after the page is created, because the number does not exist until then.

**Good:** `Fix login redirect loop on expired sessions` → stored as `(34) Fix login redirect loop on expired sessions`
**Bad:** `We need to fix the issue where users get stuck in a redirect loop`

The number is in the title so that relation properties and @-mentions — which search titles, never the ID column — find the task when you type a number you already remember. The CLI hides the prefix wherever it prints a number beside the title. If a rename drops it, `notion task fix-titles` shows what drifted and `--apply` repairs it.

---

## 2. Write the Description

Every task must have a description. Open the task and set the Notes/Description property:

```bash
notion task update <No.> Notes "..."
```

A good description answers three questions:

**What** — What is the expected behaviour or deliverable?
**Why** — Why does this matter? What's broken or missing?
**Acceptance Criteria** — What does done look like? How will it be tested?

Example:
```
What: The login page redirects to /dashboard after a successful authentication.
Currently it redirects to / (homepage) for users with the "admin" role.

Why: Admin users are landing on the wrong page and navigating manually every time.

Acceptance Criteria:
- Admin users land on /dashboard after login.
- Non-admin users still land on /.
- Works for both new logins and session restores.
```

---

## 3. Link Relevant Docs

If specs, designs, or API docs exist for this work, reference them in the description:

```
See Figma design #42 and the endpoint spec in openapi.yaml section /auth/login.
```

---

## 4. Set Effort Points

```bash
notion task update <No.> Effort 3
```

| Points | Meaning                                           |
|--------|---------------------------------------------------|
| 1      | Trivial — config change, typo fix                 |
| 2      | Small — straightforward, well-understood          |
| 3      | Medium-small — some thought required              |
| 5      | Medium — meaningful work, some unknowns           |
| 8      | Large — complex, touches multiple areas           |
| 13     | Very large — high uncertainty; consider splitting |

If a task feels like 13 points, try to break it into smaller tasks first.

---

## 5. Add Tags (if applicable)

```bash
notion task update <No.> Tags "has-migration"
notion task update <No.> Tags "has-env-change"
```

Add these immediately if you already know the task will require them.

---

## 6. Checklist Before Leaving Backlog

- [ ] Title is 9–12 words, clear intent
- [ ] Description answers: what, why, acceptance criteria
- [ ] Relevant docs or designs are linked
- [ ] Effort points are set
- [ ] Priority is set
- [ ] `has-migration` or `has-env-change` tags added if known
