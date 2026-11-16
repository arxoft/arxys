# Testing Workflow

## Overview

After a task is deployed, it moves to **Testing**. This phase validates the implementation in the deployed environment against the original acceptance criteria.

Testing is performed by a human (QA or the person who deployed). The agent supports by reading the task, surfacing the testing instructions, and updating status based on the outcome.

---

## 1. Know What to Test

```http
GET /v1/task/:ref
```

- Review the acceptance criteria in the description.
- Read the developer's manual testing instructions left in comments before Pending Review.
- Note any `has-migration` or `has-env-change` labels — confirm those were handled at deploy time.

---

## 2. Test in the Deployed Environment

The human follows the developer's testing instructions exactly:
- Test the happy path and edge cases mentioned.
- Bug fix — confirm the original bug is no longer reproducible.
- Feature — confirm it matches the acceptance criteria.

---

## 3. Outcome: Issues Found

```http
POST /v1/task/:ref/comment
{ "text": "Testing: [describe what was tested and what failed]" }

PATCH /v1/github/issue/:number
{ "labels": ["issue-persists"] }

PATCH /v1/task/:ref/assign
{ "assignees": ["developer-login"] }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Up Next" }
```

A screenshot must be attached to the comment showing the issue. Do not report an issue without one.

---

## 4. Outcome: All Good

```http
POST /v1/task/:ref/comment
{ "text": "Testing passed. Moving to Pending Acceptance." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Pending Acceptance" }
```

A screenshot must be attached showing the passing result.

---

## 5. Pending Acceptance

Task waits here for stakeholder sign-off. Once approved:

```http
POST /v1/task/:ref/comment
{ "text": "Accepted by [stakeholder]. Marking completed." }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Completed" }
```

---

## Status Flow

```
Testing → Pending Acceptance   (passed)
Testing → Up Next              (failed)
Pending Acceptance → Completed
```
