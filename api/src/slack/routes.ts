import { Hono } from 'hono'
import type { AppEnv } from '../types'

export const slackRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// POST /v1/slack/notify
// Sends a freeform message to the workspace's Slack channel.
// For agent use: significant manual events not covered by auto-notifications.
// Body: { text: string }
// ---------------------------------------------------------------------------
slackRoutes.post('/notify', async (c) => {
  const creds = c.get('credentials')
  if (!creds.slackBotToken || !creds.slackChannelId) {
    return c.json({ error: 'Slack is not configured for this workspace' }, 400)
  }

  const body = await c.req.json<{ text: string }>()
  if (!body.text) return c.json({ error: 'text is required' }, 400)

  // Prepend agent handle so messages are identifiable in Slack
  const actor = creds.notionUser ? `*[${creds.notionUser}]* ` : ''
  const text  = `${actor}${body.text}`

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${creds.slackBotToken}`,
      'Content-Type':  'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel:      creds.slackChannelId,
      text,
      mrkdwn:       true,
      unfurl_links: false,
      unfurl_media: false,
    }),
  })

  const data = await res.json() as { ok: boolean; error?: string }
  if (!data.ok) return c.json({ error: `Slack error: ${data.error}` }, 502)

  return c.json({ ok: true })
})
