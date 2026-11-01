#!/usr/bin/env bash
# =============================================================================
# lib/github/common.sh — GitHub REST API helpers
# Sourced by the main dispatcher; do not execute directly.
#
# Required env vars (set in .env.notion):
#   GITHUB_TOKEN   — personal access token or fine-grained PAT
#
# GITHUB_OWNER and GITHUB_REPO are not configured — the owner is always
# derived from the --repo owner/repo argument. This is intentional: a
# workspace spans multiple repos, and the caller (agent or human) must
# name the target repo explicitly on every command.
# =============================================================================

GITHUB_API_VERSION="2022-11-28"
GITHUB_BASE_URL="https://api.github.com"

require_github_env() {
  [[ -z "${GITHUB_TOKEN:-}" ]] && die "GITHUB_TOKEN is not set. Add it to .env.notion"
}

require_github_repo() {
  [[ -z "${_GH_OWNER:-}" || -z "${_GH_REPO:-}" ]] && \
    die "--repo <owner/repo> is required (e.g. --repo acme-corp/backend)"
}

# ---------------------------------------------------------------------------
# Core request wrapper
# ---------------------------------------------------------------------------
_github_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local response http_code

  local tmp_body
  tmp_body=$(mktemp)
  echo "${body:-{\}}" > "$tmp_body"

  if [[ "$method" == "GET" ]]; then
    response=$(curl -s -w "\n%{http_code}" \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: ${GITHUB_API_VERSION}" \
      "${GITHUB_BASE_URL}${path}")
  else
    response=$(curl -s -w "\n%{http_code}" \
      -X "$method" \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: ${GITHUB_API_VERSION}" \
      -H "Content-Type: application/json" \
      --data @"$tmp_body" \
      "${GITHUB_BASE_URL}${path}")
  fi

  rm -f "$tmp_body"

  http_code=$(echo "$response" | tail -n1)
  local body_out
  body_out=$(echo "$response" | head -n -1)

  if [[ "$http_code" -ge 400 ]]; then
    local msg
    msg=$(echo "$body_out" | jq -r '.message // "unknown error"')
    die "GitHub API error ${http_code}: $msg"
  fi

  echo "$body_out"
}

github_get()    { _github_request GET    "$1"; }
github_post()   { _github_request POST   "$1" "$2"; }
github_patch()  { _github_request PATCH  "$1" "$2"; }
github_put()    { _github_request PUT    "$1" "$2"; }
github_delete() { _github_request DELETE "$1"; }

# ---------------------------------------------------------------------------
# --repo flag parser
#
# Parses --repo owner/repo from the argument list and sets _GH_OWNER / _GH_REPO.
# owner/repo format is required — bare repo names are not accepted.
# Callers that need a specific repo must call require_github_repo afterward.
# ---------------------------------------------------------------------------
_GH_OWNER=""
_GH_REPO=""

parse_repo_flag() {
  _GH_OWNER=""
  _GH_REPO=""

  local -a remaining=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        [[ $# -lt 2 ]] && die "--repo requires an owner/repo argument (e.g. --repo acme-corp/backend)"
        [[ "$2" != */* ]] && die "--repo must be in owner/repo format (e.g. --repo acme-corp/backend)"
        _GH_OWNER="${2%%/*}"
        _GH_REPO="${2##*/}"
        shift 2 ;;
      *) remaining+=("$1"); shift ;;
    esac
  done

  set -- "${remaining[@]+"${remaining[@]}"}"
}
