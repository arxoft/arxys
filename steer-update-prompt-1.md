Update your `.kiro/steering/arxys.md` file with the following changes. Apply them exactly as written — do not change anything else in the file.

---

**1. Update the PATCH comment in the GitHub Projects Quick Reference section.**

Find this line:
```
# Update Status field (fires Slack + posts audit comment)
# Get field_id first: GET /v1/github/project/<project_id>/fields
PATCH  /v1/github/project/<project_id>/issues/<item_id>  { "field_id": "PVTF_...", "value": "In Progress" }
```

Replace with:
```
# Update a field on a project item (fires Slack + posts audit comment on Status changes)
# Get field_id first: GET /v1/github/project/<project_id>/fields
# Works for all field types: Status (single select), Git Branch, Pull Request (text), etc.
PATCH  /v1/github/project/<project_id>/issues/<item_id>  { "field_id": "PVTF_...", "value": "In Progress" }
```

---

**2. Add two rules to the Hard Rules — GitHub Projects section.**

Find this block:
```
### GitHub Projects (when active)
- **Always comment before changing Status** — `POST /v1/github/project/.../issues/:number/comment` first, then update status. The status update also auto-posts an audit comment, but your reasoning comment must come first.
- Status changes fire Slack automatically — do not duplicate with manual `/v1/slack/notify`.
```

Replace with:
```
### GitHub Projects (when active)
- **Always comment before changing Status** — `POST /v1/github/project/.../issues/:number/comment` first, then update status. The status update also auto-posts an audit comment, but your reasoning comment must come first.
- Status changes fire Slack automatically — do not duplicate with manual `/v1/slack/notify`.
- **Always look up `field_id` via `GET /v1/github/project/<project_id>/fields`** before calling the PATCH endpoint. Never hardcode a field ID — IDs are project-specific. The PATCH endpoint accepts any field type (single-select, text, number), not just Status.
- **Do not construct GitHub Projects v2 GraphQL queries directly.** The API has non-obvious schema constraints (e.g. `field(id:)` does not exist; `field` inside fieldValue nodes is a union requiring inline fragments). All GitHub Projects operations must go through the arxys API endpoints.
```
