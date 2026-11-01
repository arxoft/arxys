# Bug Reporting Workflow

## Overview

Bugs are tasks too — they go through the same status flow and follow the same task creation rules. The difference is in the required fields: a bug report must include enough detail to reproduce the issue without back-and-forth.

---

## 1. Create the Bug Task

```bash
notion task create --title "Short description of the bug" --Status "Backlog" --Priority "High"
```

Title convention for bugs: describe the broken behaviour, not the fix.

**Good:** `Login redirect fails for admin users on expired sessions`
**Bad:** `Fix the login thing`

---

## 2. Write the Bug Description

Set the Notes/Description property with all of the following:

```bash
notion task update <No.> Notes "..."
```

### Required fields in the description:

**Environment**
Where was this observed? (production / staging / local, browser, OS, version)

**Steps to Reproduce**
Numbered list. Be exact — include URLs, specific inputs, and user states (logged in as admin, etc.).

**Actual Behaviour**
What actually happens.

**Expected Behaviour**
What should happen instead.

**Severity**
How bad is it?
- **Critical** — system down, data loss, security issue
- **High** — major feature broken, no workaround
- **Medium** — partial breakage, workaround exists
- **Low** — cosmetic or minor inconvenience

**Acceptance Criteria**
What does "fixed" look like? How will it be verified?

### Example:

```
Environment: Production, Chrome 126, macOS 14

Steps to Reproduce:
1. Log in as an admin user.
2. Wait for the session to expire (or manually clear the auth token).
3. Attempt to access /dashboard.

Actual Behaviour: Page redirects to / (homepage) instead of prompting for login.

Expected Behaviour: Should redirect to /login with a "session expired" message.

Severity: High — affects all admin users, no clean workaround.

Acceptance Criteria:
- Expired session on /dashboard redirects to /login.
- /login displays a "Your session expired, please log in again" message.
- After re-login, user is returned to /dashboard.
```

---

## 3. Attach Evidence

If you have screenshots, error logs, or network traces — paste relevant excerpts into the description or a comment:

```bash
notion comment add <No.> "Error from server log: [paste excerpt]"
```

---

## 4. Set Severity as Priority

Map severity to the Priority field:

```bash
notion task update <No.> Priority "Critical"
```

Critical bugs skip the normal backlog queue — flag them immediately and notify the team.

---

## 5. Link to the Original Task (if applicable)

If this bug is a regression from a recently shipped task, note the original task number in the description:

```
Regression from No.58 — landed in the last deploy.
```

---

## Checklist Before Filing

- [ ] Title describes the broken behaviour (not the fix)
- [ ] Environment documented
- [ ] Steps to reproduce are exact and numbered
- [ ] Actual vs expected behaviour clearly stated
- [ ] Severity set as Priority
- [ ] Acceptance criteria defined
- [ ] Evidence (logs, screenshots) attached if available
