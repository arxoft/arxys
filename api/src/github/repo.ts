import { Hono } from 'hono'
import { githubGet } from './client'
import type { AppEnv } from '../types'

export const githubRepoRoutes = new Hono<AppEnv>()

// GET /github/repo/info?repo=owner/repo
githubRepoRoutes.get('/info', async (c) => {
  const creds = c.get('credentials')
  const repo  = c.req.query('repo')
  if (!repo) return c.json({ error: 'repo query param required' }, 400)
  const result = await githubGet(`/repos/${repo}`, creds)
  return c.json(result)
})

// GET /github/repo/commits?repo=owner/repo[&branch=main&limit=20]
githubRepoRoutes.get('/commits', async (c) => {
  const creds  = c.get('credentials')
  const repo   = c.req.query('repo')
  const branch = c.req.query('branch') ?? 'main'
  const limit  = c.req.query('limit')  ?? '20'

  if (!repo) return c.json({ error: 'repo query param required' }, 400)

  const result = await githubGet(
    `/repos/${repo}/commits?sha=${branch}&per_page=${limit}`, creds
  )
  return c.json(result)
})
