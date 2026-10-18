# Development Workflow

- There can be multiple repos in the workflow.
- The 'developer' or 'dev' is human instructing you to complete a task.

## 1. Pick Up a Task

- Human tells you Notion task number to start development
- Verify all repos are on the root branch and have a clean working dir before proceeding. If not, ask the developer if they really want to continue.
- Ask human's email address, and assign the task to that user only.
- Fetch task `notion task show <id>`, and read notes/description and all comments for context.
- Ask questions in a comment before starting if anything is unclear. And move it back to 'Up Next' with tag 'need info'.

## 2. Set Up the Branch(es)

- Branch naming: `<root-branch>_<milestone>_<No.>-short-task-name` or `<root-branch>_<No.>-short-task-name` for standalone tasks.
- Suggest a branch name for the task.
- After human approves the suggested branch name, create the branch locally using `git checkout -b <branch-name>` from the root branch, and switch to it before starting any work. Never create branches via GitHub API or MCP — local only.
- The `Branch Name` property must be populated before a branch is created.
- Never push directly to the root branch.

## 3. Move to In Progress
- Add tag 'coding'.
- Add a comment before changing status: `notion comment add <No.> "Starting implementation. Branch: <branch-name>."`
- Then: `notion task update <No.> Status "In Progress"`

## 4. Implement

- Implement as per the workspace's coding standards explained in workspace's steering docs.
- If the task needs DB migration: add tag `has migration`.
- If `.env` changes are needed: document what changed and tag `has env change`.

## 5. Testing

- After coding is done, post a comment on the task with manual testing instructions (what to test, how to trigger, expected outcome).
- Then ask developer to manually test the implementation.
- Make further changes and fixes if developer reports issues.
- **When the developer confirms a task is complete, a screenshot must be attached as a comment** clearly showing the working result. No task moves forward without it.

## 6. Commits

- AI never commits — `git commit` is human-only.
- Never stage files — `git add` is human-only.
- Propose the commit message; the human stages and commits.
- Commit message format:
  ```
  type(scope): short description

  No.<No.> — Task title
  What changed and why.

  https://app.notion.com/p/<task-url>
  ```
- Prefer new commits over `--amend`.
- Never skip hooks (`--no-verify`) unless explicitly asked.
- Get commit hash from top of git log, confirming it's the correct commit message, then post a comment on the task with that exact commit msg and Github commit link.

## 7. Push and Open a PR

- AI never pushes — `git push` is human-only.
- PR title: concise, under 70 characters.
- PR body must link the Notion task.
- After creating the PR, post a comment on the task with the PR URL.

## 8. Move to Pending Review

- Add a comment with manual testing instructions (what to test, how to trigger, expected outcome).
- Then: `notion task update <No.> Status "Pending Review"`
- Remove the 'coding' tag

## 9. Switch Back to Root Branch

- Switch back to the root branch in all repos: `git checkout <root-branch>`