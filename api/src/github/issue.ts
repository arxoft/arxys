import { Hono } from 'hono'
import { githubGet, githubPost, githubPatch, githubGraphQL, resolveRepo } from './client'
import { adminOnly } from '../middleware/auth'
import type { AppEnv } from '../types'

export const githubIssueRoutes = new Hono<AppEnv>()

// GET /github/issue/list?repo=owner/repo[&state=open&label=bug&mine=1]
githubIssueRoutes.get('/list', async (c) => {
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const repo  = resolveRepo(c.req.query('repo'), ws.github_repo)
  const state = c.req.query('state') ?? 'open'
  const label = c.req.query('label') ?? ''
  const mine  = c.req.query('mine') === '1'

  let url = `/repos/${repo}/issues?state=${state}&per_page=50&sort=updated`
  if (label) url += `&labels=${encodeURIComponent(label)}`

  let result = await githubGet(url, creds) as Array<Record<string, unknown>>

  // Filter out pull requests (GitHub issues API returns both)
  result = result.filter((i) => !i.pull_request)

  if (mine) {
    const me = (await githubGet('/user', creds) as { login: string }).login
    result   = result.filter((i) => (i.user as { login: string }).login === me)
  }

  return c.json(result)
})

// GET /github/issue/:number?repo=owner/repo
githubIssueRoutes.get('/:number', async (c) => {
  const creds  = c.get('credentials')
  const ws     = c.get('workspace')
  const repo   = resolveRepo(c.req.query('repo'), ws.github_repo)
  const number = c.req.param('number')

  const [issue, comments] = await Promise.all([
    githubGet(`/repos/${repo}/issues/${number}`, creds),
    githubGet(`/repos/${repo}/issues/${number}/comments`, creds),
  ])

  return c.json({ issue, comments })
})

// POST /github/issue — create
githubIssueRoutes.post('/', async (c) => {
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const body  = await c.req.json<{
    repo?: string; title: string; body_text?: string
    label?: string; assignee?: string
  }>()

  if (!body.title) return c.json({ error: 'title is required' }, 400)

  const repo = resolveRepo(body.repo, ws.github_repo)

  const payload: Record<string, unknown> = { title: body.title }
  if (body.body_text) payload.body      = body.body_text
  if (body.label)     payload.labels    = [body.label]
  if (body.assignee)  payload.assignees = [body.assignee]

  const result = await githubPost(`/repos/${repo}/issues`, creds, payload) as
    { number: number; html_url: string }

  return c.json({ number: result.number, url: result.html_url }, 201)
})

// PATCH /github/issue/:number?repo=owner/repo — update
githubIssueRoutes.patch('/:number', async (c) => {
  const creds  = c.get('credentials')
  const ws     = c.get('workspace')
  const repo   = resolveRepo(c.req.query('repo'), ws.github_repo)
  const number = c.req.param('number')

  const body = await c.req.json<Record<string, unknown>>()
  await githubPatch(`/repos/${repo}/issues/${number}`, creds, body)

  return c.json({ ok: true, number })
})

// POST /github/issue/:number/comment?repo=owner/repo
githubIssueRoutes.post('/:number/comment', async (c) => {
  const creds  = c.get('credentials')
  const ws     = c.get('workspace')
  const repo   = resolveRepo(c.req.query('repo'), ws.github_repo)
  const number = c.req.param('number')

  const body = await c.req.json<{ text: string }>()
  if (!body.text) return c.json({ error: 'text is required' }, 400)

  const result = await githubPost(
    `/repos/${repo}/issues/${number}/comments`, creds, { body: body.text }
  ) as { id: number }

  return c.json({ ok: true, id: result.id }, 201)
})

// POST /github/issue/:number/transfer?repo=owner/repo   (admin only)
// Body: { to_repo: "owner/repo" }
// Moves an issue to another repo (GitHub GraphQL transferIssue — no REST equivalent).
// The issue gets a NEW number in the target repo; comments, assignees and
// same-named labels move with it, and the old URL redirects. Used to keep every
// task in the workspace's tracking repo so task numbers stay unique.
githubIssueRoutes.post('/:number/transfer', adminOnly, async (c) => {
  const creds  = c.get('credentials')
  const ws     = c.get('workspace')
  const from   = resolveRepo(c.req.query('repo'), ws.github_repo)
  const number = c.req.param('number')
  const body   = await c.req.json<{ to_repo?: string }>().catch(() => ({} as { to_repo?: string }))

  if (!body.to_repo) return c.json({ error: 'to_repo is required (owner/repo)' }, 400)
  if (body.to_repo.toLowerCase() === from.toLowerCase()) {
    return c.json({ error: `Issue is already in '${from}'` }, 400)
  }

  const [issue, target] = await Promise.all([
    githubGet(`/repos/${from}/issues/${number}`, creds) as Promise<{ node_id: string; pull_request?: unknown }>,
    githubGet(`/repos/${body.to_repo}`, creds)          as Promise<{ node_id: string }>,
  ])
  if (issue.pull_request) return c.json({ error: 'Pull requests cannot be transferred' }, 400)

  const data = await githubGraphQL<{ transferIssue: { issue: { number: number; url: string } } }>(
    `mutation($issueId: ID!, $repoId: ID!) {
      transferIssue(input: { issueId: $issueId, repositoryId: $repoId, createLabelsIfMissing: true }) {
        issue { number url }
      }
    }`,
    { issueId: issue.node_id, repoId: target.node_id },
    creds
  )

  const moved = data.transferIssue.issue
  return c.json({ ok: true, from: `${from}#${number}`, to: `${body.to_repo}#${moved.number}`, url: moved.url })
})
