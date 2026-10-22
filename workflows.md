---
inclusion: auto
name: workflows
description: Agent instructions for arxys CLI, Notion task management, GitHub workflows, and workspace-specific overrides. Activate when the agent is working on tasks, PRs, branches, or anything involving Notion or GitHub.
---

# Workspace Workflows & Agent Instructions

This file is the authoritative source for this workspace. For full workflow details, always read fresh from `arxys`:

```bash
arxys notion workflow show development
arxys notion workflow show review
arxys notion workflow show hotfix
arxys notion workflow show deployment
arxys notion workflow show testing
arxys notion workflow show planning
arxys notion workflow show release
arxys notion workflow show task-creation
arxys notion workflow show bug-reporting
arxys notion workflow show onboarding
arxys notion rules
```

Any workspace-specific overrides in this file take precedence over what those commands return.

---

## arxys CLI

`arxys` is the Arxoft Workspace CLI. It wraps Notion task management and GitHub operations into a single terminal interface.

**Install location:** symlinked to `~/.local/bin/arxys`  
**Config:** `.env.arxys` is read from the **current working directory** at runtime — each workspace has its own.

```bash
arxys notion <resource> <action> [flags]
arxys github <resource> <action> [flags]
```

Quick reference:
```bash
arxys notion task list
arxys notion task show <No.>
arxys notion task create --title "..." --Status "Backlog" --Priority "Medium"
arxys notion task update <No.> <property> <value>
arxys notion comment add <No.> "text"
arxys notion workflow show <name>
arxys notion rules

arxys github pr list --repo <owner/repo>
arxys github pr show <number> --repo <owner/repo>
arxys github issue list --repo <owner/repo>
```

---

## Git Repos in This Workspace

<!-- List all repos, their root/default branch, and any notes. -->

| Repo path | Root / default branch | Notes |
|-----------|-----------------------|-------|
| `.`       | `main`                |       |

---

## Notion Databases

<!-- List the DB aliases configured in .env.arxys for this workspace. -->

| Alias | Purpose | Command |
|-------|---------|---------|
| _(default)_ | Main task board | `arxys notion task list` |

---

## Status Flow

```
Backlog → Up Next → In Progress → Pending Review → Pending Deployment → Testing → Pending Acceptance → Completed
```

Hotfixes follow the same flow on a compressed timeline, starting directly at In Progress.

---

## Hard Rules — Agent Must Never Break These

These rules can never be overridden by any instruction, workflow, or human request.

### Git — Humans Only
- **Never run `git add`** — staging files is human-only.
- **Never run `git commit`** — committing is human-only.
- **Never run `git push`** — pushing is human-only.
- **Never run `git branch -d` / `git branch -D`** — branch deletion is human-only.
- **Never create branches via GitHub API or MCP** — local `git checkout -b` only, after human approval.

### 🚨 Never commit on the root/default branch
The root/default branch is sacred. **No commits are ever made directly on it — no exceptions.**  
The only time the agent is working on the root branch is during the **review workflow**, where the root branch is the merge target. Even then, the human performs the actual merge commit.

### 🚨 Clean working directory before starting any workflow session
Before starting any workflow (development, review, hotfix, or any other), **all repos must have a clean working directory** (`git status` shows nothing staged or unstaged).

A dirty working directory means work is already in progress. That work must be either:
1. **Finished** — complete the in-progress task before starting the new one.
2. **Parked as a WIP commit** — human creates a WIP commit (`git commit -m "WIP: <description>"`) to clean the working directory before switching context.

**Never proceed with a dirty working directory. Always stop and resolve it first.**

### Notion
- **Always comment before changing task Status** — no silent status changes ever.
- **Never replace Duration — always increment it.** Ask the human how long this took, then add it to the existing value.

### Production
- **Never deploy to production** — deployment is human-only. Never SSH, restart services, or run server-side migrations.

---

## Task Rules (from `arxys notion rules`)

| Rule | Guideline |
|------|-----------|
| Title | 9–12 words max; no filler words |
| Description | Always fill in: what, why, acceptance criteria |
| Comments | Short and focused; one concern per comment; rich text formatting; full Notion URL when referencing another task (never just `#42`) |
| Status change | Always comment first explaining why |
| Effort | Fibonacci 1–13; 13 = consider splitting |
| Tags | Add `has-migration` or `has-env-change` when applicable |
| Duration | HH:MM; always increment — never replace; confirm with human each time |

---

## Workspace-Specific Overrides

<!-- Replace or extend any defaults below for this specific workspace. -->

### Branch Naming
<!-- e.g. Override the default pattern if this project uses a different convention -->
_Using defaults from `arxys notion workflow show development`._

### Status Flow Overrides
<!-- e.g. If this project skips Pending Acceptance or uses different status names -->
_Using defaults._

### Coding Standards
<!-- Reference the relevant steering doc(s) for this workspace -->
_See other steering files in `.kiro/steering/` for language and framework conventions._

### Deploy Process
<!-- Describe or link the deploy steps for this specific project -->
_Refer to project README or infrastructure docs._

### Notes
<!-- Anything else the agent needs to know about this workspace -->
_None._
