#!/usr/bin/env bash
# =============================================================================
# lib/github/pr.sh — pull request subcommands
# Requires: lib/common.sh and lib/github/common.sh sourced first.
#
# --repo owner/repo is required on every command. There is no default repo
# because a workspace typically spans multiple repos. The caller (agent or
# human) must always name the target repo explicitly.
#
# Commands:
#   github pr list   --repo o/r  [--state open|closed|all] [--mine]
#   github pr show   --repo o/r  <number>
#   github pr create --repo o/r  --title "..." --head <branch> [--base <branch>] [--body "..."] [--draft]
#   github pr merge  --repo o/r  <number>  [--method merge|squash|rebase]
#   github pr review --repo o/r  <number>  --action approve|request-changes|comment [--body "..."]
#   github pr files  --repo o/r  <number>
#   github pr status --repo o/r  <number>
# =============================================================================

cmd_pr_list() {
  require_github_env
  local state="open" mine=0
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)  remaining+=("$1" "$2"); shift 2 ;;
      --state) state="$2"; shift 2 ;;
      --mine)  mine=1; shift ;;
      *)       remaining+=("$1"); shift ;;
    esac
  done

  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo

  info "Fetching pull requests (${_GH_OWNER}/${_GH_REPO}, state: ${state})..."
  local result
  result=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/pulls?state=${state}&per_page=50&sort=updated&direction=desc")

  local count
  count=$(echo "$result" | jq 'length')
  if [[ "$count" -eq 0 ]]; then
    yellow "No pull requests found."
    return
  fi

  if [[ "$mine" -eq 1 ]]; then
    local me
    me=$(github_get "/user" | jq -r '.login')
    result=$(echo "$result" | jq --arg u "$me" '[.[] | select(.user.login == $u)]')
    count=$(echo "$result" | jq 'length')
    [[ "$count" -eq 0 ]] && { yellow "No pull requests from you."; return; }
  fi

  echo ""
  echo "$result" | jq -r '.[] |
    "  #\(.number)  [\(.state)]  \(.title | if length > 60 then .[0:60] + "…" else . end)" +
    "\n         \(.head.ref) → \(.base.ref)  by \(.user.login)  \(.updated_at[0:10])"'
  echo ""
  dim "Total: $count"
}

cmd_pr_show() {
  require_github_env
  local number=""
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo) remaining+=("$1" "$2"); shift 2 ;;
      *)      [[ -z "$number" ]] && number="$1" || remaining+=("$1"); shift ;;
    esac
  done

  [[ -z "$number" ]] && die "Usage: github pr show <number> --repo owner/repo"
  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo

  info "Fetching PR #${number} (${_GH_OWNER}/${_GH_REPO})..."
  local pr reviews comments
  pr=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/pulls/${number}")
  reviews=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/pulls/${number}/reviews")
  comments=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/issues/${number}/comments")

  echo ""
  bold "══════════════════════════════════════════════════"
  bold " PR #${number}: $(echo "$pr" | jq -r '.title')"
  bold "══════════════════════════════════════════════════"
  echo ""

  printf "  \033[1m%-18s\033[0m %s\n" "State:"     "$(echo "$pr" | jq -r '.state') $(echo "$pr" | jq -r 'if .draft then "(draft)" else "" end')"
  printf "  \033[1m%-18s\033[0m %s\n" "Author:"    "$(echo "$pr" | jq -r '.user.login')"
  printf "  \033[1m%-18s\033[0m %s\n" "Branch:"    "$(echo "$pr" | jq -r '.head.ref') → $(echo "$pr" | jq -r '.base.ref')"
  printf "  \033[1m%-18s\033[0m %s\n" "Mergeable:" "$(echo "$pr" | jq -r '.mergeable // "unknown"')"
  printf "  \033[1m%-18s\033[0m %s\n" "Updated:"   "$(echo "$pr" | jq -r '.updated_at[0:10]')"
  printf "  \033[1m%-18s\033[0m %s\n" "URL:"       "$(echo "$pr" | jq -r '.html_url')"

  local body_text
  body_text=$(echo "$pr" | jq -r '.body // ""')
  if [[ -n "$body_text" ]]; then
    echo ""
    bold "Description:"
    echo "$body_text" | head -20
    local total_lines
    total_lines=$(echo "$body_text" | wc -l)
    [[ "$total_lines" -gt 20 ]] && dim "  … (truncated, ${total_lines} lines total)"
  fi

  echo ""
  bold "Reviews:"
  local review_count
  review_count=$(echo "$reviews" | jq 'length')
  if [[ "$review_count" -eq 0 ]]; then
    dim "  (no reviews)"
  else
    echo "$reviews" | jq -r '.[] |
      "  [\(.submitted_at[0:10])] \(.user.login): \(.state)"'
  fi

  echo ""
  bold "Comments:"
  local comment_count
  comment_count=$(echo "$comments" | jq 'length')
  if [[ "$comment_count" -eq 0 ]]; then
    dim "  (no comments)"
  else
    echo "$comments" | jq -r '.[] |
      "  [\(.created_at[0:10])] \(.user.login): \(.body | if length > 100 then .[0:100] + "…" else . end)"'
  fi
  echo ""
}

cmd_pr_create() {
  require_github_env
  local title="" head="" base="main" body="" draft=0
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)   remaining+=("$1" "$2"); shift 2 ;;
      --title)  title="$2";  shift 2 ;;
      --head)   head="$2";   shift 2 ;;
      --base)   base="$2";   shift 2 ;;
      --body)   body="$2";   shift 2 ;;
      --draft)  draft=1;     shift   ;;
      *)        remaining+=("$1"); shift ;;
    esac
  done

  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo
  [[ -z "$title" ]] && die "Usage: github pr create --repo owner/repo --title \"...\" --head <branch> [--base <branch>] [--body \"...\"] [--draft]"
  [[ -z "$head"  ]] && die "--head <branch> is required"

  local payload
  payload=$(jq -n \
    --arg title "$title" \
    --arg head  "$head"  \
    --arg base  "$base"  \
    --arg body  "$body"  \
    --argjson draft "$draft" \
    '{title: $title, head: $head, base: $base, body: $body, draft: ($draft == 1)}')

  info "Creating PR in ${_GH_OWNER}/${_GH_REPO}..."
  local result
  result=$(github_post "/repos/${_GH_OWNER}/${_GH_REPO}/pulls" "$payload")

  green "✓ Pull request created!"
  echo "  #$(echo "$result" | jq -r '.number')  $(echo "$result" | jq -r '.title')"
  echo "  $(echo "$result" | jq -r '.html_url')"
}

cmd_pr_merge() {
  require_github_env
  local number="" method="squash"
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)   remaining+=("$1" "$2"); shift 2 ;;
      --method) method="$2"; shift 2 ;;
      *)        [[ -z "$number" ]] && number="$1" || remaining+=("$1"); shift ;;
    esac
  done

  [[ -z "$number" ]] && die "Usage: github pr merge <number> --repo owner/repo [--method merge|squash|rebase]"
  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo

  local payload
  payload=$(jq -n --arg m "$method" '{merge_method: $m}')

  info "Merging PR #${number} (${_GH_OWNER}/${_GH_REPO}, method: ${method})..."
  github_put "/repos/${_GH_OWNER}/${_GH_REPO}/pulls/${number}/merge" "$payload" > /dev/null
  green "✓ PR #${number} merged."
}

cmd_pr_review() {
  require_github_env
  local number="" action="" body=""
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)   remaining+=("$1" "$2"); shift 2 ;;
      --action) action="$2"; shift 2 ;;
      --body)   body="$2";   shift 2 ;;
      *)        [[ -z "$number" ]] && number="$1" || remaining+=("$1"); shift ;;
    esac
  done

  [[ -z "$number" ]] && die "Usage: github pr review <number> --repo owner/repo --action approve|request-changes|comment [--body \"...\"]"
  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo
  [[ -z "$action" ]] && die "--action is required: approve | request-changes | comment"

  case "${action,,}" in
    approve)          action="APPROVE" ;;
    request-changes)  action="REQUEST_CHANGES" ;;
    comment)          action="COMMENT" ;;
    *) die "Unknown action '${action}'. Use: approve, request-changes, comment" ;;
  esac

  local payload
  payload=$(jq -n --arg event "$action" --arg body "$body" '{event: $event, body: $body}')

  info "Submitting review on PR #${number} (${_GH_OWNER}/${_GH_REPO})..."
  github_post "/repos/${_GH_OWNER}/${_GH_REPO}/pulls/${number}/reviews" "$payload" > /dev/null
  green "✓ Review submitted (${action}) on PR #${number}."
}

cmd_pr_files() {
  require_github_env
  local number=""
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo) remaining+=("$1" "$2"); shift 2 ;;
      *)      [[ -z "$number" ]] && number="$1" || remaining+=("$1"); shift ;;
    esac
  done

  [[ -z "$number" ]] && die "Usage: github pr files <number> --repo owner/repo"
  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo

  info "Fetching files for PR #${number} (${_GH_OWNER}/${_GH_REPO})..."
  local result count
  result=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/pulls/${number}/files?per_page=100")
  count=$(echo "$result" | jq 'length')

  if [[ "$count" -eq 0 ]]; then
    yellow "No files found for PR #${number}."
    return
  fi

  echo ""
  bold "Files changed in PR #${number}:"
  echo ""
  echo "$result" | jq -r '.[] |
    "  \(
        if   .status == "added"    then "\u001b[32m+"
        elif .status == "removed"  then "\u001b[31m-"
        elif .status == "renamed"  then "\u001b[33m~"
        else                            "\u001b[36mM"
        end
      )\u001b[0m  \(.filename)  \u001b[2m(+\(.additions) -\(.deletions))\u001b[0m"'
  echo ""
  dim "Total: ${count} file(s)  +$(echo "$result" | jq '[.[].additions] | add')  -$(echo "$result" | jq '[.[].deletions] | add')"
}

cmd_pr_status() {
  require_github_env
  local number=""
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo) remaining+=("$1" "$2"); shift 2 ;;
      *)      [[ -z "$number" ]] && number="$1" || remaining+=("$1"); shift ;;
    esac
  done

  [[ -z "$number" ]] && die "Usage: github pr status <number> --repo owner/repo"
  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo

  info "Fetching CI status for PR #${number} (${_GH_OWNER}/${_GH_REPO})..."

  # Get the PR's head SHA first
  local pr head_sha
  pr=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/pulls/${number}")
  head_sha=$(echo "$pr" | jq -r '.head.sha')

  # Combined status (legacy Status API)
  local combined
  combined=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/commits/${head_sha}/status")

  # Check runs (GitHub Actions / newer checks API)
  local check_runs
  check_runs=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/commits/${head_sha}/check-runs?per_page=100")

  echo ""
  bold "CI status for PR #${number} ($(echo "$pr" | jq -r '.head.ref')):"
  echo ""

  # Print combined state
  local state
  state=$(echo "$combined" | jq -r '.state')
  local state_color
  case "$state" in
    success) state_color="\033[32m" ;;
    failure|error) state_color="\033[31m" ;;
    pending) state_color="\033[33m" ;;
    *) state_color="\033[0m" ;;
  esac
  printf "  ${state_color}%-10s\033[0m overall state\n" "$state"

  # Print individual check runs
  local run_count
  run_count=$(echo "$check_runs" | jq '.check_runs | length')
  if [[ "$run_count" -gt 0 ]]; then
    echo ""
    bold "  Check runs:"
    echo "$check_runs" | jq -r '.check_runs[] |
      "  \(
          if   .conclusion == "success"  then "\u001b[32m✓"
          elif .conclusion == "failure"  then "\u001b[31m✗"
          elif .conclusion == "skipped"  then "\u001b[2m-"
          elif .status     == "in_progress" then "\u001b[33m●"
          else                               "\u001b[33m?"
          end
        )\u001b[0m  \(.name)  \u001b[2m\(.conclusion // .status)\u001b[0m"'
  fi

  # Print legacy statuses
  local status_count
  status_count=$(echo "$combined" | jq '.statuses | length')
  if [[ "$status_count" -gt 0 ]]; then
    echo ""
    bold "  Statuses:"
    echo "$combined" | jq -r '.statuses[] |
      "  \(
          if   .state == "success" then "\u001b[32m✓"
          elif .state == "failure" then "\u001b[31m✗"
          elif .state == "error"   then "\u001b[31m!"
          else                          "\u001b[33m●"
          end
        )\u001b[0m  \(.context)  \u001b[2m\(.state)\u001b[0m"'
  fi

  echo ""
}
