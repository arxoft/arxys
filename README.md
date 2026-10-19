# notion

A Notion CLI for task management. List, view, create, and update tasks, add comments — all from the terminal.

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

### 4. Create `.env.notion` in your project root

```
NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `NOTION_API_KEY` | ✓ | — | Integration secret from Notion |
| `NOTION_DATABASE_ID` | ✓ | — | ID from the board URL |
| `NOTION_TITLE_PROPERTY_NAME` | | `Task name` | Name of the title property in your database |

The script reads `.env.notion` from whichever directory you call it from, so each project can have its own file pointing to a different database.

---

## Globalize

To call `notion` from anywhere:

```bash
cp /path/to/notion ~/.local/bin/notion
chmod +x ~/.local/bin/notion

which notion
notion help
```

Then from any project directory that has a `.env.notion`:
```bash
cd ~/my-project
notion task list
```

---

## Usage

```
notion [--db <id|alias>] <resource> <action> [target] [flags]
```

### task

| Command | Description |
|---|---|
| `notion task list` | List all tasks grouped by Status |
| `notion task list --filter <prop> <value>` | Filter tasks by property value |
| `notion task list --sort <prop> [asc\|desc]` | Sort task list |
| `notion task show <No.>` | Show all properties + comments for a task |
| `notion task create --title "..." [--prop val]` | Create a new task |
| `notion task update <No.> <property> <value>` | Update a task property |
| `notion task assign <No.> <email[,email,...]>` | Set assignees (replaces all) |
| `notion task unassign <No.> <email[,email,...]>` | Remove specific assignees |

### comment

| Command | Description |
|---|---|
| `notion comment add <No.> "text"` | Add a comment to a task |

### user

| Command | Description |
|---|---|
| `notion user list` | List all workspace members with emails |

### db

| Command | Description |
|---|---|
| `notion db list` | List available DB aliases from .env.notion |
| `notion db bootstrap` | Provision DB with standard task management schema |
| `notion db bootstrap --help` | Show bootstrap details and prerequisites |

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
notion task list
notion task list --filter Status "In Progress"
notion task list --filter "Assigned To" user@example.com
notion task list --sort "No." desc

# view a task
notion task show 42

# create and update
notion task create --title "Fix login bug" --Status "To Do" --Priority "High"
notion task update 42 Status "In Review"
notion task update 42 "Due Date" 2026-09-15
notion task update 42 Effort 5

# comments
notion comment add 42 "Blocked on design review"
notion comment add 42 "Fixed in \`auth/session.ts\` — see PR [#88](https://github.com/...)"

# assignees
notion task assign 42 user@example.com,other@example.com
notion task unassign 42 user@example.com

# workspace members
notion user list

# multiple databases
notion db list
notion --db ventures task list
notion --db ventures task create --title "New venture"

# reference
notion rules
notion workflow list
notion workflow show development
```

---

## Multiple databases

Define aliases in `.env.notion`:

```
NOTION_DATABASE_ID=xxxxxxxx                    # default
NOTION_DATABASE_ID:VENTURES=xxxxxxxx           # notion --db ventures
NOTION_DATABASE_ID:CLIENTS=xxxxxxxx            # notion --db clients
```

`--db` accepts either an alias or a raw UUID and overrides `NOTION_DATABASE_ID` for that invocation only.

---

## Notes

- Tasks are addressed by `No.` — the auto-incrementing `unique_id` per database.
- Property names in `task update` and `task list --filter` are case-insensitive.
- `task update` auto-detects property type from the page schema. Supported types: `title`, `rich_text`, `select`, `status`, `multi_select`, `number`, `checkbox`, `url`, `email`, `phone_number`, `date`, `people`.
- `task create` accepts any `--<PropertyName> <value>` flag and infers the type from the database schema.
- `comment add` supports inline markdown: `**bold**`, `` `code` ``, `_italic_`, `~~strikethrough~~`, `[label](url)`.
- People filters and `task assign` accept email addresses matched case-insensitively. Run `notion user list` to see all emails.
