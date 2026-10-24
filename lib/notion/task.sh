#!/usr/bin/env bash
# =============================================================================
# lib/notion/task.sh — task subcommands
# Requires: lib/common.sh sourced first.
# =============================================================================

# Every task title carries its own number, e.g. "(34) Fix login redirect loop".
# Relation pickers and @-mentions only search titles, so the number has to live
# there. The CLI owns the prefix; humans own the words after it.
_NO_PREFIX_RE='^\([0-9]+\) *'

title_without_no() { sed -E "s/${_NO_PREFIX_RE}//" <<< "$1"; }
title_with_no()    { printf '(%s) %s' "$1" "$(title_without_no "$2")"; }

# -----------------------------------------------------------------------------
# _cmd_task_list_review_queue
# Filter Status = "Pending Review", topologically sort by "Depends on"
# (dependencies first), tie-break by PR number ascending.
# Fails loudly on cycles or on a task whose dependency is not yet in
# Awaiting Deployment or Completed.
# -----------------------------------------------------------------------------
_cmd_task_list_review_queue() {
  info "Fetching Pending Review queue..."

  # 1. Fetch all Pending Review tasks
  local body result count
  body=$(jq -n '{filter: {property: "Status", status: {equals: "Pending Review"}}}')
  result=$(notion_post "/databases/${NOTION_DATABASE_ID}/query" "$body")
  count=$(echo "$result" | jq '.results | length')

  if [[ "$count" -eq 0 ]]; then
    yellow "No tasks in Pending Review."
    return
  fi

  # Build a map: task_id -> {no, title, pr_number, dep_page_ids[]}
  # We resolve PR numbers by stripping the URL to the last path segment.
  local tasks_json
  tasks_json=$(echo "$result" | jq '[.results[] | {
    id: .id,
    no: (.properties | to_entries[] | select(.value.type=="unique_id") | .value.unique_id.number),
    title: (.properties | to_entries[] | select(.value.type=="title") | .value.title | map(.plain_text) | join("")),
    pr_url: (.properties["Pull Request"].url // ""),
    dep_ids: ([(.properties["Depends on"].relation // [])[] | .id])
  }]')

  # 2. For each task with dependencies, verify the dependency is in
  #    Awaiting Deployment or Completed. Collect dep task numbers for display.
  local errors=0
  local -a ordered_ids=()

  # Build a simple node list for Kahn's algorithm in jq
  # We only have page IDs for deps; we need to fetch each dep to check its status.
  local dep_ids_all
  dep_ids_all=$(echo "$tasks_json" | jq -r '[.[].dep_ids[]] | unique[]')

  # Map of dep page_id -> status (fetch only unique deps)
  declare -A dep_status_map=()
  declare -A dep_no_map=()
  if [[ -n "$dep_ids_all" ]]; then
    while IFS= read -r dep_id; do
      [[ -z "$dep_id" ]] && continue
      local dep_page dep_st dep_no
      dep_page=$(notion_get "/pages/${dep_id}")
      dep_st=$(echo "$dep_page" | jq -r '
        .properties | to_entries[]
        | select(.key == "Status")
        | .value
        | if .type == "status" then .status.name elif .type == "select" then .select.name else "" end
      ')
      dep_no=$(echo "$dep_page" | jq -r '
        .properties | to_entries[]
        | select(.value.type == "unique_id")
        | .value.unique_id.number | tostring
      ')
      dep_status_map["$dep_id"]="$dep_st"
      dep_no_map["$dep_id"]="$dep_no"
    done <<< "$dep_ids_all"
  fi

  # 3. Validate dependency statuses and detect cycles via Kahn's algorithm
  # Build in-degree and adjacency using the dep_ids within the Pending Review set.
  # Tasks with deps *outside* the set are validated against dep_status_map above.

  # Map page_id -> task index for tasks in queue
  declare -A id_to_idx=()
  local n_tasks
  n_tasks=$(echo "$tasks_json" | jq 'length')
  for i in $(seq 0 $((n_tasks - 1))); do
    local tid
    tid=$(echo "$tasks_json" | jq -r --argjson i "$i" '.[$i].id')
    id_to_idx["$tid"]=$i
  done

  # Validate cross-queue deps and build in-degree array
  declare -a in_degree=()
  for i in $(seq 0 $((n_tasks - 1))); do
    in_degree[$i]=0
  done

  for i in $(seq 0 $((n_tasks - 1))); do
    local dep_list
    dep_list=$(echo "$tasks_json" | jq -r --argjson i "$i" '.[$i].dep_ids[]')
    local task_no
    task_no=$(echo "$tasks_json" | jq -r --argjson i "$i" '.[$i].no')

    while IFS= read -r dep_id; do
      [[ -z "$dep_id" ]] && continue

      if [[ -v "id_to_idx[$dep_id]" ]]; then
        # dep is also in Pending Review — contributes to in-degree
        local dep_idx="${id_to_idx[$dep_id]}"
        in_degree[$i]=$(( in_degree[$i] + 1 ))
      else
        # dep is outside the queue — must be Awaiting Deployment or Completed
        local dep_st="${dep_status_map[$dep_id]:-}"
        local dep_no="${dep_no_map[$dep_id]:-$dep_id}"
        if [[ "$dep_st" != "Awaiting Deployment" && "$dep_st" != "Completed" ]]; then
          red "ERROR: Task No.${task_no} depends on No.${dep_no} which is in status '${dep_st}' (must be Awaiting Deployment or Completed)."
          errors=$(( errors + 1 ))
        fi
      fi
    done <<< "$dep_list"
  done

  [[ "$errors" -gt 0 ]] && die "Review queue blocked: resolve dependency errors above before proceeding."

  # Kahn's topological sort
  local -a queue=()
  for i in $(seq 0 $((n_tasks - 1))); do
    [[ "${in_degree[$i]}" -eq 0 ]] && queue+=("$i")
  done

  # Sort zero-in-degree nodes by PR number ascending (tie-break)
  # Extract PR numbers into a helper array for sorting
  declare -a pr_nums=()
  for i in $(seq 0 $((n_tasks - 1))); do
    local pr_url
    pr_url=$(echo "$tasks_json" | jq -r --argjson i "$i" '.[$i].pr_url')
    local pr_num=999999
    if [[ "$pr_url" =~ /([0-9]+)$ ]]; then
      pr_num="${BASH_REMATCH[1]}"
    fi
    pr_nums[$i]=$pr_num
  done

  # Re-sort initial queue by PR number
  IFS=$'\n' queue=($(for idx in "${queue[@]}"; do echo "${pr_nums[$idx]} $idx"; done | sort -n | awk '{print $2}'))
  unset IFS

  local -a sorted_indices=()
  local visited=0

  while [[ "${#queue[@]}" -gt 0 ]]; do
    local cur="${queue[0]}"
    queue=("${queue[@]:1}")
    sorted_indices+=("$cur")
    (( visited++ ))

    # Find tasks that depended on cur
    local cur_id
    cur_id=$(echo "$tasks_json" | jq -r --argjson c "$cur" '.[$c].id')
    local -a newly_free=()

    for j in $(seq 0 $((n_tasks - 1))); do
      local j_deps
      j_deps=$(echo "$tasks_json" | jq -r --argjson jj "$j" '.[$jj].dep_ids[]' 2>/dev/null || true)
      while IFS= read -r dep_id; do
        [[ "$dep_id" == "$cur_id" ]] || continue
        in_degree[$j]=$(( in_degree[$j] - 1 ))
        if [[ "${in_degree[$j]}" -eq 0 ]]; then
          newly_free+=("$j")
        fi
      done <<< "$j_deps"
    done

    # Sort newly free by PR number and append
    if [[ "${#newly_free[@]}" -gt 0 ]]; then
      IFS=$'\n' newly_free=($(for idx in "${newly_free[@]}"; do echo "${pr_nums[$idx]} $idx"; done | sort -n | awk '{print $2}'))
      unset IFS
      queue+=("${newly_free[@]}")
    fi
  done

  if [[ "$visited" -lt "$n_tasks" ]]; then
    die "ERROR: Cycle detected in Pending Review dependencies. Resolve the cycle before proceeding."
  fi

  # 4. Display sorted queue
  echo ""
  bold "── Pending Review (review order) ──────────────────"
  for idx in "${sorted_indices[@]}"; do
    local no title pr_url pr_disp dep_count
    no=$(echo "$tasks_json" | jq -r --argjson i "$idx" '.[$i].no')
    title=$(echo "$tasks_json" | jq -r --argjson i "$idx" --arg re "$_NO_PREFIX_RE" '.[$i].title | sub($re; "") | if length > 70 then .[0:70] + "..." else . end')
    pr_url=$(echo "$tasks_json" | jq -r --argjson i "$idx" '.[$i].pr_url')
    dep_count=$(echo "$tasks_json" | jq -r --argjson i "$idx" '.[$i].dep_ids | length')
    pr_disp=""
    if [[ "$pr_url" =~ /([0-9]+)$ ]]; then
      pr_disp="  PR #${BASH_REMATCH[1]}"
    fi
    local dep_note=""
    [[ "$dep_count" -gt 0 ]] && dep_note="  [deps: ${dep_count}]"
    printf "  No.%-6s %s%s%s\n" "${no}" "${title}" "${pr_disp}" "${dep_note}"
  done
  echo ""
  dim "Total: ${n_tasks} task(s) in Pending Review"
}

cmd_task_list() {
  local filter_prop="" filter_val="" sort_prop="" sort_dir="ascending" mine=0 review_queue=0
  # Icebox is parked work: absent from a default listing, and shown alone on request.
  local icebox="hide"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --filter) filter_prop="$2"; filter_val="$3"; shift 3 ;;
      --mine)
        [[ -z "${NOTION_USER_EMAIL:-}" ]] && die "--mine requires NOTION_USER_EMAIL in .env.notion"
        mine=1; shift ;;
      --icebox)
        icebox="only"; shift ;;
      --review-queue)
        review_queue=1; shift ;;
      --sort)
        sort_prop="$2"; shift 2
        if [[ $# -gt 0 && "$1" =~ ^(asc|desc|ascending|descending)$ ]]; then
          sort_dir="$1"; shift
        fi
        ;;
      *) die "Unknown option: $1" ;;
    esac
  done

  # --review-queue: filter Pending Review, topological sort by Depends on, tie-break by PR number
  if [[ "$review_queue" -eq 1 ]]; then
    _cmd_task_list_review_queue
    return
  fi

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

  # Parked work stays out of sight unless the caller names the Status property,
  # in which case they have already chosen what they want to see.
  local status_named=0
  [[ "${filter_prop,,}" == "${NOTION_STATUS_PROPERTY_NAME,,}" ]] && status_named=1

  local icebox_mode="$icebox"
  [[ "$icebox_mode" == "hide" && "$status_named" -eq 1 ]] && icebox_mode="off"

  if [[ "$icebox_mode" != "off" ]]; then
    result=$(echo "$result" | jq --arg grp "$NOTION_STATUS_PROPERTY_NAME" --arg mode "$icebox_mode" '
      def stage: ((.properties | to_entries[] | select(.key==$grp) | .value
                    | if   .type=="status" then .status.name
                      elif .type=="select" then .select.name
                      else null end) // "");
      .results |= map(select( if $mode == "only" then stage == "Icebox"
                              else stage != "Icebox" end ))')
  fi

  count=$(echo "$result" | jq '.results | length')

  if [[ "$count" -eq 0 ]]; then
    if [[ "$icebox_mode" == "only" ]]; then
      yellow "Nothing in the Icebox."
    else
      yellow "No tasks found."
    fi
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
    echo "$result" | jq -r --arg re "$_NO_PREFIX_RE" '
      .results[] |
      "  No." +
      (.properties | to_entries[] | select(.value.type=="unique_id") | .value.unique_id.number | tostring) +
      "  " +
      (.properties | to_entries[] | select(.value.type=="title") | .value.title | map(.plain_text) | join("") | sub($re; "") | if length > 80 then .[0:80] + "..." else . end)'
    return
  fi

  while IFS= read -r status; do
    [[ -z "$status" ]] && continue
    local group
    group=$(echo "$result" | jq -r --arg s "$status" --arg grp "$NOTION_STATUS_PROPERTY_NAME" --arg re "$_NO_PREFIX_RE" '
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
        (.properties | to_entries[] | select(.value.type=="title") | .value.title | map(.plain_text) | join("") | sub($re; "") | if length > 80 then .[0:80] + "..." else . end)
    ')
    if [[ -n "$group" ]]; then
      echo ""
      bold "── $status ──────────────────────────────────────"
      echo "$group"
    fi
  done <<< "$statuses"

  local no_stage
  no_stage=$(echo "$result" | jq -r --arg grp "$NOTION_STATUS_PROPERTY_NAME" --arg re "$_NO_PREFIX_RE" '
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
      (.properties | to_entries[] | select(.value.type=="title") | .value.title | map(.plain_text) | join("") | sub($re; "") | if length > 80 then .[0:80] + "..." else . end)
  ' 2>/dev/null || true)

  if [[ -n "$no_stage" ]]; then
    echo ""
    bold "── (no stage) ──────────────────────────────────"
    echo "$no_stage"
  fi

  echo ""
  dim "Total: $count tasks"
  [[ "$icebox_mode" == "hide" ]] && dim "  Icebox work is excluded here — see 'task list --icebox'."
}

cmd_task_show() {
  local no="$1"
  info "Fetching task No. ${no}..."

  local page_id page title
  page_id=$(resolve_page_id "$no")
  page=$(notion_get "/pages/${page_id}")
  title=$(echo "$page" | jq -r --arg re "$_NO_PREFIX_RE" '[.properties | to_entries[] | select(.value.type=="title") | .value.title | map(.plain_text) | join("") | sub($re; "")] | join(" ")')

  echo ""
  local heading=" Task No. ${no}"
  [[ -n "$title" ]] && heading="${heading} — ${title}"
  local bar_width=$(( ${#heading} + 2 ))
  (( bar_width < 50 )) && bar_width=50
  local bar
  bar=$(printf '═%.0s' $(seq 1 "$bar_width"))
  bold "$bar"
  bold "$heading"
  bold "$bar"
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

  local body result new_id page_uuid url final_title
  body=$(jq -n --arg db "$NOTION_DATABASE_ID" --argjson props "$props" \
    '{parent: {database_id: $db}, properties: $props}')

  result=$(notion_post "/pages" "$body")

  new_id=$(echo "$result" | jq -r '
    .properties | to_entries[]
    | select(.value.type=="unique_id")
    | .value.unique_id.number | tostring
  ')
  page_uuid=$(echo "$result" | jq -r '.id')
  url=$(echo "$result" | jq -r '.url')

  # The number only exists once the page does, so stamping it is a second write.
  final_title="$title"
  if [[ -n "$new_id" ]]; then
    final_title=$(title_with_no "$new_id" "$title")
    if [[ "$final_title" != "$title" ]]; then
      local tbody
      tbody=$(jq -n --arg tprop "$NOTION_TITLE_PROPERTY_NAME" --arg t "$final_title" \
        '{properties: {($tprop): {title: [{type:"text",text:{content:$t}}]}}}')
      notion_patch "/pages/${page_uuid}" "$tbody" > /dev/null
    fi
  fi

  green "✓ Task created!"
  [[ -n "$new_id" ]] && echo "  No.  : $new_id"
  echo "  Title: ${final_title}"
  echo "  URL  : $url"
}

# -----------------------------------------------------------------------------
# Repair the (No.) prefix on every title. Titles are editable by anyone, so
# renames drop it; this makes the convention self-healing. Dry-run unless --apply.
# -----------------------------------------------------------------------------
cmd_task_fix_titles() {
  local apply=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --apply) apply=1; shift ;;
      *) die "Unknown option: $1" ;;
    esac
  done

  info "Scanning titles for the (No.) prefix..."

  local cursor="" page checked=0 drifted=0
  while :; do
    if [[ -z "$cursor" ]]; then
      page=$(notion_post "/databases/${NOTION_DATABASE_ID}/query" '{}')
    else
      page=$(notion_post "/databases/${NOTION_DATABASE_ID}/query" \
        "$(jq -n --arg c "$cursor" '{start_cursor: $c}')")
    fi

    local n i pid pno ptitle want
    n=$(echo "$page" | jq '.results | length')
    for ((i=0; i<n; i++)); do
      pid=$(echo "$page" | jq -r ".results[$i].id")
      pno=$(echo "$page" | jq -r ".results[$i].properties | to_entries[] | select(.value.type==\"unique_id\") | .value.unique_id.number | tostring")
      ptitle=$(echo "$page" | jq -r ".results[$i].properties | to_entries[] | select(.value.type==\"title\") | .value.title | map(.plain_text) | join(\"\")")
      [[ -z "$pid" || -z "$pno" || "$pno" == "null" ]] && continue
      checked=$((checked + 1))

      want=$(title_with_no "$pno" "$ptitle")
      [[ "$want" == "$ptitle" ]] && continue

      if [[ "$apply" -eq 1 ]]; then
        notion_patch "/pages/${pid}" \
          "$(jq -n --arg tprop "$NOTION_TITLE_PROPERTY_NAME" --arg t "$want" \
            '{properties: {($tprop): {title: [{type:"text",text:{content:$t}}]}}}')" > /dev/null
        printf "  %s No.%-7s %s\n" "$(green 'fixed')" "$pno" "$want"
      else
        printf "  %s No.%-7s %s\n" "$(yellow 'drift')" "$pno" "$want"
      fi
      drifted=$((drifted + 1))
    done

    cursor=$(echo "$page" | jq -r '.next_cursor // ""')
    [[ "$cursor" == "null" || -z "$cursor" ]] && break
  done

  echo ""
  if [[ "$drifted" -eq 0 ]]; then
    green "✓ All ${checked} title(s) already carry their number."
  elif [[ "$apply" -eq 1 ]]; then
    green "✓ Repaired ${drifted} of ${checked} title(s)."
  else
    yellow "${drifted} of ${checked} title(s) need the prefix."
    dim "  Re-run with --apply to write."
  fi
  echo ""
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
