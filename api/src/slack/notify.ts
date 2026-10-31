import type { Credentials } from '../types'

// ---------------------------------------------------------------------------
// Slack notification helpers — mirrors lib/slack/notify.sh
// All functions silently skip if bot token or channel ID are not configured.
// ---------------------------------------------------------------------------

async function slackPost(payload: Record<string, unknown>, creds: Credentials): Promise<void> {
  if (!creds.slackBotToken || !creds.slackChannelId) return

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${creds.slackBotToken}`,
      'Content-Type':  'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      ...payload,
      channel:       creds.slackChannelId,
      unfurl_links:  false,
      unfurl_media:  false,
    }),
  })
}

function section(text: string) {
  return { type: 'section', text: { type: 'mrkdwn', text } }
}
const divider = { type: 'divider' }

// Policy 1 — Assignment
export async function slackNotifyTaskAssigned(
  no: number, title: string, email: string, name: string,
  url: string, creds: Credentials
): Promise<void> {
  const actor    = creds.notionUser ? ` by *${creds.notionUser}*` : ''
  const taskLink = url ? `*<${url}|${title}>*` : `*${title}*`
  const mention  = `*${name || email}*`

  await slackPost({
    text: `📌 No.${no} ${title} assigned to ${name || email}`,
    blocks: [
      section(`📌 ${mention} you have been assigned to No.${no} ${taskLink}${actor}`),
      divider,
    ],
  }, creds)
}

// Policy 2 — Status change (all statuses)
export async function slackNotifyTaskStatus(
  no: number, title: string, oldStatus: string, newStatus: string,
  url: string, creds: Credentials
): Promise<void> {
  const icons: Record<string, string> = {
    'Planning':            '🗒️',
    'Backlog':             '📥',
    'Up Next':             '⏭️',
    'In Progress':         '🔨',
    'Pending Review':      '👀',
    'Awaiting Deployment': '✅',
    'Testing':             '🧪',
    'Pending Acceptance':  '🎯',
    'Completed':           '🏁',
    'Cancelled':           '🚫',
    'Icebox':              '🧊',
  }
  const icon     = icons[newStatus] ?? '📋'
  const actor    = creds.notionUser ? ` by *${creds.notionUser}*` : ''
  const taskLink = url ? `*<${url}|${title}>*` : `*${title}*`

  await slackPost({
    text: `${icon} No.${no} ${title}: ${oldStatus} → ${newStatus}`,
    blocks: [
      section(`${icon} No.${no} ${taskLink}\n~${oldStatus}~ → *${newStatus}*${actor}`),
      divider,
    ],
  }, creds)
}

// Policy 3a — PR created
export async function slackNotifyPrCreated(
  number: number, title: string, repo: string, url: string,
  taskNo: string | undefined, creds: Credentials
): Promise<void> {
  const actor   = creds.notionUser ? ` by *${creds.notionUser}*` : ''
  const taskRef = taskNo ? ` · No.${taskNo}` : ''

  await slackPost({
    text: `🔀 PR #${number} opened: ${title} (${repo})`,
    blocks: [
      section(`🔀 *<${url}|PR #${number}>* opened${actor}${taskRef}\n*${title}* · \`${repo}\``),
      divider,
    ],
  }, creds)
}

// Policy 3b — PR merged
export async function slackNotifyPrMerged(
  number: number, title: string, repo: string, url: string,
  creds: Credentials
): Promise<void> {
  const actor = creds.notionUser ? ` by *${creds.notionUser}*` : ''

  await slackPost({
    text: `🚀 PR #${number} merged: ${title} (${repo})`,
    blocks: [
      section(`🚀 *<${url}|PR #${number}>* merged${actor}\n*${title}* · \`${repo}\``),
      divider,
    ],
  }, creds)
}

// Policy 4 — Comment added
export async function slackNotifyComment(
  no: number, title: string, comment: string, url: string,
  creds: Credentials
): Promise<void> {
  const actor   = creds.notionUser ? ` — *${creds.notionUser}*` : ''
  const preview = comment.length > 120 ? comment.slice(0, 120) + '…' : comment
  const taskLink = url ? `*<${url}|${title}>*` : `*${title}*`

  await slackPost({
    text: `💬 No.${no} ${title} — comment`,
    blocks: [
      section(`💬 No.${no} ${taskLink}${actor}\n${preview}`),
      divider,
    ],
  }, creds)
}
