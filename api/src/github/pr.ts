import { Hono } from 'hono'
import { githubGet, githubPost, githubPatch, githubPut } from './client'
import { slackNotifyPrCreated, slackNotifyPrMerged } from '../slack/notify'
import type { AppEnv } from '../types'

export const githubPrRoutes = new Hono<AppEnv>()

// GET /github/pr/list?repo=owner/repo[&state=open|closed|all&mine=1]
githubPrRoutes.get('/list', async (c) => {
  const creds = c.get('credentials')
  const repo  = c.req.query('repo')
  const state = c.req.query('state') ?? 'open'
  const mine  = c.req.query('mine') === '1'

  if (!repo) return c.json({ error: 'repo query param required' }, 400)

  let result = await githubGet(
    `/repos/${repo}/pulls?state=${state}&per_page=50&sort=updated&direction=desc`, creds
  ) as Array<Record<string, unknown>>

  if (mine) {
    const me = (await githubGet('/user', creds) as { login: string }).login
    result   = result.filter((pr) => (pr.user as { login: string }).login === me)
  }

  return c.json(result)
})

// GET /github/pr/:number?repo=owner/repo
githubPrRoutes.get('/:number', async (c) => {
  const creds  = c.get('credentials')
  const repo   = c.req.query('repo')
  const number = c.req.param('number')

  if (!repo) return c.json({ error: 'repo query param required' }, 400)

  const [pr, reviews, comments] = await Promise.all([
    githubGet(`/repos/${repo}/pulls/${number}`, creds),
    githubGet(`/repos/${repo}/pulls/${number}/reviews`, creds),
    githubGet(`/repos/${repo}/issues/${number}/comments`, creds),
  ])

  return c.json({ pr, reviews, comments })
})

// POST /github/pr — create
githubPrRoutes.post('/', async (c) => {
  const creds = c.get('credentials')
  const body  = await c.req.json<{
    repo: string; title: string; head: string
    base?: string; body_text?: string; draft?: boolean
    supersedes?: number; task_no?: number
  }>()

  if (!body.repo)  return c.json({ error: 'repo is required' }, 400)
  if (!body.title) return c.json({ error: 'title is required' }, 400)
  if (!body.head)  return c.json({ error: 'head is required' }, 400)

  let prBody = body.body_text ?? ''
  if (body.supersedes) {
    prBody = `Supersedes #${body.supersedes}.\n\n${prBody}`.trim()
  }

  const result = await githubPost(`/repos/${body.repo}/pulls`, creds, {
    title: body.title,
    head:  body.head,
    base:  body.base ?? 'main',
    body:  prBody,
    draft: body.draft ?? false,
  }) as { number: number; html_url: string; title: string }

  // Close superseded PR with back-reference
  if (body.supersedes) {
    await Promise.all([
      githubPost(`/repos/${body.repo}/issues/${body.supersedes}/comments`, creds, {
        body: `Superseded by #${result.number}. See ${result.html_url}`
      }),
      githubPatch(`/repos/${body.repo}/pulls/${body.supersedes}`, creds, { state: 'closed' }),
    ])
  }

  await slackNotifyPrCreated(result.number, result.title, body.repo, result.html_url,
    body.task_no?.toString(), creds)

  return c.json({ number: result.number, url: result.html_url }, 201)
})

// POST /github/pr/:number/merge?repo=owner/repo
githubPrRoutes.post('/:number/merge', async (c) => {
  const creds  = c.get('credentials')
  const repo   = c.req.query('repo')
  const number = c.req.param('number')

  if (!repo) return c.json({ error: 'repo query param required' }, 400)

  const body = await c.req.json<{ method?: string }>().catch(() => ({}))
  const method = body.method ?? 'squash'

  const pr = await githubGet(`/repos/${repo}/pulls/${number}`, creds) as
    { title: string; html_url: string }

  await githubPut(`/repos/${repo}/pulls/${number}/merge`, creds, { merge_method: method })

  await slackNotifyPrMerged(parseInt(number), pr.title, repo, pr.html_url, creds)

  return c.json({ ok: true, number, method })
})

// POST /github/pr/:number/review?repo=owner/repo
githubPrRoutes.post('/:number/review', async (c) => {
  const creds  = c.get('credentials')
  const repo   = c.req.query('repo')
  const number = c.req.param('number')

  if (!repo) return c.json({ error: 'repo query param required' }, 400)

  const body = await c.req.json<{ action: string; body_text?: string }>()
  if (!body.action) return c.json({ error: 'action is required' }, 400)

  const eventMap: Record<string, string> = {
    'approve':          'APPROVE',
    'request-changes':  'REQUEST_CHANGES',
    'comment':          'COMMENT',
  }
  const event = eventMap[body.action.toLowerCase()]
  if (!event) return c.json({ error: `Unknown action '${body.action}'` }, 400)

  await githubPost(`/repos/${repo}/pulls/${number}/reviews`, creds, {
    event,
    body: body.body_text ?? '',
  })

  return c.json({ ok: true, number, action: event })
})
