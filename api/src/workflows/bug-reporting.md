# Bug Reporting Workflow

## Overview

Bugs are tasks — they go through the same status flow and follow the same task creation rules. The difference is in required fields: a bug report must include enough detail to reproduce the issue without back-and-forth.

---

## 1. Create the Bug Task

```http
POST /v1/task
{
  "title": "Short description of the broken behaviour",
  "body_text": "<full bug description — see format below>"
}
```

Then set priority and status:

```http
PATCH /v1/task/:ref
{ "field": "Priority", "value": "High" }
```

Title convention: describe the broken behaviour, not the fix.

**Good:** `Login redirect fails for admin users on expired sessions`
**Bad:** `Fix the login thing`

---

## 2. Write the Bug Description

Required fields in the description (set in the issue body — at creation via `body_text`, or later via `PATCH /v1/github/issue/:number { "body": "..." }`):

**Environment** — where observed (production / staging / local, browser, OS, version)

**Steps to Reproduce** — numbered, exact. Include URLs, specific inputs, user states.

**Actual Behaviour** — what actually happens.

**Expected Behaviour** — what should happen instead.

**Severity:**
- **Critical** — system down, data loss, security issue
- **High** — major feature broken, no workaround
- **Medium** — partial breakage, workaround exists
- **Low** — cosmetic or minor inconvenience

**Acceptance Criteria** — what does "fixed" look like? How will it be verified?

**Example:**
```
Environment: Production, Chrome 126, macOS 14

Steps to Reproduce:
1. Log in as an admin user.
2. Wait for the session to expire (or manually clear the auth token).
3. Attempt to access /dashboard.

Actual Behaviour: Redirects to / instead of prompting for login.
Expected Behaviour: Should redirect to /login with "session expired" message.

Severity: High — affects all admin users, no clean workaround.

Acceptance Criteria:
- Expired session on /dashboard redirects to /login.
- /login shows "Your session expired, please log in again".
- After re-login, user is returned to /dashboard.
```

---

## 3. Attach Evidence

Paste relevant excerpts from logs, errors, or screenshots as a comment:

```http
POST /v1/task/:ref/comment
{ "text": "Error from server log:\n```\n[paste excerpt]\n```" }
```

---

## 4. Set Severity as Priority

Map severity to Priority (Critical severity → **Urgent**; High, Medium and Low map directly):

```http
PATCH /v1/task/:ref
{ "field": "Priority", "value": "Urgent" }
```

Critical bugs skip the normal backlog queue — flag immediately and notify the team via Slack:

```http
POST /v1/slack/notify
{ "text": "Critical bug filed: #<ref> — <title>. Needs immediate attention." }
```

---

## 5. Link to Original Task (if regression)

If this is a regression from a recently shipped task, note the original issue number in the description:

```
Regression from #58 — landed in the last deploy.
```

---

## Checklist Before Filing

- [ ] Title describes the broken behaviour (not the fix)
- [ ] Environment documented
- [ ] Steps to reproduce are exact and numbered
- [ ] Actual vs expected behaviour stated
- [ ] Severity set as Priority
- [ ] Acceptance criteria defined
- [ ] Evidence attached if available
