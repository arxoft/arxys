#!/usr/bin/env bash
# =============================================================================
# lib/notion/db.sh — database subcommands
# Requires: lib/common.sh sourced first.
# =============================================================================

cmd_db_list() {
  echo ""
  bold "Available databases"
  echo ""
  if [[ -n "$NOTION_DATABASE_ID" ]]; then
    printf "  \033[1m%-20s\033[0m %s\n" "(default)" "$NOTION_DATABASE_ID"
  fi
  for _alias in $(echo "${!_NOTION_DB_ALIASES[@]}" | tr ' ' '\n' | sort); do
    printf "  \033[1m%-20s\033[0m %s\n" "$_alias" "${_NOTION_DB_ALIASES[$_alias]}"
  done
  if [[ ${#_NOTION_DB_ALIASES[@]} -eq 0 && -z "$NOTION_DATABASE_ID" ]]; then
    yellow "  No databases configured. Add entries to .env.notion."
  elif [[ ${#_NOTION_DB_ALIASES[@]} -eq 0 ]]; then
    dim "  No aliases defined."
  fi
  echo ""
  dim "  Define aliases in .env.arxys:"
  dim "    NOTION_DATABASE_ID=<uuid>                  # default"
  dim "    NOTION_DATABASE_ID:VENTURES=<uuid>          # arxys notion --db ventures"
  dim "    NOTION_DATABASE_ID:CLIENTS=<uuid>           # arxys notion --db clients"
  echo ""
  dim "Usage: arxys notion --db <alias> task list"
  dim "       arxys notion --db <uuid>  task list"
  echo ""
}

cmd_db_bootstrap() {
  local milestone_db_id="${NOTION_DATABASE_ID}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --milestone)
        [[ $# -lt 2 ]] && die "--milestone requires a UUID argument"
        milestone_db_id="$2"; shift 2 ;;
      *) die "Unknown option: $1" ;;
    esac
  done

  info "Bootstrapping database ${NOTION_DATABASE_ID}..."

  local props
  props=$(jq -n --arg mid "$milestone_db_id" --arg dbid "$NOTION_DATABASE_ID" '{
    "ID":           {"unique_id": {"prefix": null}},
    "Status": {
      "status": {
        "options": [
          {"name": "Planning"}, {"name": "Backlog"}, {"name": "Icebox"},
          {"name": "Up Next"}, {"name": "In Progress"}, {"name": "Pending Review"},
          {"name": "Awaiting Deployment"}, {"name": "UAT"},
          {"name": "Completed"}, {"name": "Cancelled"}
        ],
        "groups": [
          {"name": "Not started", "color": "gray",  "option_ids": []},
          {"name": "In progress", "color": "blue",  "option_ids": []},
          {"name": "Complete",    "color": "green", "option_ids": []}
        ]
      }
    },
    "Priority": {
      "select": {"options": [
        {"name": "Critical"}, {"name": "High"}, {"name": "Medium"}, {"name": "Low"}
      ]}
    },
    "Assignee":     {"people": {}},
    "Due Date":     {"date": {}},
    "Tags": {
      "multi_select": {"options": [
        {"name": "coding"}, {"name": "need-info"}, {"name": "issue-persists"},
        {"name": "reviewed"}, {"name": "pending-merge"}, {"name": "on-hold"},
        {"name": "awaiting-details"}, {"name": "cancelled"},
        {"name": "has-migration"}, {"name": "has-env-change"}
      ]}
    },
    "Notes":         {"rich_text": {}},
    "URL":           {"url": {}},
    "Effort":        {"number": {"format": "number"}},
    "Git Branch":    {"rich_text": {}},
    "Pull Request":  {"url": {}},
    "Review round":  {"number": {"format": "number"}},
    "Depends on":    {"relation": {"database_id": $dbid, "single_property": {}}},
    "Milestone":     {"relation": {"database_id": $mid, "single_property": {}}}
  }')

  local body result
  body=$(jq -n --argjson props "$props" '{properties: $props}')
  result=$(notion_patch "/databases/${NOTION_DATABASE_ID}" "$body")

  green "✓ Database bootstrapped successfully!"
  echo ""
  bold "Properties configured:"
  echo "$result" | jq -r '.properties | to_entries[] | "  • \(.key)  [\(.value.type)]"'
  echo ""
  local clean_id="${NOTION_DATABASE_ID//-/}"
  dim "  URL: https://www.notion.so/${clean_id}"
}

cmd_db_bootstrap_help() {
  echo ""
  bold "notion db bootstrap — Provision a Notion database with a standard task management schema"
  echo ""
  bold "USAGE:"
  echo "  arxys notion db bootstrap [--milestone <uuid>]"
  echo ""
  bold "OPTIONS:"
  echo "  --milestone <uuid>   DB ID to use for the Milestone relation (default: same DB / self-relation)"
  echo ""
  bold "WHAT IT DOES:"
  echo "  Applies a fixed property template to the database set in NOTION_DATABASE_ID."
  echo "  Uses PATCH /databases — additive only, existing properties are preserved."
  echo ""
  bold "PROPERTIES CONFIGURED:"
  printf "  %-16s %-12s %s\n" "ID"            "unique_id"    "Auto-incrementing task number"
  printf "  %-16s %-12s %s\n" "Status"        "status"       "Planning · Backlog · Icebox · Up Next"
  printf "  %-16s %-12s %s\n" ""              ""             "In Progress · Pending Review · Awaiting Deployment"
  printf "  %-16s %-12s %s\n" ""              ""             "UAT · Completed · Cancelled"
  printf "  %-16s %-12s %s\n" "Priority"      "select"       "Critical · High · Medium · Low"
  printf "  %-16s %-12s %s\n" "Assignee"      "people"       "Team member(s)"
  printf "  %-16s %-12s %s\n" "Due Date"      "date"         "Target completion date"
  printf "  %-16s %-12s %s\n" "Tags"          "multi_select" "coding · need-info · issue-persists · reviewed"
  printf "  %-16s %-12s %s\n" ""              ""             "pending-merge · on-hold · awaiting-details"
  printf "  %-16s %-12s %s\n" ""              ""             "cancelled · has-migration · has-env-change"
  printf "  %-16s %-12s %s\n" "Notes"         "rich_text"    "Free-form notes"
  printf "  %-16s %-12s %s\n" "URL"           "url"          "Reference link"
  printf "  %-16s %-12s %s\n" "Effort"        "number"       "Fibonacci effort points (1 2 3 5 8 13)"
  printf "  %-16s %-12s %s\n" "Git Branch"    "rich_text"    "Associated git branch name"
  printf "  %-16s %-12s %s\n" "Pull Request"  "url"          "GitHub pull request URL"
  printf "  %-16s %-12s %s\n" "Review round"  "number"       "Current review round (default 1)"
  printf "  %-16s %-12s %s\n" "Depends on"    "relation"     "Blocking task(s) in same DB (self-relation)"
  printf "  %-16s %-12s %s\n" "Milestone"     "relation"     "Parent milestone task (self-relation by default)"
  echo ""
  bold "PRE-REQUISITES:"
  echo ""
  echo "  1. Create an internal integration at https://www.notion.so/profile/integrations"
  echo "     Set NOTION_API_KEY in .env.arxys"
  echo ""
  echo "  2. Create a full-page database in Notion"
  echo "     Copy its ID from the URL: https://app.notion.com/p/<DATABASE_ID>?v=<view_id>"
  echo "     Set NOTION_DATABASE_ID in .env.arxys"
  echo ""
  echo "  3. Connect the integration to the database"
  echo "     Open the database → ··· → Connections → Add connection"
  echo ""
  bold "NOTES:"
  echo "  Safe to re-run — existing options are preserved, new ones are added."
  echo "  Additive only: renaming an option here leaves the old name on an existing"
  echo "  DB and re-running bootstrap adds the new one beside it. Rename in the"
  echo "  Notion UI instead, which moves the tasks with it."
  echo "  Views (board, table) must be configured manually in Notion."
  echo "  Icebox is parked work with no commitment to revisit; Backlog is still groomed."
  echo ""
}
