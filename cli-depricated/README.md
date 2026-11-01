# arxys

The Arxoft Workspace CLI. Wraps Notion task management and GitHub operations into a single terminal interface.

**Requires:** `bash`, `curl`, `jq`

---

## Setup

### 1. Create a Notion integration

Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → **New integration** → name it → select your workspace → Save.

Enable these capabilities:
- Read content
- Update content
- Insert content
- Read comments
- Create comments

Copy the `secret_xxx` API key.

### 2. Connect the integration to your database

Open your task board in Notion → `...` (top right) → **Connections** → find your integration → connect.

### 3. Get your database ID

From the board URL:
```
https://app.notion.com/p/<DATABASE_ID>?v=...
```

### 4. Create `.env.arxys` in your project root

```
NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_TOKEN=ghp_xxxx
```

See `.env.arxys.example` for all available variables.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NOTION_API_KEY` | ✓ | — | Integration secret from Notion |
| `NOTION_DATABASE_ID` | ✓ | — | ID from the board URL |
| `NOTION_TITLE_PROPERTY_NAME` | | `Task name` | Name of the title property in your database |
| `NOTION_USER` | | — | Your short handle — prefixes every comment e.g. `(ako)` |
| `NOTION_USER_EMAIL` | | — | Your workspace email — used for `--self` and `--mine` |
| `GITHUB_TOKEN` | | — | PAT with repo scope — required for GitHub commands |

The script reads `.env.arxys` from whichever directory you call it from, so each project can have its own file pointing to a different database and repo.

---

## Globalize (Linux / macOS)

```bash
ln -s "$(pwd)/arxys" ~/.local/bin/arxys
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc

which arxys
arxys help
```

Then from any project directory that has a `.env.arxys`:
```bash
cd ~/my-project
arxys notion task list
```

## Globalize (Windows)

Requires [Git for Windows](https://git-scm.com/download/win) and `jq` (`winget install jqlang.jq`).

**Option A — add to PATH:**
Copy `arxys.cmd` to a folder already on your PATH, or add the repo directory to PATH via System Properties → Advanced → Environment Variables.

**Option B — PowerShell alias (persists across sessions):**
Add to your `$PROFILE`:
```powershell
Set-Alias arxys C:\path\to\arxys.cmd
```

`arxys.cmd` auto-detects Git Bash and delegates to the bash script.

---

## Usage

```
arxys <tool> <resource> <action> [flags]
```

---

## Notion

```
arxys notion [--db <id|alias>] <resource> <action> [target] [flags]
```

### task

| Command | Description |
|---|---|
| `arxys notion task list` | List all tasks grouped by Status (Icebox excluded) |
| `arxys notion task list --icebox` | List only Icebox — parked work kept out of the backlog |
| `arxys notion task list --filter <prop> <value>` | Filter tasks by property value |
| `arxys notion task list --sort <prop> [asc\|desc]` | Sort task list |
| `arxys notion task list --mine` | Tasks assigned to you |
| `arxys notion task show <No.>` | Show all properties + comments for a task |
| `arxys notion task create --title "..." [--prop val]` | Create a new task; the CLI stamps the `(No.)` prefix |
| `arxys notion task create --title "..." --self` | Create and assign to yourself |
| `arxys notion task update <No.> <property> <value>` | Update a task property |
| `arxys notion task assign <No.> <email[,email,...]>` | Set assignees (replaces all) |
| `arxys notion task assign <No.> --self` | Assign yourself |
| `arxys notion task unassign <No.> <email[,email,...]>` | Remove specific assignees |
| `arxys notion task fix-titles` | Report titles missing their `(No.)` prefix |
| `arxys notion task fix-titles --apply` | Repair those titles |

### comment

| Command | Description |
|---|---|
| `arxys notion comment add <No.> "text"` | Add a comment to a task |

### user

| Command | Description |
|---|---|
| `arxys notion user list` | List all workspace members with emails |

### db

| Command | Description |
|---|---|
| `arxys notion db list` | List available DB aliases from `.env.arxys` |
| `arxys notion db bootstrap` | Provision DB with standard task management schema |
| `arxys notion db bootstrap --help` | Show bootstrap details and prerequisites |

### reference

| Command | Description |
|---|---|
| `arxys notion rules` | Display workspace best practices |
| `arxys notion workflow list` | List all available workflows |
| `arxys notion workflow show <name>` | Show a specific workflow |

---

## GitHub

```
arxys github <resource> <action> --repo <owner/repo> [flags]
```

### pr

| Command | Description |
|---|---|
| `arxys github pr list --repo o/r` | List pull requests |
| `arxys github pr show --repo o/r <number>` | Show PR details |
| `arxys github pr create --repo o/r --title "..." --head <branch>` | Open a PR |
| `arxys github pr merge --repo o/r <number>` | Merge a PR |
| `arxys github pr review --repo o/r <number> --action approve` | Review a PR |
| `arxys github pr files --repo o/r <number>` | List files changed |
| `arxys github pr status --repo o/r <number>` | Show status checks |

### issue

| Command | Description |
|---|---|
| `arxys github issue list --repo o/r` | List issues |
| `arxys github issue show --repo o/r <number>` | Show issue details |
| `arxys github issue create --repo o/r --title "..."` | Create an issue |
| `arxys github issue update --repo o/r <number> <field> <value>` | Update an issue |
| `arxys github issue comment --repo o/r <number> "text"` | Add a comment |

### repo

| Command | Description |
|---|---|
| `arxys github repo info --repo o/r` | Show repo details |
| `arxys github repo list --org <org>` | List repos in an org |
| `arxys github repo commits --repo o/r` | List recent commits |
| `arxys github repo search <query>` | Search repositories |

### user

| Command | Description |
|---|---|
| `arxys github user search <query>` | Search GitHub users |

---

## Examples

```bash
# notion — tasks
arxys notion task list
arxys notion task list --filter Status "In Progress"
arxys notion task list --mine
arxys notion task show 42
arxys notion task create --title "Fix login bug" --Status "Backlog" --Priority "High"
arxys notion task create --title "Fix login bug" --self
arxys notion task update 42 Status "In Review"
arxys notion task update 42 "Due Date" 2026-09-15
arxys notion task update 42 Effort 5
arxys notion task assign 42 user@example.com,other@example.com
arxys notion task assign 42 --self
arxys notion task unassign 42 user@example.com
arxys notion task fix-titles --apply

# notion — comments
arxys notion comment add 42 "Blocked on design review"

# notion — workspace members
arxys notion user list

# notion — multiple databases
arxys notion db list
arxys notion --db ventures task list
arxys notion --db ventures task create --title "New venture"

# notion — reference
arxys notion rules
arxys notion workflow list
arxys notion workflow show development

# github
arxys github pr list --repo acme-corp/backend
arxys github pr list --repo acme-corp/backend --mine
arxys github pr show 42 --repo acme-corp/backend
arxys github pr create --repo acme-corp/backend --title "Fix login bug" --head fix/login
arxys github pr review 42 --repo acme-corp/backend --action approve
arxys github issue list --repo acme-corp/frontend --label bug
arxys github issue create --repo acme-corp/frontend --title "Dark mode flicker" --label bug
arxys github repo info --repo acme-corp/backend
arxys github repo commits --repo acme-corp/backend --branch main --limit 10
```

---

## Multiple Notion databases

Define aliases in `.env.arxys`:

```
NOTION_DATABASE_ID=xxxxxxxx                    # default
NOTION_DATABASE_ID:VENTURES=xxxxxxxx           # arxys notion --db ventures
NOTION_DATABASE_ID:CLIENTS=xxxxxxxx            # arxys notion --db clients
```

`--db` accepts either an alias or a raw UUID and overrides `NOTION_DATABASE_ID` for that invocation only.

---

## Notes

- Tasks are addressed by `No.` — the auto-incrementing `unique_id` per database.
- Property names in `task update` and `task list --filter` are case-insensitive.
- `task update` auto-detects property type from the page schema. Supported types: `title`, `rich_text`, `select`, `status`, `multi_select`, `number`, `checkbox`, `url`, `email`, `phone_number`, `date`, `people`.
- `task create` accepts any `--<PropertyName> <value>` flag and infers the type from the database schema.
- `comment add` supports inline markdown: `**bold**`, `` `code` ``, `_italic_`, `~~strikethrough~~`, `[label](url)`.
- People filters and `task assign` accept email addresses matched case-insensitively. Run `arxys notion user list` to see all emails.
- `GITHUB_TOKEN` is the only GitHub env var needed — owner/repo is always passed via `--repo`.
