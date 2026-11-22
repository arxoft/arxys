# Planning Workflow

## Overview

This team follows **Extreme Programming + Kanban** with a simplified lifecycle. No sprints, no planning ceremonies, no fixed cadence. Work flows continuously — tasks are pulled from the backlog into **Up Next** as capacity becomes available.

**Priority is set by ako (CTO).** Do not reprioritise tasks unilaterally. If something feels misaligned, comment on the task.

---

## 1. Backlog Health (Continuous)

Work is shaped in **Planning**, and only moves to **Backlog** once it meets these standards — a task in **Backlog** is ready to be pulled, by definition:

- Title is 9–12 words, clear intent
- Description answers: what, why, acceptance criteria
- Effort set (Low / Medium / High)
- Linked to a milestone where applicable

Shaping a task — writing acceptance criteria, sizing it, splitting it — is what **Planning** is for. Moving a task from Planning to Backlog asserts it needs nothing further before someone can start.

```http
GET /v1/task/list?status=Backlog
GET /v1/task/:ref
```

Flag tasks missing information with a comment rather than moving them forward:

```http
POST /v1/task/:ref/comment
{ "text": "Missing acceptance criteria — needs detail before this can be picked up." }
```

---

## 2. Milestones

Milestones group related tasks under a shared goal. Use them as much as possible — standalone tasks are the exception.

When creating tasks, link to a milestone in the description and follow the branch naming lineage:
```
<root-branch>_<milestone>_<No.>-task-name
```

---

## 3. Setting Priority

```http
PATCH /v1/task/:ref
{ "field": "Priority", "value": "High" }
```

Values: **Urgent · High · Medium · Low**

Do not change priority without explicit instruction from ako. If a task feels more urgent, comment:

```http
POST /v1/task/:ref/comment
{ "text": "This may need to be elevated — [reason]. Flagging for ako." }
```

---

## 4. Confirm Branch Names

Every task moving into **Up Next** must have a `Git Branch` field populated. The name is confirmed by a human — never auto-generated without approval.

```http
PATCH /v1/task/:ref
{ "field": "Git Branch", "value": "main_auth_0071-token-refresh" }
```

Pattern:
```
<root-branch>_<milestone>_<No.>-short-name    ← preferred
<root-branch>_<No.>-short-name                ← standalone only
```

---

## 5. Move to Up Next

```http
POST /v1/task/:ref/comment
{ "text": "Ready to be picked up. Moving to Up Next." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Up Next" }
```

---

## 6. Assign

```http
PATCH /v1/task/:ref/assign
{ "assignees": ["github-login"] }
```

---

## Useful Filters

```http
GET /v1/task/list?status=Up+Next
GET /v1/task/list?status=Backlog
GET /v1/task/list?mine=1
```

---

## Status Flow

`Planning → Backlog → Up Next`
