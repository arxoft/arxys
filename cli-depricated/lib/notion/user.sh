#!/usr/bin/env bash
# =============================================================================
# lib/notion/user.sh — user subcommands
# Requires: lib/common.sh sourced first.
# =============================================================================

cmd_user_list() {
  info "Fetching workspace members..."
  local users_json
  users_json=$(_fetch_users)

  echo ""
  echo "$users_json" | jq -r '.results[] |
    [
      (.name // "" | split(" ") | .[0] | ascii_downcase | .[0:14]),
      (if .type == "bot" then "[bot]" else (.person.email // "—") end | .[0:36]),
      .id
    ] | @tsv' | \
  while IFS=$'\t' read -r handle email uid; do
    printf "  \033[1m%-14s\033[0m  \033[2m%-36s\033[0m  %s\n" "$handle" "$email" "$uid"
  done
  echo ""
}
