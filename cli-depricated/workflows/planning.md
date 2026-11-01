# Planning Workflow

## Overview

This team follows **Extreme Programming + Kanban** with a simplified lifecycle. There are no sprints, no planning ceremonies, and no fixed cadence. Work flows continuously — tasks are pulled from the backlog into **Up Next** as capacity becomes available.

**Priority is set by Asif (ako), CTO.** Developers do not reprioritise tasks unilaterally. If something seems misaligned, raise it in a Notion comment on the task.

---

## 1. Backlog Health (Continuous)

Work is shaped in **Planning**, and only moves to **Backlog** once it meets these standards — a task in **Backlog** is ready to be pulled, by definition:

- Title is 9–12 words, clear intent — see `notion workflow show task-creation`
- Description answers: what, why, acceptance criteria
- Effort points are set (Fibonacci 1–13)
- Linked to a milestone where applicable

Shaping a task — writing its acceptance criteria, sizing it, splitting it out of an epic — is what **Planning** is for. Moving a task from Planning to Backlog is the moment you are asserting it needs nothing further before someone can start.

```bash
notion task list --filter Status "Backlog"
notion task show <No.>
```

Flag tasks that are missing information with a comment rather than moving them forward:

```bash
notion comment add <No.> "Missing acceptance criteria — needs detail before this can be picked up."
```

---

## 2. Milestones

Milestones group related tasks under a shared goal (a feature area, an infrastructure change, a product release). Use them as much as possible — standalone tasks are the exception, not the rule.

When creating tasks, link them to a milestone:
- Set the `Branch Name` to follow the lineage pattern: `<root-branch>_<milestone>_<No.>-task-name`
- Reference the milestone in the task description

A milestone task on the board represents the parent goal. Its child tasks are the individual units of work.

---

## 3. Setting Priority

Priority is set by ako. Values: **Critical · High · Medium · Low**

```bash
notion task update <No.> Priority "High"
```

Developers should not change priority without explicit instruction from ako. If a task feels more urgent than its current priority, leave a comment:

```bash
notion comment add <No.> "This may need to be elevated — [reason]. Flagging for ako."
```

---

## 4. Confirm Branch Names

Every task moving into **Up Next** must have a `Branch Name` property populated. The name is confirmed by a human — never auto-generated.

Branch naming pattern:
```
<root-branch>_<milestone>_<No.>-short-task-name    ← preferred
<root-branch>_<No.>-short-task-name                ← standalone only
```

```bash
notion task update <No.> "Branch Name" "main-master_auth_0071-token-refresh"
# e.g. for a project with root branch 'main': main_auth_0071-token-refresh
```

---

## 5. Move to Up Next

When a task is ready and capacity exists, add a comment before changing status:

```bash
notion comment add <No.> "Ready to be picked up. Moving to Up Next."
notion task update <No.> Status "Up Next"
```

---

## 6. Assign

Assign to the developer picking it up:

```bash
notion task assign <No.> "developer@example.com"
```

---

## Useful Filters

```bash
# What's ready to be picked up
notion task list --filter Status "Up Next"

# Full backlog
notion task list --filter Status "Backlog"

# By priority
notion task list --filter Priority "Critical"

# Assigned to a specific developer
notion task list --filter "Assigned To" "developer@example.com"
```

---

## Status Flow

`Planning → Backlog → Up Next`
