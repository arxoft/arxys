# Testing Workflow

## Overview

After a task is deployed to the server, it moves to **Testing**. This phase validates the implementation in the deployed environment against the original acceptance criteria.

Testing is performed by a human (QA or the person who deployed).

---

## 1. Know What to Test

Before testing, read the task:

```bash
notion task show <No.>
```

- Review the acceptance criteria in the task description.
- Read the manual testing instructions left by the developer in the comments (added before moving to Pending Review).
- Note any `has-migration` or `has-env-change` tags — confirm those were handled at deploy time.

---

## 2. Test in the Deployed Environment

Follow the testing instructions exactly:
- Use the steps the developer specified.
- Test the happy path and any edge cases mentioned.
- If the task is a bug fix — confirm the original bug is no longer reproducible.
- If the task is a feature — confirm it matches the acceptance criteria.

---

## 3. Outcome: Issues Found

If the deployed behaviour does not match expectations:

```bash
notion comment add <No.> "Testing: [describe what was tested and what failed]"
notion task update <No.> Tags "issue-persists"
notion task update <No.> "Assigned To" "<developer-email>"
notion task update <No.> Status "Up Next"
```

Be specific in the comment — include steps to reproduce the failure.

**A screenshot must be attached to the comment** clearly showing the issue. Do not report an issue without one.

---

## 4. Outcome: All Good

If everything looks correct:

```bash
notion comment add <No.> "Testing passed. Moving to Pending Acceptance."
notion task update <No.> Status "Pending Acceptance"
```

**A screenshot must be attached to the comment** clearly showing the passing result.

---

## 5. Pending Acceptance

The task waits here for stakeholder sign-off. Once approved by the stakeholder:

```bash
notion comment add <No.> "Accepted by [stakeholder]. Marking completed."
notion task update <No.> Status "Completed"
```

---

## Tags Reference

| Tag | When to add |
|-----|-------------|
| `issue-persists` | Testing failed; task sent back to developer |

---

## Status Flow

`Testing → Pending Acceptance`  (passed)
`Testing → Up Next`             (failed)
`Pending Acceptance → Completed`
