#!/usr/bin/env bash
# =============================================================================
# lib/slack/notify.sh — Slack notification helpers
# Sourced by common.sh; do not execute directly.
#
# Required in .env.arxys:
#   SLACK_BOT_TOKEN=xoxb-...
#   SLACK_CHANNEL_ID=C...
#
# Both variables are optional — if either is unset, every slack_notify call
# silently returns 0 so workspaces without Slack configured are unaffected.
# =============================================================================

# ---------------------------------------------------------------------------
# Messaging policy
# ---------------------------------------------------------------------------
# 1. ASSIGNMENT   — personal @mention whenever a task is assigned to someone
# 2. STATUS       — channel message for every status change, all statuses
# 3. PR CREATED   — channel message with repo, task reference, and author
# 4. COMMENT      — channel message with commenter, task, and comment preview
# ---------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# _slack_post <json_payload>
# Internal: POST a pre-built JSON payload to chat.postMessage.
# Always sets unfurl_links/unfurl_media false to suppress link previews.
# -----------------------------------------------------------------------------
_slack_post() {
  local payload="$1"
  [[ -z "${SLACK_BOT_TOKEN:-}" || -z "${SLACK_CHANNEL_ID:-}" ]] && return 0

  payload=$(echo "$payload" | jq \
    --arg ch "$SLACK_CHANNEL_ID" \
    '. + {channel: $ch, unfurl_links: false, unfurl_media: false}')

  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
    -H "Content-Type: application/json; charset=utf-8" \
    -d "$payload" \
    > /dev/null
}

# -----------------------------------------------------------------------------
# _slack_uid_by_email <email>
# Looks up a Slack user ID by email. Returns the UID or empty string if not
# found. Uses users.lookupByEmail API (requires users:read.email scope).
# -----------------------------------------------------------------------------
_slack_uid_by_email() {
  local email="$1"
  [[ -z "${SLACK_BOT_TOKEN:-}" || -z "$email" ]] && return 0

  local result uid
  result=$(curl -s -G "https://slack.com/api/users.lookupByEmail" \
    -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
    --data-urlencode "email=${email}")

  uid=$(echo "$result" | jq -r 'if .ok then .user.id else "" end')
  echo "$uid"
}

# -----------------------------------------------------------------------------
# Policy 1 — ASSIGNMENT
# slack_notify_task_assigned <no> <title> <assignee_email> [assignee_name] [notion_url]
# Sends a direct @mention to the assigned person.
# -----------------------------------------------------------------------------
slack_notify_task_assigned() {
  local no="$1" title="$2" email="$3" name="${4:-}" url="${5:-}"
  [[ -z "${SLACK_BOT_TOKEN:-}" || -z "${SLACK_CHANNEL_ID:-}" ]] && return 0

  local actor="${NOTION_USER:-}"
  local fallback="📌 No.${no} ${title} assigned to ${name:-$email}"

  # Try to resolve a Slack UID for a proper @mention
  local uid mention
  uid=$(_slack_uid_by_email "$email")
  if [[ -n "$uid" ]]; then
    mention="<@${uid}>"
  else
    mention="*${name:-$email}*"
  fi

  local payload
  payload=$(jq -n \
    --arg mention  "$mention" \
    --arg no       "$no" \
    --arg title    "$title" \
    --arg url      "$url" \
    --arg actor    "$actor" \
    --arg fallback "$fallback" \
    '{
      text: $fallback,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: (
              "📌 " + $mention + " you have been assigned to No." + $no + " " +
              (if $url != "" then "*<" + $url + "|" + $title + ">*"
               else "*" + $title + "*" end) +
              (if $actor != "" then "\nAssigned by *" + $actor + "*" else "" end)
            )
          }
        },
        { type: "divider" }
      ]
    }')

  _slack_post "$payload"
}

# -----------------------------------------------------------------------------
# Policy 2 — STATUS CHANGE
# slack_notify_task_status <no> <title> <old_status> <new_status> [notion_url]
# Fires for every status transition without exception.
# -----------------------------------------------------------------------------
slack_notify_task_status() {
  local no="$1" title="$2" old_status="$3" new_status="$4" url="${5:-}"
  [[ -z "${SLACK_BOT_TOKEN:-}" || -z "${SLACK_CHANNEL_ID:-}" ]] && return 0

  local icon
  case "$new_status" in
    "Planning")             icon="🗒️"  ;;
    "Backlog")              icon="📥"  ;;
    "Up Next")              icon="⏭️"  ;;
    "In Progress")          icon="🔨"  ;;
    "Pending Review")       icon="👀"  ;;
    "Awaiting Deployment")  icon="✅"  ;;
    "Testing")              icon="🧪"  ;;
    "Pending Acceptance")   icon="🎯"  ;;
    "Completed")            icon="🏁"  ;;
    "Cancelled")            icon="🚫"  ;;
    "Icebox")               icon="🧊"  ;;
    *)                      icon="📋"  ;;
  esac

  local actor="${NOTION_USER:-}"
  local fallback="${icon} No.${no} ${title}: ${old_status} → ${new_status}"

  local payload
  payload=$(jq -n \
    --arg icon     "$icon" \
    --arg no       "$no" \
    --arg title    "$title" \
    --arg old      "$old_status" \
    --arg new      "$new_status" \
    --arg url      "$url" \
    --arg actor    "$actor" \
    --arg fallback "$fallback" \
    '{
      text: $fallback,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: (
              ($icon + " No." + $no + " " +
                (if $url != "" then "*<" + $url + "|" + $title + ">*"
                 else "*" + $title + "*" end)
              ) + "\n" +
              ("~" + $old + "~ → *" + $new + "*" +
                (if $actor != "" then " by *" + $actor + "*" else "" end)
              )
            )
          }
        },
        { type: "divider" }
      ]
    }')

  _slack_post "$payload"
}

# -----------------------------------------------------------------------------
# Policy 3 — PR CREATED
# slack_notify_pr_created <number> <title> <repo> <url> [notion_task_no]
# -----------------------------------------------------------------------------
slack_notify_pr_created() {
  local number="$1" title="$2" repo="$3" url="$4" task_no="${5:-}"
  [[ -z "${SLACK_BOT_TOKEN:-}" || -z "${SLACK_CHANNEL_ID:-}" ]] && return 0

  local actor="${NOTION_USER:-}"
  local fallback="🔀 PR #${number} opened: ${title} (${repo})"

  local payload
  payload=$(jq -n \
    --arg number   "$number" \
    --arg title    "$title" \
    --arg repo     "$repo" \
    --arg url      "$url" \
    --arg actor    "$actor" \
    --arg task_no  "$task_no" \
    --arg fallback "$fallback" \
    '{
      text: $fallback,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: (
              "🔀 *<" + $url + "|PR #" + $number + ">* opened" +
              (if $actor   != "" then " by *" + $actor + "*" else "" end) +
              (if $task_no != "" then " · No." + $task_no   else "" end) +
              "\n" +
              "*" + $title + "* · `" + $repo + "`"
            )
          }
        },
        { type: "divider" }
      ]
    }')

  _slack_post "$payload"
}

# -----------------------------------------------------------------------------
# Policy 3b — PR MERGED
# slack_notify_pr_merged <number> <title> <repo> <url>
# -----------------------------------------------------------------------------
slack_notify_pr_merged() {
  local number="$1" title="$2" repo="$3" url="$4"
  [[ -z "${SLACK_BOT_TOKEN:-}" || -z "${SLACK_CHANNEL_ID:-}" ]] && return 0

  local actor="${NOTION_USER:-}"
  local fallback="🚀 PR #${number} merged: ${title} (${repo})"

  local payload
  payload=$(jq -n \
    --arg number   "$number" \
    --arg title    "$title" \
    --arg repo     "$repo" \
    --arg url      "$url" \
    --arg actor    "$actor" \
    --arg fallback "$fallback" \
    '{
      text: $fallback,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: (
              "🚀 *<" + $url + "|PR #" + $number + ">* merged" +
              (if $actor != "" then " by *" + $actor + "*" else "" end) +
              "\n" +
              "*" + $title + "* · `" + $repo + "`"
            )
          }
        },
        { type: "divider" }
      ]
    }')

  _slack_post "$payload"
}

# -----------------------------------------------------------------------------
# Policy 4 — COMMENT ADDED
# slack_notify_comment <no> <title> <comment_text> [notion_url]
# Truncates long comments to 120 chars to keep messages compact.
# -----------------------------------------------------------------------------
slack_notify_comment() {
  local no="$1" title="$2" comment="$3" url="${4:-}"
  [[ -z "${SLACK_BOT_TOKEN:-}" || -z "${SLACK_CHANNEL_ID:-}" ]] && return 0

  local actor="${NOTION_USER:-}"

  # Strip the (actor) prefix that cmd_comment_add prepends — already shown separately
  local display_comment="$comment"
  if [[ -n "$actor" ]]; then
    display_comment="${comment#"(${actor}) "}"
  fi

  # Truncate to 120 chars
  if [[ "${#display_comment}" -gt 120 ]]; then
    display_comment="${display_comment:0:120}…"
  fi

  local fallback="💬 No.${no} ${title} — comment by ${actor:-someone}"

  local payload
  payload=$(jq -n \
    --arg no       "$no" \
    --arg title    "$title" \
    --arg comment  "$display_comment" \
    --arg url      "$url" \
    --arg actor    "$actor" \
    --arg fallback "$fallback" \
    '{
      text: $fallback,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: (
              "💬 No." + $no + " " +
              (if $url != "" then "*<" + $url + "|" + $title + ">*"
               else "*" + $title + "*" end) +
              (if $actor != "" then " — *" + $actor + "*" else "" end) +
              "\n" + $comment
            )
          }
        },
        { type: "divider" }
      ]
    }')

  _slack_post "$payload"
}
