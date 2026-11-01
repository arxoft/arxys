# Onboarding Workflow

## Overview

This workflow covers what a new developer needs to know before picking up their first task. It's also useful as a checklist when setting up a new machine.

---

## 1. Read First

Before touching any code or tasks:

```bash
notion rules          # board rules — how tasks are managed
notion workflow list  # overview of all workflows
```

Then read the project's own README for the local dev stack, available commands, and service URLs.

---

## 2. Set Up the Notion CLI

The `notion` CLI must be callable from any project directory.

```bash
# Copy to a directory on your PATH
cp /path/to/notion ~/.local/bin/notion
chmod +x ~/.local/bin/notion

# Verify
which notion
notion help
```

Create a `.env.notion` file in each project directory you'll work in:

```
NOTION_API_KEY=secret_xxxx
NOTION_DATABASE_ID=xxxx
```

Get the API key from [notion.so/profile/integrations](https://www.notion.so/profile/integrations) and the database ID from the board URL.

---

## 3. Verify CLI Access

```bash
notion task list      # should list the board
notion user list      # should list workspace members
```

If either fails, check `.env.notion` is present in the current directory and credentials are correct.

---

## 4. Set Up the Local Dev Stack

Refer to the project's README for setup instructions. Common steps:
- Clone the repo(s)
- Install dependencies
- Copy `.env.example` → `.env` and fill in values
- Run the local dev server

Each project defines its own tooling — look for a wrapper script (`./sail`, `./artisan`, `./run`) and use that.

---

## 5. Understand the Board

```bash
notion task list
```

Get familiar with the current state:
- What's In Progress?
- What's Up Next?
- Who is assigned to what?

Ask questions in Notion comments, not in chat. Comments are the record.

---

## 6. Pick Up Your First Task

Follow the development workflow:

```bash
notion workflow show development
```

When in doubt — read the task, read the comments, read the existing code. Ask before assuming.

---

## Key Conventions to Know

| Rule | Detail |
|------|--------|
| Comment before status change | Always explain why you're changing a task status |
| Branch names from Notion | `Branch Name` property on the task — human confirms |
| Never commit without instruction | AI proposes commit messages; human commits |
| No new abstractions | Match existing code patterns exactly |
| Short titles | 9–12 words, describes the work clearly |
| Effort points | Set Fibonacci estimate on every task |
