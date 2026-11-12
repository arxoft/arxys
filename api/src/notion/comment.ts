import { Hono } from 'hono'
import { notionPost, resolvePageId, notionGet } from './client'
import { slackNotifyComment } from '../slack/notify'
import type { AppEnv } from '../types'

export const notionCommentRoutes = new Hono<AppEnv>()


// POST /notion/comment/:no
notionCommentRoutes.post('/:no', async (c) => {
  const creds  = c.get('credentials')
  const no     = parseInt(c.req.param('no'), 10)
  const body   = await c.req.json<{ text: string }>()

  if (!body.text) return c.json({ error: 'text is required' }, 400)

  const pageId = await resolvePageId(no, creds)
  const text   = `(${creds.notionUser}) ${body.text}`

  const result = await notionPost('/comments', creds, {
    parent:     { page_id: pageId },
    rich_text:  [{ type: 'text', text: { content: text } }],
  }) as { id: string }

  // Slack notification — skip system audit comments (Status: ...)
  if (!body.text.startsWith('Status:')) {
    const page = await notionGet(`/pages/${pageId}`, creds) as {
      url: string
      properties: Record<string, { type: string; title?: Array<{ plain_text: string }> }>
    }
    const titleProp = Object.values(page.properties).find((p) => p.type === 'title') as
      { title: Array<{ plain_text: string }> } | undefined
    const title = titleProp?.title.map((t) => t.plain_text).join('')
      .replace(/^\(\d+\) */, '') ?? ''

    await slackNotifyComment(no, title, body.text, page.url, creds)
  }

  return c.json({ ok: true, id: result.id }, 201)
})
