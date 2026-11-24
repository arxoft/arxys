# Testing Workflow

## Overview

**Testing** covers every kind of testing: peer, dev, stage and production. A task is in Testing twice — before it is deployed (peer, dev or stage testing, on the tester's own machine or a test environment) and after it is deployed (production testing). Labels record which environments have passed: `peer-tested`, `stage-tested`, `prod-tested`.

This phase validates the implementation against the original acceptance criteria.

Testing is performed by a human (QA or the person who deployed). The agent supports by reading the task, surfacing the testing instructions, and updating status based on the outcome.

---

## 1. Know What to Test

```http
GET /v1/task/:ref
```

- Review the acceptance criteria in the description.
- Read the developer's manual testing instructions left in comments before moving to Testing.
- Note any `has-migration` or `has-env-change` labels — confirm those were handled at deploy time.

---

## 2. Test in the Right Environment

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

**Before deploy** (peer, dev or stage): add the matching label (`peer-tested` / `stage-tested`) and move to Deploying.

```http
POST /v1/task/:ref/comment
{ "text": "Peer testing passed. Moving to Deploying." }

PATCH /v1/github/issue/:number
{ "labels": ["peer-tested"] }

PATCH /v1/task/:ref
{ "field": "Status", "value": "Deploying" }
```

**After deploy** (production): add `prod-tested` and move to Pending Acceptance.

```http
POST /v1/task/:ref/comment
{ "text": "Testing passed. Moving to Pending Acceptance." }

PATCH /v1/github/issue/:number
{ "labels": ["prod-tested"] }

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
Testing → Deploying            (passed before deploy)
Testing → Pending Acceptance   (passed in production)
Testing → Up Next              (failed)
Pending Acceptance → Completed
```
