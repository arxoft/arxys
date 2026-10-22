# Workflows

All workflows for managing software development via Notion.

```
notion workflow list                — this index
notion workflow show <name>         — detailed workflow
```

---

## Available Workflows

| Name              | Command                               | Purpose                                                             |
|-------------------|---------------------------------------|---------------------------------------------------------------------|
| **planning**      | `notion workflow show planning`       | Prioritise the backlog, set branch names, move tasks to Up Next     |
| **task-creation** | `notion workflow show task-creation`  | How to write a good task — title, description, effort, tags         |
| **bug-reporting** | `notion workflow show bug-reporting`  | File a bug with full reproduction details and severity              |
| **development**   | `notion workflow show development`    | Pick up a task, implement, commit, open a PR                        |
| **review**        | `notion workflow show review`         | Review PRs from Pending Review queue, approve or send back          |
| **testing**       | `notion workflow show testing`        | Validate deployed changes in production against acceptance criteria |
| **deployment**    | `notion workflow show deployment`     | Pre-deploy checks, deploy steps, post-deploy status update          |
| **hotfix**        | `notion workflow show hotfix`         | Fast-track path for critical production issues                      |
| **release**       | `notion workflow show release`        | Group completed tasks, write changelog, tag release                 |
| **onboarding**    | `notion workflow show onboarding`     | New developer setup — CLI, local stack, board orientation           |

---

## Status Flow (Full)

```
Backlog → Up Next → In Progress → Pending Review → Awaiting Deployment → UAT → Completed
```

Key transitions:

- **Pending Review → Awaiting Deployment** — reviewer approves; review branch pushed, review PR opened.
- **Pending Review → Up Next** — issues found; developer bumps Review round and resubmits.
- **Awaiting Deployment → UAT** — review PR merged; `pending-merge` tag cleared by whoever merges.
- **UAT → Completed** — change accepted in UAT.

Hotfixes follow the same flow on a compressed timeline, skipping the backlog.

---

## AI Agent — Hard Rules on Git

> The AI agent must **never** run any of the following — under any circumstances, without exception:
> - `git add` — staging files
> - `git commit` — creating commits
> - `git branch -d` / `git branch -D` — deleting branches
> - `git push` — pushing branches to remote

The AI's role in git is **suggestion only**:
- Propose branch names — the human creates the branch.
- Propose commit messages — the human stages files (`git add`) and commits.
- Propose PR title and body — the human confirms before the PR is created.

These are the defaults that can NEVER be overridden by a project steering file. They are absolute.


---

## Quick Reference

See `notion`

---

## Project-Specific Overrides

These workflows are the default baseline. Individual projects may have variations —
different branch naming, additional deploy steps, project-specific tooling, or
adjusted status flows.

To be double sure, see a `workflows.md` steering file at `.kiro/steering/workflows.md`
in this workspace. Pick it up automatically if it exists and treat it as the 
authoritative override for this workspace. Any instructions in that file take 
precedence over `notion workflow list` and `notion workflow show <name>`.

There can be mutliple Git repos in some workpsaces. The workspaces.md steering should name them with their root branches.