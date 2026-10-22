#!/usr/bin/env bash
# =============================================================================
# lib/github/repo.sh — repository subcommands
# Requires: lib/common.sh and lib/github/common.sh sourced first.
#
# Commands:
#   github repo info    --repo owner/repo
#   github repo list    [--org <org>]
#   github repo commits --repo owner/repo  [--branch <branch>] [--limit <n>]
#   github repo search  <query>  [--limit <n>]
# =============================================================================

cmd_repo_info() {
  require_github_env
  parse_repo_flag "$@"
  require_github_repo

  info "Fetching repo info (${_GH_OWNER}/${_GH_REPO})..."
  local repo
  repo=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}")

  echo ""
  bold "══════════════════════════════════════════════════"
  bold " $(echo "$repo" | jq -r '.full_name')"
  bold "══════════════════════════════════════════════════"
  echo ""

  printf "  \033[1m%-18s\033[0m %s\n" "Description:"    "$(echo "$repo" | jq -r '.description // "—"')"
  printf "  \033[1m%-18s\033[0m %s\n" "Default branch:" "$(echo "$repo" | jq -r '.default_branch')"
  printf "  \033[1m%-18s\033[0m %s\n" "Visibility:"     "$(echo "$repo" | jq -r '.visibility')"
  printf "  \033[1m%-18s\033[0m %s\n" "Stars:"          "$(echo "$repo" | jq -r '.stargazers_count')"
  printf "  \033[1m%-18s\033[0m %s\n" "Open issues:"    "$(echo "$repo" | jq -r '.open_issues_count')"
  printf "  \033[1m%-18s\033[0m %s\n" "Language:"       "$(echo "$repo" | jq -r '.language // "—"')"
  printf "  \033[1m%-18s\033[0m %s\n" "Updated:"        "$(echo "$repo" | jq -r '.updated_at[0:10]')"
  printf "  \033[1m%-18s\033[0m %s\n" "URL:"            "$(echo "$repo" | jq -r '.html_url')"
  echo ""
}

cmd_repo_list() {
  require_github_env
  local org=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --org)  org="$2"; shift 2 ;;
      --repo) org="${2%%/*}"; shift 2 ;;   # accept --repo owner/repo, use owner as org
      *)      die "Unknown option: $1. Usage: github repo list [--org <org>]" ;;
    esac
  done

  [[ -z "$org" ]] && die "--org <org> is required. Usage: github repo list --org acme-corp"

  info "Fetching repositories for ${org}..."
  local result count
  # Try org endpoint first, fall back to user endpoint
  result=$(github_get "/orgs/${org}/repos?per_page=100&sort=updated&direction=desc" 2>/dev/null \
    || github_get "/users/${org}/repos?per_page=100&sort=updated&direction=desc")
  count=$(echo "$result" | jq 'length')

  if [[ "$count" -eq 0 ]]; then
    yellow "No repositories found."
    return
  fi

  echo ""
  echo "$result" | jq -r '.[] |
    "  \(.name | if length > 30 then .[0:30] + "…" else . end | . + (30 - length) * " " | .[0:31])  " +
    "\(.visibility | .[0:7])  " +
    "★\(.stargazers_count)  " +
    "\(.updated_at[0:10])"'
  echo ""
  dim "Total: $count"
}

cmd_repo_commits() {
  require_github_env
  local branch="" limit=20
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)   remaining+=("$1" "$2"); shift 2 ;;
      --branch) branch="$2"; shift 2 ;;
      --limit)  limit="$2";  shift 2 ;;
      *)        remaining+=("$1"); shift ;;
    esac
  done

  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo

  local qs="per_page=${limit}"
  [[ -n "$branch" ]] && qs="${qs}&sha=${branch}"

  info "Fetching commits (${_GH_OWNER}/${_GH_REPO}${branch:+, branch: ${branch}})..."
  local result count
  result=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/commits?${qs}")
  count=$(echo "$result" | jq 'length')

  if [[ "$count" -eq 0 ]]; then
    yellow "No commits found."
    return
  fi

  echo ""
  echo "$result" | jq -r '.[] |
    "  \(.sha[0:7])  \(.commit.author.date[0:10])  \(.commit.author.name | .[0:18] | . + (18 - length) * " " | .[0:19])  \(.commit.message | split("\n")[0] | if length > 60 then .[0:60] + "…" else . end)"'
  echo ""
  dim "Showing ${count} commit(s)"
}

cmd_repo_search() {
  require_github_env
  local query="" limit=20
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --limit) limit="$2"; shift 2 ;;
      *)       [[ -z "$query" ]] && query="$1" || remaining+=("$1"); shift ;;
    esac
  done

  [[ -z "$query" ]] && die "Usage: github repo search <query> [--limit <n>]"

  local encoded_query
  encoded_query=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$query")

  info "Searching repositories: ${query}..."
  local result total
  result=$(github_get "/search/repositories?q=${encoded_query}&per_page=${limit}&sort=stars&order=desc")
  total=$(echo "$result" | jq '.total_count')

  local items
  items=$(echo "$result" | jq '.items | length')
  if [[ "$items" -eq 0 ]]; then
    yellow "No repositories found."
    return
  fi

  echo ""
  echo "$result" | jq -r '.items[] |
    "  \(.full_name)\n" +
    "         \(.description // "—" | if length > 70 then .[0:70] + "…" else . end)\n" +
    "         \(.visibility)  ★\(.stargazers_count)  \(.language // "—")  \(.updated_at[0:10])"'
  echo ""
  dim "Showing ${items} of ${total} total results"
}
