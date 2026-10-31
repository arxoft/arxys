#!/usr/bin/env bash
# =============================================================================
# lib/github/user.sh — user subcommands
# Requires: lib/common.sh and lib/github/common.sh sourced first.
#
# Commands:
#   github user search <query>  [--limit <n>]
# =============================================================================

cmd_github_user_search() {
  require_github_env
  local query="" limit=20

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --limit) limit="$2"; shift 2 ;;
      *)       [[ -z "$query" ]] && query="$1" || shift; shift ;;
    esac
  done

  [[ -z "$query" ]] && die "Usage: github user search <query> [--limit <n>]"

  local encoded_query
  encoded_query=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$query")

  info "Searching users: ${query}..."
  local result total items
  result=$(github_get "/search/users?q=${encoded_query}&per_page=${limit}")
  total=$(echo "$result" | jq '.total_count')
  items=$(echo "$result" | jq '.items | length')

  if [[ "$items" -eq 0 ]]; then
    yellow "No users found."
    return
  fi

  echo ""
  echo "$result" | jq -r '.items[] |
    "  \(.login | . + (20 - length) * " " | .[0:21])  \(.type)  \(.html_url)"'
  echo ""
  dim "Showing ${items} of ${total} total results"
}
