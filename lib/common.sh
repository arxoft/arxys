#!/usr/bin/env bash
# =============================================================================
# lib/common.sh — shared utilities for all CLI modules
# Sourced by the main dispatcher; do not execute directly.
# =============================================================================

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
die()    { echo -e "\033[31mERROR:\033[0m $*" >&2; exit 1; }
info()   { echo -e "\033[36m$*\033[0m"; }
bold()   { echo -e "\033[1m$*\033[0m"; }
dim()    { echo -e "\033[2m$*\033[0m"; }
green()  { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

# ---------------------------------------------------------------------------
# Dependency + env guards
# ---------------------------------------------------------------------------
require_deps() {
  for cmd in curl jq; do
    if ! command -v "$cmd" &>/dev/null; then
      if [[ "$cmd" == "jq" && ("$(uname -s)" == MINGW* || "$(uname -s)" == CYGWIN* || "$(uname -s)" == MSYS*) ]]; then
        die "'jq' is required but not installed.
  Install jq on Windows (pick one):
    winget install jqlang.jq
    choco install jq
    scoop install jq
    Or download from https://jqlang.github.io/jq/download/ and add to PATH."
      else
        die "'$cmd' is required but not installed."
      fi
    fi
  done
}

require_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "\033[31mERROR:\033[0m .env.arxws not found in current directory (${PWD})" >&2
    echo "" >&2
    echo "Create .env.arxws with:" >&2
    echo "  NOTION_API_KEY=secret_xxxx       # from notion.so/profile/integrations" >&2
    echo "  NOTION_DATABASE_ID=xxxx          # from board URL: notion.so/.../<THIS_PART>?v=..." >&2
    echo "" >&2
    echo "Run 'arxws notion help' for setup instructions." >&2
    exit 1
  fi
  [[ -z "$NOTION_API_KEY" ]]     && die "NOTION_API_KEY is not set in .env.arxws"
  [[ -z "$NOTION_DATABASE_ID" ]] && die "NOTION_DATABASE_ID is not set in .env.arxws"
}

# ---------------------------------------------------------------------------
# Notion API wrappers
# ---------------------------------------------------------------------------
_notion_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local response

  if [[ "$method" == "GET" ]]; then
    response=$(curl -s \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: ${NOTION_VERSION}" \
      -H "Content-Type: application/json" \
      "${NOTION_BASE_URL}${path}")
  else
    response=$(curl -s \
      -X "$method" \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: ${NOTION_VERSION}" \
      -H "Content-Type: application/json" \
      --data "${body:-{\}}" \
      "${NOTION_BASE_URL}${path}")
  fi

  local obj
  obj=$(echo "$response" | jq -r '.object // ""')
  if [[ "$obj" == "error" ]]; then
    local msg
    msg=$(echo "$response" | jq -r '.message // "unknown error"')
    die "Notion API error: $msg"
  fi

  echo "$response"
}

notion_get()   { _notion_request GET   "$1"; }
notion_post()  { _notion_request POST  "$1" "$2"; }
notion_patch() { _notion_request PATCH "$1" "$2"; }

# ---------------------------------------------------------------------------
# Resolve task No. → page_id
# ---------------------------------------------------------------------------
resolve_page_id() {
  local no="$1"
  local result page_id
  result=$(notion_post "/databases/${NOTION_DATABASE_ID}/query" \
    "{\"filter\":{\"property\":\"ID\",\"unique_id\":{\"equals\":${no}}}}")
  page_id=$(echo "$result" | jq -r '.results[0].id // empty')
  [[ -z "$page_id" ]] && die "No task found with No. = ${no}"
  echo "$page_id"
}

# ---------------------------------------------------------------------------
# Resolve email(s) → user ID(s)
# ---------------------------------------------------------------------------
_users_json_cache=""

_fetch_users() {
  if [[ -z "$_users_json_cache" ]]; then
    _users_json_cache=$(notion_get "/users")
  fi
  echo "$_users_json_cache"
}

resolve_user_id() {
  local input="$1"
  # Pass UUIDs through unchanged
  if [[ "$input" =~ ^[0-9a-fA-F-]{32,36}$ ]]; then
    echo "$input"; return
  fi

  local users_json email_lower uid valid
  users_json=$(_fetch_users)
  email_lower="${input,,}"

  uid=$(echo "$users_json" | jq -r --arg e "$email_lower" '
    .results[] | select(.type == "person")
    | select((.person.email | ascii_downcase) == $e)
    | .id
  ' | head -1)

  if [[ -z "$uid" ]]; then
    valid=$(echo "$users_json" | jq -r \
      '[.results[] | select(.type=="person") | .person.email | ascii_downcase] | sort | join(", ")')
    die "Unknown email '${input}'. Valid emails: ${valid}"
  fi

  echo "$uid"
}

_RESOLVED_PEOPLE=""

resolve_user_ids() {
  local input="$1"
  local people_array="[]"

  IFS=',' read -ra raw_inputs <<< "$input"
  for raw in "${raw_inputs[@]}"; do
    local email uid
    email="${raw#"${raw%%[![:space:]]*}"}"
    email="${email%"${email##*[![:space:]]}"}"

    uid=$(resolve_user_id "$email")
    people_array=$(echo "$people_array" | jq \
      --arg id "$uid" \
      '. + [{"object":"user","id":$id}]')
  done

  _RESOLVED_PEOPLE="$people_array"
}

# ---------------------------------------------------------------------------
# Build a property patch body from type + value
# ---------------------------------------------------------------------------
build_prop_body() {
  local prop_type="$1"
  local value="$2"

  case "$prop_type" in
    title)        jq -n --arg v "$value" '{title:        [{type:"text",text:{content:$v}}]}' ;;
    rich_text)    jq -n --arg v "$value" '{rich_text:    [{type:"text",text:{content:$v}}]}' ;;
    select)       jq -n --arg v "$value" '{select:       {name:$v}}' ;;
    status)       jq -n --arg v "$value" '{status:       {name:$v}}' ;;
    multi_select) jq -n --arg v "$value" \
                    '{multi_select: ($v | split(",") | map(ltrimstr(" ") | rtrimstr(" ")) | map({name:.}))}' ;;
    number)       jq -n --argjson v "$value" '{number: $v}' ;;
    checkbox)
      local bv="false"
      [[ "$value" == "true" || "$value" == "1" || "$value" == "yes" ]] && bv="true"
      jq -n --argjson v "$bv" '{checkbox: $v}' ;;
    url)          jq -n --arg v "$value" '{url:          $v}' ;;
    email)        jq -n --arg v "$value" '{email:        $v}' ;;
    phone_number) jq -n --arg v "$value" '{phone_number: $v}' ;;
    date)         jq -n --arg v "$value" '{date:         {start:$v}}' ;;
    relation)     jq -n --arg v "$value" '{relation:     [{id:$v}]}' ;;
    people)
      resolve_user_ids "$value"
      jq -n --argjson arr "$_RESOLVED_PEOPLE" '{people: $arr}' ;;
    *)  die "Property type '${prop_type}' is not supported for this operation." ;;
  esac
}

# ---------------------------------------------------------------------------
# Pretty-print a single property value
# ---------------------------------------------------------------------------
print_property() {
  local name="$1"
  local prop="$2"
  local type value=""
  type=$(echo "$prop" | jq -r '.type')

  case "$type" in
    title)            value=$(echo "$prop" | jq -r '.title | map(.plain_text) | join("")') ;;
    rich_text)        value=$(echo "$prop" | jq -r '.rich_text | map(.plain_text) | join("")') ;;
    number)           value=$(echo "$prop" | jq -r '.number // ""') ;;
    select)           value=$(echo "$prop" | jq -r '.select.name // ""') ;;
    multi_select)     value=$(echo "$prop" | jq -r '[.multi_select[].name] | join(", ")') ;;
    status)           value=$(echo "$prop" | jq -r '.status.name // ""') ;;
    date)             value=$(echo "$prop" | jq -r \
                        'if .date then (.date.start + (if .date.end then " → " + .date.end else "" end)) else "" end') ;;
    checkbox)         value=$(echo "$prop" | jq -r 'if .checkbox then "✓" else "✗" end') ;;
    url)              value=$(echo "$prop" | jq -r '.url // ""') ;;
    email)            value=$(echo "$prop" | jq -r '.email // ""') ;;
    phone_number)     value=$(echo "$prop" | jq -r '.phone_number // ""') ;;
    people)           value=$(echo "$prop" | jq -r '[.people[].name // .people[].id] | join(", ")') ;;
    relation)         value=$(echo "$prop" | jq -r '[.relation[].id] | join(", ")') ;;
    unique_id)        value=$(echo "$prop" | jq -r '(.unique_id.prefix // "") + (.unique_id.number | tostring)') ;;
    created_time)     value=$(echo "$prop" | jq -r '.created_time // ""') ;;
    last_edited_time) value=$(echo "$prop" | jq -r '.last_edited_time // ""') ;;
    created_by)       value=$(echo "$prop" | jq -r '.created_by.name // .created_by.id // ""') ;;
    last_edited_by)   value=$(echo "$prop" | jq -r '.last_edited_by.name // .last_edited_by.id // ""') ;;
    files)            value=$(echo "$prop" | jq -r '[.files[].name] | join(", ")') ;;
    *)                value="[type: $type]" ;;
  esac

  printf "  \033[1m%-25s\033[0m %s\n" "${name}:" "$value"
}
