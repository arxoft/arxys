#!/usr/bin/env bash
# =============================================================================
# lib/notion/task.sh — task subcommands
# Requires: lib/common.sh sourced first.
# =============================================================================

cmd_task_list() {
  local filter_prop="" filter_val="" sort_prop="" sort_dir="ascending" mine=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --filter) filter_prop="$2"; filter_val="$3"; shift 3 ;;
      --mine)
        [[ -z "${NOTION_USER_EMAIL:-}" ]] && die "--mine requires NOTION_USER_EMAIL in .env.notion"
        mine=1; shift ;;
      --sort)
        sort_prop="$2"; shift 2
        if [[ $# -gt 0 && "$1" =~ ^(asc|desc|ascending|descending)$ ]]; then
          sort_dir="$1"; shift
        fi
        ;;
      *) die "Unknown option: $1" ;;
    esac
  done

  if [[ "$mine" -eq 1 ]]; then
    filter_prop="Assignee"
    filter_val="$NOTION_USER_EMAIL"
  fi

  [[ "$sort_dir" == "asc" ]]  && sort_dir="ascending"
  [[ "$sort_dir" == "desc" ]] && sort_dir="descending"

  local body="{}"

  if [[ -n "$filter_prop" && -n "$filter_val" ]]; then
    local schema prop_type real_prop_name
    schema=$(notion_get "/databases/${NOTION_DATABASE_ID}")

    prop_type=$(echo "$schema" | jq -r --arg p "$filter_prop" '
      .properties | to_entries[]
      | select((.key | ascii_downcase) == ($p | ascii_downcase))
      | .value.type
    ' | head -1)

    real_prop_name=$(echo "$schema" | jq -r --arg p "$filter_prop" '
      .properties | to_entries[]
      | select((.key | ascii_downcase) == ($p | ascii_downcase))
      | .key
    ' | head -1)

    case "$prop_type" in
      people)
        info "Resolving '${filter_val}' for people filter..."
        local uid; uid=$(resolve_user_id "$filter_val")
        body=$(jq -n --arg prop "${real_prop_name:-$filter_prop}" --arg uid "$uid" \
          '{filter: {property: $prop, people: {contains: $uid}}}') ;;
      created_by)
        info "Resolving '${filter_val}' for created_by filter..."
        local uid; uid=$(resolve_user_id "$filter_val")
        body=$(jq -n --arg prop "${real_prop_name:-$filter_prop}" --arg uid "$uid" \
          '{filter: {property: $prop, created_by: {contains: $uid}}}') ;;
      *)
        body=$(jq -n --arg prop "$filter_prop" --arg val "$filter_val" \
          '{filter: {or: [
              {property: $prop, rich_text:    {contains: $val}},
              {property: $prop, select:       {equals:   $val}},
              {property: $prop, status:       {equals:   $val}},
              {property: $prop, multi_select: {contains: $val}}
            ]}}') ;;
    esac
  fi

  if [[ -n "$sort_prop" ]]; then
    body=$(echo "$body" | jq --arg prop "$sort_prop" --arg dir "$sort_dir" \
      '. + {sorts: [{property: $prop, direction: $dir}]}')
  else
    body=$(echo "$body" | jq '. + {sorts: [{timestamp: "last_edited_time", direction: "descending"}]}')
  fi

  info "Fetching tasks..."
  local result count
  result=$(notion_post "/databases/${NOTION_DATABASE_ID}/query" "$body")
  count=$(echo "$result" | jq '.results | length')

  if [[ "$count" -eq 0 ]]; then
    yellow "No tasks found."
    return
  fi

  local statuses
  statuses=$(echo "$result" | jq -r --arg grp "$NOTION_STATUS_PROPERTY_NAME" '
    [.results[].properties
      | to_entries[]
      | select(.key == $grp)
      | .value
      | if   .type == "status" then .status.name
        elif .type == "select"  then .select.name
        else null end
      | select(. != null)
    ] | unique | .[]
  ')

  if [[ -z "$statuses" ]]; then
    yellow "No '${NOTION_STATUS_PROPERTY_NAME}' property found — listing flat:"
    echo "$result" | jq -r '
      .results[] |
      "  No." +
      (.properties | to_entries[] | select(.value.type=="unique_id") | .value.unique_id.number | tostring) +
      "  " +
      (.properties | to_entries[] | select(.value.type=="title") | .value.title | map(.plain_text) | join("") | if length > 80 then .[0:80] + "..." else . end)'
    return
  fi

  while IFS= read -r status; do
    [[ -z "$status" ]] && continue
    local group
    group=$(echo "$result" | jq -r --arg s "$status" --arg grp "$NOTION_STATUS_PROPERTY_NAME" '
      .results[]
      | select(
          (.properties | to_entries[] | select(.key==$grp) | .value
            | if   .type=="status" then .status.name
              elif .type=="select"  then .select.name
              else "" end
          ) == $s
        )
      | "  No." +
        (.properties | to_entries[] | select(.value.type=="unique_id") | .value.unique_id.number | tostring) +
        "  " +
        (.properties | to_entries[] | select(.value.type=="title") | .value.title | map(.plain_text) | join("") | if length > 80 then .[0:80] + "..." else . end)
    ')
    if [[ -n "$group" ]]; then
      echo ""
      bold "── $status ──────────────────────────────────────"
      echo "$group"
    fi
  done <<< "$statuses"

  local no_stage
  no_stage=$(echo "$result" | jq -r --arg grp "$NOTION_STATUS_PROPERTY_NAME" '
    .results[]
    | select(
        (.properties | to_entries[] | select(.key==$grp) | .value
          | if   .type=="status" then .status.name
            elif .type=="select"  then .select.name
            else null end
        ) == null
      )
    | "  No." +
      (.properties | to_entries[] | select(.value.type=="unique_id") | .value.unique_id.number | tostring) +
      "  " +
      (.properties | to_entries[] | select(.value.type=="title") | .value.title | map(.plain_text) | join("") | if length > 80 then .[0:80] + "..." else . end)
  ' 2>/dev/null || true)

  if [[ -n "$no_stage" ]]; then
    echo ""
    bold "── (no stage) ──────────────────────────────────"
    echo "$no_stage"
  fi

  echo ""
  dim "Total: $count tasks"
}

cmd_task_show() {
  local no="$1"
  info "Fetching task No. ${no}..."

  local page_id page
  page_id=$(resolve_page_id "$no")
  page=$(notion_get "/pages/${page_id}")

  echo ""
  bold "══════════════════════════════════════════════════"
  bold " Task No. ${no}"
  bold "══════════════════════════════════════════════════"
  echo ""
  bold "Properties:"

  echo "$page" | jq -c '.properties | to_entries[]' | while IFS= read -r entry; do
    local name val
    name=$(echo "$entry" | jq -r '.key')
    val=$(echo "$entry"  | jq -c '.value')
    print_property "$name" "$val"
  done

  local url
  url=$(echo "$page" | jq -r '.url // ""')
  echo ""
  dim "  URL: $url"

  echo ""
  bold "Comments:"
  local comments comment_count
  comments=$(notion_get "/comments?block_id=${page_id}")
  comment_count=$(echo "$comments" | jq '.results | length')

  if [[ "$comment_count" -eq 0 ]]; then
    dim "  (no comments)"
  else
    echo "$comments" | jq -r '.results[] |
      "  [" + .created_time[0:10] + "] " +
      (.created_by.name // "Unknown") + ": " +
      (.rich_text | map(.plain_text) | join(""))'
  fi
  echo ""
}

cmd_task_create() {
  local title=""
  declare -A extra_props=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --title) title="$2"; shift 2 ;;
      --self)
        [[ -z "${NOTION_USER_EMAIL:-}" ]] && die "--self requires NOTION_USER_EMAIL in .env.notion"
        extra_props["assignee"]="$NOTION_USER_EMAIL"
        shift ;;
      --*)
        local key="${1#--}"
        extra_props["$key"]="$2"
        shift 2 ;;
      *) die "Unknown argument: $1" ;;
    esac
  done

  [[ -z "$title" ]] && die "You must provide --title \"...\" to create a task."

  local props
  props=$(jq -n --arg t "$title" --arg tprop "$NOTION_TITLE_PROPERTY_NAME" \
    '{($tprop): {title: [{type:"text",text:{content:$t}}]}}')

  if [[ ${#extra_props[@]} -gt 0 ]]; then
    local schema
    schema=$(notion_get "/databases/${NOTION_DATABASE_ID}")

    for key in "${!extra_props[@]}"; do
      local val="${extra_props[$key]}"

      local real_key ptype
      real_key=$(echo "$schema" | jq -r --arg k "$key" '
        .properties | to_entries[]
        | select((.key | ascii_downcase) == ($k | ascii_downcase))
        | .key
      ' | head -1)

      if [[ -z "$real_key" ]]; then
        yellow "Warning: property '${key}' not found in schema, skipping."
        continue
      fi

      ptype=$(echo "$schema" | jq -r --arg k "$real_key" '.properties[$k].type')

      local patch
      patch=$(build_prop_body "$ptype" "$val") || continue
      props=$(echo "$props" | jq --arg k "$real_key" --argjson p "$patch" '.[$k] = $p')
    done
  fi

  local body result new_id url
  body=$(jq -n --arg db "$NOTION_DATABASE_ID" --argjson props "$props" \
    '{parent: {database_id: $db}, properties: $props}')

  result=$(notion_post "/pages" "$body")

  new_id=$(echo "$result" | jq -r '
    .properties | to_entries[]
    | select(.value.type=="unique_id")
    | .value.unique_id.number | tostring
  ')
  url=$(echo "$result" | jq -r '.url')

  green "✓ Task created!"
  [[ -n "$new_id" ]] && echo "  No.  : $new_id"
  echo "  URL  : $url"
}

cmd_task_update() {
  local no="$1" prop="$2" value="$3"

  info "Fetching task No. ${no}..."
  local page_id page
  page_id=$(resolve_page_id "$no")
  page=$(notion_get "/pages/${page_id}")

  local real_prop
  real_prop=$(echo "$page" | jq -r --arg p "$prop" '
    .properties | to_entries[]
    | select((.key | ascii_downcase) == ($p | ascii_downcase))
    | .key
  ' | head -1)
  [[ -z "$real_prop" ]] && die "Property '${prop}' not found on task No. ${no}."

  local prop_type prop_body body
  prop_type=$(echo "$page" | jq -r --arg p "$real_prop" '.properties[$p].type')
  prop_body=$(build_prop_body "$prop_type" "$value")

  # Auto-comment on status changes to maintain audit trail (per RULES.md)
  if [[ "$prop_type" == "status" || "$prop_type" == "select" ]] && \
     [[ "${real_prop,,}" == "status" ]]; then
    local old_status audit_text
    old_status=$(echo "$page" | jq -r --arg p "$real_prop" \
      '.properties[$p] | if .type == "status" then .status.name elif .type == "select" then .select.name else "" end')
    audit_text="Status → **${value}**"
    [[ -n "$old_status" ]] && audit_text="Status: ~~${old_status}~~ → **${value}**"
    cmd_comment_add "$no" "$audit_text" "$page_id"
  fi

  body=$(jq -n --arg p "$real_prop" --argjson pb "$prop_body" '{properties: {($p): $pb}}')
  notion_patch "/pages/${page_id}" "$body" > /dev/null
  green "✓ Updated '${real_prop}' on task No. ${no} → ${value}"
}

cmd_task_assign() {
  local no="$1" handles_input="${2:-}"

  if [[ "$handles_input" == "--self" || -z "$handles_input" ]]; then
    if [[ "$handles_input" == "--self" ]]; then
      [[ -z "${NOTION_USER_EMAIL:-}" ]] && die "--self requires NOTION_USER_EMAIL in .env.notion"
      handles_input="$NOTION_USER_EMAIL"
    else
      die "Usage: notion task assign <No.> <email[,email,...]|--self>"
    fi
  fi

  info "Resolving emails..."
  resolve_user_ids "$handles_input"
  local people_array="$_RESOLVED_PEOPLE"

  info "Fetching task No. ${no}..."
  local page_id page prop_name
  page_id=$(resolve_page_id "$no")
  page=$(notion_get "/pages/${page_id}")

  prop_name=$(echo "$page" | jq -r '
    .properties | to_entries[] | select(.value.type == "people") | .key
  ' | head -1)
  [[ -z "$prop_name" ]] && die "No 'people' property found on task No. ${no}."

  local body
  body=$(jq -n --arg p "$prop_name" --argjson arr "$people_array" \
    '{properties: {($p): {people: $arr}}}')

  notion_patch "/pages/${page_id}" "$body" > /dev/null
  green "✓ Assigned '${prop_name}' on task No. ${no} → ${handles_input}"
}

cmd_task_unassign() {
  local no="$1" handles_input="$2"
  [[ -z "$handles_input" ]] && die "Usage: notion task unassign <No.> <email[,email,...]>"

  info "Fetching task No. ${no}..."
  local page_id page prop_name
  page_id=$(resolve_page_id "$no")
  page=$(notion_get "/pages/${page_id}")

  prop_name=$(echo "$page" | jq -r '
    .properties | to_entries[] | select(.value.type == "people") | .key
  ' | head -1)
  [[ -z "$prop_name" ]] && die "No 'people' property found on task No. ${no}."

  local remove_ids="[]"
  IFS=',' read -ra raw_inputs <<< "$handles_input"
  for raw in "${raw_inputs[@]}"; do
    local email uid
    email="${raw#"${raw%%[![:space:]]*}"}"
    email="${email%"${email##*[![:space:]]}"}"

    uid=$(resolve_user_id "$email")

    local currently_assigned
    currently_assigned=$(echo "$page" | jq -r \
      --arg p "$prop_name" --arg id "$uid" \
      '.properties[$p].people[]? | select(.id == $id) | .id')

    if [[ -z "$currently_assigned" ]]; then
      yellow "Warning: '${email}' is not currently assigned to task No. ${no}, skipping."
      continue
    fi

    remove_ids=$(echo "$remove_ids" | jq --arg id "$uid" '. + [$id]')
  done

  local new_people body
  new_people=$(echo "$page" | jq \
    --arg p "$prop_name" \
    --argjson rm "$remove_ids" \
    '.properties[$p].people | map(select(.id as $id | $rm | index($id) == null)) | map({object:"user",id:.id})')

  body=$(jq -n --arg p "$prop_name" --argjson arr "$new_people" \
    '{properties: {($p): {people: $arr}}}')

  notion_patch "/pages/${page_id}" "$body" > /dev/null
  green "✓ Unassigned [${handles_input}] from task No. ${no}"
}
