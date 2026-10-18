# Notion Workspace Rules

These are workspace best practices for managing tasks in Notion via this CLI.

---

## Titles

- **Keep titles concise** — 9–12 words maximum.
- Titles should describe the work clearly without being a full sentence.
- Avoid filler words like "we need to", "please", "I want to".

**Good:**
```
Fix login redirect loop on expired sessions
Add CSV export to the reports dashboard
```

**Bad:**
```
We need to fix the issue where the login page redirects users in a loop when their session has expired
```

---

## Descriptions

- Every task must have a **detailed description** saved in the `Notes` or `Description` property — whichever is available in the database.
- The description should answer: *what*, *why*, and *acceptance criteria*.
- If relevant project documents exist (specs, RFCs, design files, API docs), **link or reference them** in the description.
- Use the CLI to set it:
  ```
  notion task update <No.> Notes "Full description here..."
  ```

---

## Comments

- Comments have a **character limit** — keep each comment focused.
- If a comment is getting long, **break it into multiple shorter comments**.
- One comment per concern: status update, blocker, question, decision — not all at once.
- **Always use rich text formatting** to make comments easy to read:
  - `**bold**` for emphasis, versions, branch names, key terms
  - `` `backticks` `` for file names, function names, branch names, commands
  - `~~strikethrough~~` for corrections or things that no longer apply
  - `[label](url)` for links with meaningful labels; bare URLs auto-link too
- **Always include the full task URL** when referencing another task in a comment — never just the task number. Use the format `[Task title or #No.](https://notion.so/...)`.

**Good:**
```
notion comment add 42 "Blocked by [Fix auth token refresh](https://notion.so/your-workspace/abc123)."
```

**Bad:**
```
notion comment add 42 "Blocked by task #38."
```

**Good (multiple short comments):**
```
notion comment add 42 "Blocked: waiting on design approval for the modal layout."
notion comment add 42 "Design approved. Moving to implementation."
```

**Bad (one long dump):**
```
notion comment add 42 "So I looked into the issue and it seems like the problem is related to the modal layout which design hasn't approved yet and also there's a question about whether we should use a drawer instead but I also noticed the API returns a 500 in some edge cases so we need to look at that too..."
```

---

## Referencing Docs in Descriptions

- If the project has relevant documents — specs, design files, RFCs, ADRs, changelogs — mention them in the task description.
- Use direct links where possible, or reference them by name if they're in a shared workspace.

**Example:**
```
Implement the export feature as defined in the reporting-spec.md.
See also: Figma design #123 and the API contract in openapi.yaml.
```

---

## Status Changes

- **Always add a comment before changing the `Status`** of a task.
- The comment should briefly explain *why* the status is changing.
- This creates a clear audit trail and keeps collaborators in the loop.

**Good:**
```
notion comment add 42 "Implementation done and tested locally. Moving to Review."
notion task update 42 Status "In Review"
```

**Bad:**
```
notion task update 42 Status "In Review"
```
*(No context left for the team about what changed or why.)*

---

## Effort Points

Every task should have an **Effort** property set using Fibonacci points:

| Points | Meaning |
|--------|---------|
| 1      | Trivial — a quick config change, typo fix, or one-liner |
| 2      | Small — straightforward, well-understood work |
| 3      | Medium-small — a bit of thought required, low risk |
| 5      | Medium — meaningful work, some unknowns |
| 8      | Large — complex or touches multiple areas |
| 13     | Very large — high uncertainty; consider breaking it down |

- If a task feels like it's between two numbers, **pick the higher one**.
- Tasks at **13 points are a signal** — they're likely too big and should be split before being picked up.
- Don't use effort points as a time estimate. They measure complexity and uncertainty, not hours.

**Example:**
```
notion task update 42 Effort 5
```

---

## Tags

Use tags to signal special requirements that affect how a task is picked up and deployed.

- If the task involves **running a migration** (database schema changes, data migrations, seed scripts), add the tag:
  ```
  has-migration
  ```
- If the task requires **changes to environment variables** (new keys, updated values, removed entries in `.env`), add the tag:
  ```
  has-env-change
  ```

These tags help the team prepare the environment before or during deployment and avoid surprises.

**Example:**
```
notion task update 42 Tags "has-migration"
notion task update 42 Tags "has-env-change"
```

---

---

## Duration

The `Duration` field records how long a task actually took to complete, in `HH:MM` format (e.g. `02:30` for two and a half hours).

- **Never replace Duration — always increment it.** Each time a task is updated, add the new time spent to the existing value.
- Duration is provided by the human — the AI estimates it from context (e.g. the time between `Created On` and the PR being raised), but always confirms with the human before setting it.
- The AI should ask: *"How long did this take since the last update? I'll add it to the current total."*
- On the first update (when Duration is empty), the full elapsed time is set directly.

**Example — first set:**
```bash
notion task update 42 Duration "01:45"
```

**Example — incrementing on a subsequent update (previous: 01:45, adding 00:45):**
```bash
notion task update 42 Duration "02:30"
```

The CLI will display the current Duration value when you update this field as a reminder to increment rather than replace.

---

## Summary

| Rule          | Guideline                                                                 |
|---------------|---------------------------------------------------------------------------|
| Title length  | 9–12 words max                                                            |
| Description   | Always fill in Notes/Description — include what, why, acceptance criteria |
| Relevant docs | Reference any related specs, designs, or docs in the description          |
| Comments      | Keep short; split long thoughts into multiple comments; use rich text formatting; always post full task URL when referencing another task |
| Status change | Always comment before updating the Status property                        |
| Tags          | Add `has-migration` or `has-env-change` when applicable                   |
| Effort        | Set Fibonacci points (1–13); 13 = too big, consider splitting             |
| Duration      | HH:MM format; always INCREMENT — never replace; confirm with human each time |
