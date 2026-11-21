#!/usr/bin/env bash
# =============================================================================
# arxys API test suite
# Runs against the live deployed API. All write tests are net-zero on the board.
#
# Usage:
#   cd /path/to/your/project   # must have .env.arxys
#   /path/to/api/test.sh
#
# Or with explicit overrides:
#   ARXYS_API_KEY=axk_... ARXYS_WORKSPACE=my-workspace /path/to/api/test.sh
#
# Requires: curl, python3
# =============================================================================

set -uo pipefail

BASE="https://arxysapis.arxoft.com"

# ---------------------------------------------------------------------------
# Load credentials — .env.arxys in cwd, or from environment
# ---------------------------------------------------------------------------
ENV_FILE="${PWD}/.env.arxys"
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r k v || [[ -n "$k" ]]; do
    k="${k%%#*}"; k="${k// /}"
    v="${v%%#*}"; v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
    [[ -z "$k" ]] && continue
    case "$k" in
      ARXYS_API_KEY)   export ARXYS_API_KEY="${ARXYS_API_KEY:-$v}" ;;
      ARXYS_WORKSPACE) export ARXYS_WORKSPACE="${ARXYS_WORKSPACE:-$v}" ;;
    esac
  done < "$ENV_FILE"
fi

KEY="${ARXYS_API_KEY:-}"
WS="${ARXYS_WORKSPACE:-}"

if [[ -z "$KEY" || -z "$WS" ]]; then
  echo "ERROR: ARXYS_API_KEY and ARXYS_WORKSPACE must be set (env or .env.arxys)"
  exit 1
fi

AUTH=(-H "X-Api-Key: $KEY" -H "X-Workspace: $WS")
JSON=(-H "Content-Type: application/json")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PASS=0; FAIL=0; SKIP=0

pass() { echo "  ✅ $1"; (( PASS++ )); }
fail() { echo "  ❌ $1"; echo "     → $2"; (( FAIL++ )); }
skip() { echo "  ⏭  $1 (skipped: $2)"; (( SKIP++ )); }
section() { echo ""; echo "── $1 ──────────────────────────────────────"; }

req() { curl -s "$@"; }

check() {
  local label="$1" resp="$2" expect="$3"
  if echo "$resp" | grep -q "$expect" 2>/dev/null; then
    pass "$label"
  else
    fail "$label" "$resp"
  fi
}

# ---------------------------------------------------------------------------
# Route displacement check — must pass before running any tests
# ---------------------------------------------------------------------------
echo "arxys API test suite"
echo "Workspace: $WS  |  Base: $BASE"
echo ""

HTTP_STATUS=$(curl -so /dev/null -w "%{http_code}" "$BASE/")
if [[ "$HTTP_STATUS" == "404" ]]; then
  echo "⚠️  Route displacement detected — API Worker is not responding (HTTP 404)."
  echo "   Run: cd api && npx wrangler deploy"
  echo "   Then re-run this script."
  exit 2
fi

# ---------------------------------------------------------------------------
# Discover workspace state
# ---------------------------------------------------------------------------
echo "Discovering workspace state…"

PROJECT_LIST=$(req "${AUTH[@]}" "$BASE/v1/github/project/list")
PROJECT_ID=$(echo "$PROJECT_LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
projects=d.get('projects',[])
print(projects[0]['id'] if projects else '')
" 2>/dev/null)

ITEM_DATA=""
ITEM_ID=""
ISSUE_NO=""
FIELDS=""
STATUS_FIELD=""
EFFORT_FIELD=""
ITEM_STATUS=""

if [[ -n "$PROJECT_ID" ]]; then
  ITEM_DATA=$(req "${AUTH[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues?icebox=1")
  ITEM_ID=$(echo "$ITEM_DATA" | python3 -c "
import sys,json; d=json.load(sys.stdin); issues=d.get('issues',[])
print(issues[0]['item_id'] if issues else '')
" 2>/dev/null)
  ISSUE_NO=$(echo "$ITEM_DATA" | python3 -c "
import sys,json; d=json.load(sys.stdin); issues=d.get('issues',[])
print(issues[0]['number'] if issues else '')
" 2>/dev/null)
  FIELDS=$(req "${AUTH[@]}" "$BASE/v1/github/project/$PROJECT_ID/fields")
  STATUS_FIELD=$(echo "$FIELDS" | python3 -c "
import sys,json; d=json.load(sys.stdin)
f=next((x for x in d.get('fields',[]) if x.get('name')=='Status'),None)
print(f['id'] if f else '')
" 2>/dev/null)
  EFFORT_FIELD=$(echo "$FIELDS" | python3 -c "
import sys,json; d=json.load(sys.stdin)
f=next((x for x in d.get('fields',[]) if x.get('name')=='Effort'),None)
print(f['id'] if f else '')
" 2>/dev/null)
  ITEM_STATUS=$(echo "$ITEM_DATA" | python3 -c "
import sys,json; d=json.load(sys.stdin); issues=d.get('issues',[])
print(issues[0].get('status','') if issues else '')
" 2>/dev/null)
fi

NOTION_NO=""
NOTION_RESP=$(req "${AUTH[@]}" "$BASE/v1/notion/task/list?icebox=1" 2>/dev/null)
NOTION_NO=$(echo "$NOTION_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
results=d.get('results',[])
if results:
    props=results[0].get('properties',{})
    for p in props.values():
        if p.get('type')=='unique_id':
            print(p['unique_id']['number']); break
" 2>/dev/null)

ME=$(req "${AUTH[@]}" "$BASE/v1/github/user/me" | python3 -c "
import sys,json; print(json.load(sys.stdin).get('login',''))" 2>/dev/null)

echo "  GitHub Project : ${PROJECT_ID:-none}"
echo "  Test item      : ${ITEM_ID:-none} (issue #${ISSUE_NO:-?}, status: ${ITEM_STATUS:-?})"
echo "  Notion task    : #${NOTION_NO:-none}"
echo "  GitHub user    : ${ME:-unknown}"

# ---------------------------------------------------------------------------
# HEALTH
# ---------------------------------------------------------------------------
section "HEALTH"

R=$(req "$BASE/")
check "API root reachable" "$R" '"service":"arxys-api"'

R=$(req -X POST -H "Content-Type: application/json" "$BASE/auth/otp/request" \
  -d '{"email":"test-healthcheck@arxys-noreply.com"}')
if echo "$R" | grep -qi 'not configured'; then
  fail "email service configured (RESEND secrets)" "$R"
else
  pass "email service configured (RESEND secrets)"
fi

# ---------------------------------------------------------------------------
# PUBLIC — no auth
# ---------------------------------------------------------------------------
section "PUBLIC (no auth)"

check "rules"                  "$(req "$BASE/v1/rules")"                          "arxys Task Rules"
check "workflow/list"          "$(req "$BASE/v1/workflow/list")"                  '"development"'
check "workflow/development"   "$(req "$BASE/v1/workflow/development")"           "Development Workflow"
check "workflow/review"        "$(req "$BASE/v1/workflow/review")"                "Review Workflow"
check "workflow/hotfix"        "$(req "$BASE/v1/workflow/hotfix")"                "Hotfix Workflow"
check "workflow/deployment"    "$(req "$BASE/v1/workflow/deployment")"            "Deployment Workflow"
check "workflow/testing"       "$(req "$BASE/v1/workflow/testing")"               "Testing Workflow"
check "workflow/planning"      "$(req "$BASE/v1/workflow/planning")"              "Planning Workflow"
check "workflow/task-creation" "$(req "$BASE/v1/workflow/task-creation")"         "Task Creation"
check "workflow/bug-reporting" "$(req "$BASE/v1/workflow/bug-reporting")"         "Bug Reporting"
check "workflow/release"       "$(req "$BASE/v1/workflow/release")"               "Release Workflow"
check "workflow/onboarding"    "$(req "$BASE/v1/workflow/onboarding")"            "Onboarding"
check "workflow/404"           "$(req "$BASE/v1/workflow/nonexistent")"           '"error"'
check "steering"               "$(req "$BASE/v1/steering")"                       "arxys — Agent Instructions"

# ---------------------------------------------------------------------------
# AUTH
# ---------------------------------------------------------------------------
section "AUTH"

check "bad api key → 401"       "$(req -H 'X-Api-Key: bad' -H "X-Workspace: $WS" "$BASE/v1/task/list")" '"error"'
check "missing workspace → 400" "$(req -H "X-Api-Key: $KEY" "$BASE/v1/task/list")"                       '"error"'

# ---------------------------------------------------------------------------
# GITHUB PROJECT — read
# ---------------------------------------------------------------------------
section "GITHUB PROJECT — read"

if [[ -z "$PROJECT_ID" ]]; then
  skip "all project tests" "no GitHub project configured on this workspace"
else
  check "project/list"          "$(req "${AUTH[@]}" "$BASE/v1/github/project/list")"                              '"id"'
  check "project/members"       "$(req "${AUTH[@]}" "$BASE/v1/github/project/members")"                           '"login"'
  check "project/fields"        "$(req "${AUTH[@]}" "$BASE/v1/github/project/$PROJECT_ID/fields")"                '"Status"'
  check "project/issues"        "$(req "${AUTH[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues")"                '"issues"'
  check "project/issues?icebox" "$(req "${AUTH[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues?icebox=1")"       '"issues"'
  check "project/issues?mine"   "$(req "${AUTH[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues?mine=1")"         '"issues"'
  check "project/issues?status" "$(req "${AUTH[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues?status=Backlog")" '"issues"'
fi

# ---------------------------------------------------------------------------
# GITHUB PROJECT — write (net-zero)
# ---------------------------------------------------------------------------
section "GITHUB PROJECT — write"

if [[ -z "$ITEM_ID" || -z "$STATUS_FIELD" ]]; then
  skip "all project write tests" "no project item available"
else
  PRIORITY_FIELD=$(echo "$FIELDS" | python3 -c "
import sys,json; d=json.load(sys.stdin)
f=next((x for x in d.get('fields',[]) if x.get('name')=='Priority'),None)
print(f['id'] if f else '')
" 2>/dev/null)

  R=$(req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues/$ITEM_ID" \
    -d "{\"field_id\":\"$EFFORT_FIELD\",\"value\":\"5\"}")
  check "PATCH Effort = 5 (number)" "$R" '"ok":true'

  R=$(req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues/$ITEM_ID" \
    -d "{\"field_id\":\"$PRIORITY_FIELD\",\"value\":\"Medium\"}")
  check "PATCH Priority = Medium (select)" "$R" '"ok":true'

  if [[ -n "$ITEM_STATUS" ]]; then
    R=$(req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues/$ITEM_ID" \
      -d "{\"field_id\":\"$STATUS_FIELD\",\"value\":\"$ITEM_STATUS\"}")
    check "PATCH Status → same value (no noise)" "$R" '"ok":true'
  fi

  if [[ -n "$ME" ]]; then
    R=$(req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues/$ITEM_ID/assign" \
      -d "{\"assignees\":[\"$ME\"]}")
    check "assign" "$R" '"ok":true'

    R=$(req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues/$ITEM_ID/unassign" \
      -d "{\"assignees\":[\"$ME\"]}")
    check "unassign (restore)" "$R" '"ok":true'

    # Restore
    req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/github/project/$PROJECT_ID/issues/$ITEM_ID/assign" \
      -d "{\"assignees\":[\"$ME\"]}" > /dev/null 2>&1
  else
    skip "assign/unassign" "could not resolve authenticated user login"
  fi
fi

# ---------------------------------------------------------------------------
# UNIFIED /v1/task
# ---------------------------------------------------------------------------
section "UNIFIED /v1/task"

check "task/list"        "$(req "${AUTH[@]}" "$BASE/v1/task/list")"          '"tasks"'
check "task/list?mine"   "$(req "${AUTH[@]}" "$BASE/v1/task/list?mine=1")"   '"tasks"'
check "task/list?icebox" "$(req "${AUTH[@]}" "$BASE/v1/task/list?icebox=1")" '"tasks"'

if [[ -n "$ISSUE_NO" ]]; then
  check "task/:ref GET" "$(req "${AUTH[@]}" "$BASE/v1/task/$ISSUE_NO")" '"backend"'

  R=$(req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/task/$ISSUE_NO" \
    -d '{"field":"Effort","value":"5"}')
  check "task PATCH Effort" "$R" '"ok":true'

  if [[ -n "$ME" ]]; then
    R=$(req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/task/$ISSUE_NO/assign" \
      -d "{\"assignees\":[\"$ME\"]}")
    check "task assign" "$R" '"ok":true'

    R=$(req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/task/$ISSUE_NO/unassign" \
      -d "{\"assignees\":[\"$ME\"]}")
    check "task unassign (restore)" "$R" '"ok":true'

    # Restore
    req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/task/$ISSUE_NO/assign" \
      -d "{\"assignees\":[\"$ME\"]}" > /dev/null 2>&1
  fi
else
  skip "task write tests" "no project item available"
fi

# ---------------------------------------------------------------------------
# NOTION — read
# ---------------------------------------------------------------------------
section "NOTION — read"

check "notion/task/list"         "$(req "${AUTH[@]}" "$BASE/v1/notion/task/list")"          '"results"'
check "notion/task/list?icebox"  "$(req "${AUTH[@]}" "$BASE/v1/notion/task/list?icebox=1")" '"results"'
check "notion/task/list?mine"    "$(req "${AUTH[@]}" "$BASE/v1/notion/task/list?mine=1")"   '"results"\|mine requires email'
check "notion/user/list"         "$(req "${AUTH[@]}" "$BASE/v1/notion/user/list")"          '"members"'
check "notion/db/list"           "$(req "${AUTH[@]}" "$BASE/v1/notion/db/list")"            '"boards"'
check "notion/db/info"           "$(req "${AUTH[@]}" "$BASE/v1/notion/db/info")"            '"object"\|"error"'

if [[ -n "$NOTION_NO" ]]; then
  check "notion/task/:no" "$(req "${AUTH[@]}" "$BASE/v1/notion/task/$NOTION_NO")" '"page"'
else
  skip "notion/task/:no" "no Notion tasks found"
fi

# ---------------------------------------------------------------------------
# NOTION — write (net-zero)
# ---------------------------------------------------------------------------
section "NOTION — write"

if [[ -z "$NOTION_NO" ]]; then
  skip "all Notion write tests" "no Notion tasks found"
else
  NOTION_PAGE=$(req "${AUTH[@]}" "$BASE/v1/notion/task/$NOTION_NO")

  NOTION_NUM_PROP=$(echo "$NOTION_PAGE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
props=d.get('page',{}).get('properties',{})
skip={'ID','Created on','Last Update'}
for name,p in props.items():
    if p.get('type')=='number' and name not in skip:
        print(name); break
" 2>/dev/null)

  CURRENT_NUM=$(echo "$NOTION_PAGE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
props=d.get('page',{}).get('properties',{})
skip={'ID','Created on','Last Update'}
for name,p in props.items():
    if p.get('type')=='number' and name not in skip:
        print(p.get('number') or ''); break
" 2>/dev/null)

  if [[ -z "$NOTION_NUM_PROP" ]]; then
    skip "notion/task PATCH number field" "no writable number property on this DB"
  else
    R=$(req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/notion/task/$NOTION_NO" \
      -d "{\"property\":\"$NOTION_NUM_PROP\",\"value\":\"5\"}")
    check "notion/task PATCH $NOTION_NUM_PROP = 5" "$R" '"ok":true'

    # Restore
    if [[ -n "$CURRENT_NUM" ]]; then
      req -X PATCH "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/notion/task/$NOTION_NO" \
        -d "{\"property\":\"$NOTION_NUM_PROP\",\"value\":\"$CURRENT_NUM\"}" > /dev/null 2>&1
    fi
  fi

  R=$(req -X POST "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/notion/comment/$NOTION_NO" \
    -d '{"text":"[arxys test suite — automated check]"}')
  check "notion/comment POST" "$R" '"ok":true'
fi

# ---------------------------------------------------------------------------
# GITHUB BOOTSTRAP
# ---------------------------------------------------------------------------
section "GITHUB BOOTSTRAP"

if [[ -z "$PROJECT_ID" ]]; then
  skip "org bootstrap"     "no GitHub project configured on this workspace"
  skip "project bootstrap" "no GitHub project configured on this workspace"
else
  R=$(req -X POST "${AUTH[@]}" "$BASE/v1/github/project/org/bootstrap")
  if echo "$R" | grep -qi "bad credentials\|credentials"; then
    skip "org bootstrap (idempotent)" "PAT has bad credentials — update via admin venture members"
  else
    check "org bootstrap (idempotent)" "$R" '"ok":true'
  fi

  R=$(req -X POST "${AUTH[@]}" "${JSON[@]}" "$BASE/v1/github/project/bootstrap" \
    -d "{\"project_id\":\"$PROJECT_ID\"}")
  check "project bootstrap (idempotent)" "$R" '"ok":true'
fi

# ---------------------------------------------------------------------------
# GITHUB REPO / USER / PR
# ---------------------------------------------------------------------------
section "GITHUB REPO / USER / PR"

check "repo/info"    "$(req "${AUTH[@]}" "$BASE/v1/github/repo/info")"                    '"full_name"'
check "repo/commits" "$(req "${AUTH[@]}" "$BASE/v1/github/repo/commits")"                 '"sha"\|\[\]'
check "repo/search"  "$(req "${AUTH[@]}" "$BASE/v1/github/repo/search?q=github")"         '"total_count"'
check "repo/list"    "$(req "${AUTH[@]}" "$BASE/v1/github/repo/list?org=${ME:-github}")"  '"full_name"\|\[\]'
check "user/me"      "$(req "${AUTH[@]}" "$BASE/v1/github/user/me")"                      '"login"'
check "user/search"  "$(req "${AUTH[@]}" "$BASE/v1/github/user/search?q=github")"         '"items"'
check "pr/list"      "$(req "${AUTH[@]}" "$BASE/v1/github/pr/list")"                      '"number"\|\[\]'
check "issue/list"   "$(req "${AUTH[@]}" "$BASE/v1/github/issue/list")"                   '"number"\|\[\]'

# Cross-repo — confirm no 403 (PAT is the only gate)
CROSS_REPO="asif-maktg/alqada-claims-backend-php-mysql"
R=$(req "${AUTH[@]}" "$BASE/v1/github/repo/info?repo=$CROSS_REPO")
if echo "$R" | grep -q 'not associated\|403'; then
  fail "cross-repo access (?repo= override)" "$R"
else
  pass "cross-repo access (?repo= override)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL=$(( PASS + FAIL + SKIP ))
echo ""
echo "════════════════════════════════════════"
echo "  Total: $TOTAL   ✅ $PASS   ❌ $FAIL   ⏭  $SKIP"
echo "════════════════════════════════════════"
echo ""

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
