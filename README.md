# notion

A Notion CLI for task management. List, view, create, and update tasks, add comments — all from the terminal.

**Requires:** `bash`, `curl`, `jq`

---

## Setup

### 1. Clone into `~/.notion`

```bash
git clone <repo-url> ~/.notion
```

This is your Notion engine. Updates are just:

```bash
cd ~/.notion && git pull
```

### 2. Add `~/.notion` to your PATH

```bash
# in ~/.bashrc or ~/.zshrc
export PATH="$HOME/.notion:$PATH"
```

Or symlink the script:

```bash
ln -s ~/.notion/notion ~/.local/bin/notion
chmod +x ~/.local/bin/notion
```

Verify:

```bash
which notion
notion help
```

### 3. Create a Notion integration

Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations) → **New integration** → name it → select your workspace → Save.

Enable these capabilities:
- Read content
- Update content
- Insert content
- Read comments
- Create comments

Copy the `secret_xxx` API key.

### 4. Connect the integration to your database

Open your task board in Notion → `...` (top right) → **Connections** → find your integration → connect.

### 5. Get your database ID

From the board URL:

```
https://app.notion.com/p/<DATABASE_ID>?v=...
```

### 6. Create `~/.notion/config`

This file is personal and gitignored — never committed to the repo.

```ini
[default]
user=yourname@example.com
user_email=yourname@example.com

[my-app]
api_key=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
database_id=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

[ventures]
api_key=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
database_id=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy

[client-x]
api_key=secret_yyy            # different integration for this client
database_id=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz
```

| Key | Where | Required | Description |
|---|---|---|---|
| `user` | `[default]` | ✓ | Your display name / workspace email |
| `user_email` | `[default]` | ✓ | Used for `--self` and `--mine` flags |
| `api_key` | project block | ✓ | Integration secret — each project has its own |
| `database_id` | project block | ✓ | Database ID from the board URL |
| `title_property_name` | either | | Title property name (default: `Task name`) |

**Resolution rule:** block-level values always win over `[default]`.

---

## Usage

```
notion [--project <alias>] <resource> <action> [target] [flags]
```

Use `--project <alias>` to select which project block to load from `~/.notion/config`.

### task

| Command | Description |
|---|---|
| `notion --project <alias> task list` | List all tasks grouped by Status |
| `notion --project <alias> task list --filter <prop> <value>` | Filter tasks by property value |
| `notion --project <alias> task list --sort <prop> [asc\|desc]` | Sort task list |
| `notion --project <alias> task list --mine` | Show only tasks assigned to you |
| `notion --project <alias> task show <No.>` | Show all properties + comments for a task |
| `notion --project <alias> task create --title "..." [--prop val]` | Create a new task |
| `notion --project <alias> task update <No.> <property> <value>` | Update a task property |
| `notion --project <alias> task assign <No.> <email[,email,...]>` | Set assignees (replaces all) |
| `notion --project <alias> task unassign <No.> <email[,email,...]>` | Remove specific assignees |

### comment

| Command | Description |
|---|---|
| `notion --project <alias> comment add <No.> "text"` | Add a comment to a task |

### user

| Command | Description |
|---|---|
| `notion --project <alias> user list` | List all workspace members with emails |

### db

| Command | Description |
|---|---|
| `notion db list` | List all configured project blocks from `~/.notion/config` |
| `notion --project <alias> db bootstrap` | Provision DB with standard task management schema |
| `notion --project <alias> db bootstrap --help` | Show bootstrap details and prerequisites |

### reference

| Command | Description |
|---|---|
| `notion rules` | Display workspace best practices |
| `notion workflow list` | List all available workflows |
| `notion workflow show <name>` | Show a specific workflow |

---

## Examples

```bash
# list tasks
notion --project my-app task list
notion --project my-app task list --mine
notion --project my-app task list --filter Status "In Progress"
notion --project my-app task list --filter "Assigned To" user@example.com
notion --project my-app task list --sort "No." desc

# view a task
notion --project my-app task show 42

# create and update
notion --project my-app task create --title "Fix login bug" --self
notion --project my-app task create --title "Fix login bug" --Status "To Do" --Priority "High"
notion --project my-app task update 42 Status "In Review"
notion --project my-app task update 42 "Due Date" 2026-09-15
notion --project my-app task update 42 Effort 5

# comments
notion --project my-app comment add 42 "Blocked on design review"
notion --project my-app comment add 42 "Fixed in \`auth/session.ts\` — see PR [#88](https://github.com/...)"

# assignees
notion --project my-app task assign 42 user@example.com,other@example.com
notion --project my-app task assign 42 --self
notion --project my-app task unassign 42 user@example.com

# workspace members
notion --project my-app user list

# see configured projects
notion db list

# reference
notion rules
notion workflow list
notion workflow show development
```

---

## Onboarding a new developer

1. Clone the engine:
   ```bash
   git clone <repo-url> ~/.notion
   export PATH="$HOME/.notion:$PATH"   # add to shell profile
   ```

2. Add your details to `~/.notion/config` (get the project block from your team lead):
   ```ini
   [default]
   user=yourname@example.com
   user_email=yourname@example.com

   [my-app]
   api_key=secret_xxx
   database_id=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. Connect the integration to the database in Notion (one-time, per-database).

4. Run:
   ```bash
   notion --project my-app task list
   ```

The project's `notion.md` steering file documents which `--project` alias to use and any project-specific conventions.

---

## Notes

- Tasks are addressed by `No.` — the auto-incrementing `unique_id` per database.
- Property names in `task update` and `task list --filter` are case-insensitive.
- `task update` auto-detects property type from the page schema. Supported types: `title`, `rich_text`, `select`, `status`, `multi_select`, `number`, `checkbox`, `url`, `email`, `phone_number`, `date`, `people`.
- `task create` accepts any `--<PropertyName> <value>` flag and infers the type from the database schema.
- `comment add` supports inline markdown: `**bold**`, `` `code` ``, `_italic_`, `~~strikethrough~~`, `[label](url)`.
- People filters and `task assign` accept email addresses matched case-insensitively. Run `notion --project <alias> user list` to see all emails.
- `~/.notion/config` is gitignored — never committed. Share project block snippets with your team via docs or onboarding guides.
