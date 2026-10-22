#!/usr/bin/env bash
# =============================================================================
# lib/notion/workflow.sh — workflow display subcommands
# Requires: lib/common.sh sourced first.
# =============================================================================

cmd_workflow_list() {
  local workflows_dir="${SCRIPT_DIR}/workflows"
  local index_file="${workflows_dir}/README.md"

  [[ ! -d "$workflows_dir" ]] && die "workflows/ directory not found at: ${workflows_dir}"
  [[ ! -f "$index_file" ]]    && die "workflows/README.md not found at: ${index_file}"

  echo ""
  bold "══════════════════════════════════════════════════"
  bold " Workflows"
  bold "══════════════════════════════════════════════════"
  echo ""

  while IFS= read -r line; do
    if [[ "$line" =~ ^##[[:space:]] ]]; then
      echo ""; bold "${line}"
    elif [[ "$line" =~ ^\|.*\| ]]; then
      dim "$line"
    elif [[ "$line" =~ ^\`\`\` ]]; then
      dim "$line"
    else
      echo "$line"
    fi
  done < "$index_file"

  echo ""
  dim "Source: ${index_file}"
  echo ""
}

cmd_workflow_show() {
  local name="$1"
  local workflows_dir="${SCRIPT_DIR}/workflows"
  local workflow_file="${workflows_dir}/${name}.md"

  if [[ ! -f "$workflow_file" ]]; then
    local available
    available=$(ls "${workflows_dir}"/*.md 2>/dev/null \
      | xargs -I{} basename {} .md | grep -v README | sort | tr '\n' ' ')
    die "Workflow '${name}' not found. Available: ${available% }"
  fi

  local display_title
  display_title=$(basename "$workflow_file" .md \
    | tr '-' ' ' \
    | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

  echo ""
  bold "══════════════════════════════════════════════════"
  bold " ${display_title} Workflow"
  bold "══════════════════════════════════════════════════"
  echo ""

  local in_frontmatter=1 fm_opened=0
  while IFS= read -r line; do
    if [[ "$in_frontmatter" -eq 1 ]]; then
      if   [[ "$line" == "---" && "$fm_opened" -eq 0 ]]; then fm_opened=1; continue
      elif [[ "$line" == "---" && "$fm_opened" -eq 1 ]]; then in_frontmatter=0; continue
      elif [[ "$fm_opened" -eq 1 ]];                    then continue
      else in_frontmatter=0
      fi
    fi
    if   [[ "$line" =~ ^#[[:space:]] ]];  then continue
    elif [[ "$line" =~ ^##[[:space:]] ]]; then echo ""; bold "${line}"
    elif [[ "$line" =~ ^\|.*\| ]];        then dim "$line"
    else echo "$line"
    fi
  done < "$workflow_file"

  echo ""
  dim "Source: ${workflow_file}"
  echo ""
}
