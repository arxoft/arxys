#!/usr/bin/env bash
# =============================================================================
# lib/github/issue.sh — issue subcommands
# Requires: lib/common.sh and lib/github/common.sh sourced first.
#
# --repo owner/repo is required on every command. No default repo.
#
# Commands:
#   github issue list    --repo o/r  [--state open|closed|all] [--label <label>] [--mine]
#   github issue show    --repo o/r  <number>
#   github issue create  --repo o/r  --title "..." [--body "..."] [--label <l>] [--assignee <login>]
#   github issue update  --repo o/r  <number> <field> <value>
#   github issue comment --repo o/r  <number> "text"
# =============================================================================

cmd_issue_list() {
  require_github_env
  local state="open" label="" mine=0
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)   remaining+=("$1" "$2"); shift 2 ;;
      --state)  state="$2";  shift 2 ;;
      --label)  label="$2";  shift 2 ;;
      --mine)   mine=1;      shift   ;;
      *)        remaining+=("$1"); shift ;;
    esac
  done

  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo

  local qs="state=${state}&per_page=50&sort=updated&direction=desc"
  [[ -n "$label" ]] && qs="${qs}&labels=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$label")"

  info "Fetching issues (${_GH_OWNER}/${_GH_REPO}, state: ${state})..."
  local result
  result=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/issues?${qs}")
  # GitHub's issues endpoint includes PRs — filter them out
  result=$(echo "$result" | jq '[.[] | select(.pull_request == null)]')

  local count
  count=$(echo "$result" | jq 'length')

  if [[ "$mine" -eq 1 ]]; then
    local me
    me=$(github_get "/user" | jq -r '.login')
    result=$(echo "$result" | jq --arg u "$me" '[.[] | select(.assignees[].login == $u)]')
    count=$(echo "$result" | jq 'length')
  fi

  if [[ "$count" -eq 0 ]]; then
    yellow "No issues found."
    return
  fi

  echo ""
  echo "$result" | jq -r '.[] |
    "  #\(.number)  [\(.state)]  \(.title | if length > 60 then .[0:60] + "…" else . end)" +
    "\n         labels: \([.labels[].name] | if length > 0 then join(", ") else "—" end)  \(.updated_at[0:10])"'
  echo ""
  dim "Total: $count"
}

cmd_issue_show() {
  require_github_env
  local number=""
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo) remaining+=("$1" "$2"); shift 2 ;;
      *)      [[ -z "$number" ]] && number="$1" || remaining+=("$1"); shift ;;
    esac
  done

  [[ -z "$number" ]] && die "Usage: github issue show <number> --repo owner/repo"
  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo

  info "Fetching issue #${number} (${_GH_OWNER}/${_GH_REPO})..."
  local issue comments
  issue=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/issues/${number}")
  comments=$(github_get "/repos/${_GH_OWNER}/${_GH_REPO}/issues/${number}/comments")

  echo ""
  bold "══════════════════════════════════════════════════"
  bold " Issue #${number}: $(echo "$issue" | jq -r '.title')"
  bold "══════════════════════════════════════════════════"
  echo ""

  printf "  \033[1m%-14s\033[0m %s\n" "State:"     "$(echo "$issue" | jq -r '.state')"
  printf "  \033[1m%-14s\033[0m %s\n" "Author:"    "$(echo "$issue" | jq -r '.user.login')"
  printf "  \033[1m%-14s\033[0m %s\n" "Assignees:" "$(echo "$issue" | jq -r '[.assignees[].login] | if length > 0 then join(", ") else "—" end')"
  printf "  \033[1m%-14s\033[0m %s\n" "Labels:"    "$(echo "$issue" | jq -r '[.labels[].name] | if length > 0 then join(", ") else "—" end')"
  printf "  \033[1m%-14s\033[0m %s\n" "Updated:"   "$(echo "$issue" | jq -r '.updated_at[0:10]')"
  printf "  \033[1m%-14s\033[0m %s\n" "URL:"       "$(echo "$issue" | jq -r '.html_url')"

  local body_text
  body_text=$(echo "$issue" | jq -r '.body // ""')
  if [[ -n "$body_text" ]]; then
    echo ""
    bold "Description:"
    echo "$body_text" | head -20
    local total_lines
    total_lines=$(echo "$body_text" | wc -l)
    [[ "$total_lines" -gt 20 ]] && dim "  … (truncated, ${total_lines} lines total)"
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

cmd_issue_create() {
  require_github_env
  local title="" body="" label="" assignee=""
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)     remaining+=("$1" "$2"); shift 2 ;;
      --title)    title="$2";    shift 2 ;;
      --body)     body="$2";     shift 2 ;;
      --label)    label="$2";    shift 2 ;;
      --assignee) assignee="$2"; shift 2 ;;
      *)          remaining+=("$1"); shift ;;
    esac
  done

  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo
  [[ -z "$title" ]] && die "Usage: github issue create --repo owner/repo --title \"...\" [--body \"...\"] [--label <label>] [--assignee <login>]"

  local payload
  payload=$(jq -n \
    --arg  title    "$title"    \
    --arg  body     "$body"     \
    --arg  label    "$label"    \
    --arg  assignee "$assignee" \
    '{
      title: $title,
      body:  $body,
      labels:    (if $label    != "" then [$label]    else [] end),
      assignees: (if $assignee != "" then [$assignee] else [] end)
    }')

  info "Creating issue in ${_GH_OWNER}/${_GH_REPO}..."
  local result
  result=$(github_post "/repos/${_GH_OWNER}/${_GH_REPO}/issues" "$payload")

  green "✓ Issue created!"
  echo "  #$(echo "$result" | jq -r '.number')  $(echo "$result" | jq -r '.title')"
  echo "  $(echo "$result" | jq -r '.html_url')"
}

cmd_issue_update() {
  require_github_env
  local number="" field="" value=""
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo) remaining+=("$1" "$2"); shift 2 ;;
      *)
        if   [[ -z "$number" ]]; then number="$1"
        elif [[ -z "$field"  ]]; then field="$1"
        elif [[ -z "$value"  ]]; then value="$1"
        else remaining+=("$1")
        fi
        shift ;;
    esac
  done

  [[ -z "$number" || -z "$field" || -z "$value" ]] && \
    die "Usage: github issue update <number> <field> <value> --repo owner/repo  (fields: title, body, state, assignee, label)"
  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo

  local payload
  case "${field,,}" in
    title)    payload=$(jq -n --arg v "$value" '{title: $v}') ;;
    body)     payload=$(jq -n --arg v "$value" '{body: $v}') ;;
    state)    payload=$(jq -n --arg v "$value" '{state: $v}') ;;
    assignee) payload=$(jq -n --arg v "$value" '{assignees: [$v]}') ;;
    label)    payload=$(jq -n --arg v "$value" '{labels: [$v]}') ;;
    *) die "Unknown field '${field}'. Supported: title, body, state, assignee, label" ;;
  esac

  info "Updating issue #${number} (${_GH_OWNER}/${_GH_REPO})..."
  github_patch "/repos/${_GH_OWNER}/${_GH_REPO}/issues/${number}" "$payload" > /dev/null
  green "✓ Issue #${number} updated: ${field} → ${value}"
}

cmd_issue_comment() {
  require_github_env
  local number="" text=""
  local -a remaining=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo) remaining+=("$1" "$2"); shift 2 ;;
      *)
        if   [[ -z "$number" ]]; then number="$1"
        elif [[ -z "$text"   ]]; then text="$1"
        else remaining+=("$1")
        fi
        shift ;;
    esac
  done

  [[ -z "$number" || -z "$text" ]] && die "Usage: github issue comment <number> \"text\" --repo owner/repo"
  parse_repo_flag "${remaining[@]+"${remaining[@]}"}"
  require_github_repo

  local payload
  payload=$(jq -n --arg body "$text" '{body: $body}')

  info "Adding comment to issue #${number} (${_GH_OWNER}/${_GH_REPO})..."
  local result
  result=$(github_post "/repos/${_GH_OWNER}/${_GH_REPO}/issues/${number}/comments" "$payload")
  green "✓ Comment added to issue #${number} (id: $(echo "$result" | jq -r '.id'))"
}
