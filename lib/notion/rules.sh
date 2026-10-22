#!/usr/bin/env bash
# =============================================================================
# lib/notion/rules.sh — rules display subcommand
# Requires: lib/common.sh sourced first.
# =============================================================================

cmd_rules() {
  local rules_file="${SCRIPT_DIR}/RULES.md"
  [[ ! -f "$rules_file" ]] && die "RULES.md not found at: ${rules_file}"

  echo ""
  bold "══════════════════════════════════════════════════"
  bold " Notion Workspace Rules"
  bold "══════════════════════════════════════════════════"
  echo ""

  while IFS= read -r line; do
    if [[ "$line" =~ ^##[[:space:]] ]]; then
      echo ""; bold "${line#\# }"
    elif [[ "$line" =~ ^\|.*\| ]]; then
      dim "$line"
    elif [[ "$line" =~ ^\*\* ]]; then
      info "$line"
    else
      echo "$line"
    fi
  done < "$rules_file"

  echo ""
  dim "Source: ${rules_file}"
  echo ""
}
