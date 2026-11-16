import { Hono } from 'hono'
import { githubGet, resolveRepo } from './client'
import type { AppEnv } from '../types'

export const githubRepoRoutes = new Hono<AppEnv>()

// GET /github/repo/info?repo=owner/repo
githubRepoRoutes.get('/info', async (c) => {
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const repo  = resolveRepo(c.req.query('repo'), ws.github_repo)
  return c.json(await githubGet(`/repos/${repo}`, creds))
})

// GET /github/repo/list?org=owner[&limit=100]
githubRepoRoutes.get('/list', async (c) => {
  const creds = c.get('credentials')
  const org   = c.req.query('org')
  const limit = c.req.query('limit') ?? '100'

  if (!org) return c.json({ error: 'org query param required' }, 400)

  // Try org endpoint first, fall back to user endpoint
  let result: unknown
  try {
    result = await githubGet(
      `/orgs/${org}/repos?per_page=${limit}&sort=updated&direction=desc`, creds
    )
  } catch {
    result = await githubGet(
      `/users/${org}/repos?per_page=${limit}&sort=updated&direction=desc`, creds
    )
  }

  return c.json(result)
})

// GET /github/repo/commits?repo=owner/repo[&branch=main&limit=20]
githubRepoRoutes.get('/commits', async (c) => {
  const creds  = c.get('credentials')
  const ws     = c.get('workspace')
  const repo   = resolveRepo(c.req.query('repo'), ws.github_repo)
  const branch = c.req.query('branch') ?? 'main'
  const limit  = c.req.query('limit')  ?? '20'

  return c.json(await githubGet(
    `/repos/${repo}/commits?sha=${branch}&per_page=${limit}`, creds
  ))
})

// GET /github/repo/search?q=query[&limit=20]
githubRepoRoutes.get('/search', async (c) => {
  const creds = c.get('credentials')
  const q     = c.req.query('q')
  const limit = c.req.query('limit') ?? '20'
  if (!q) return c.json({ error: 'q query param required' }, 400)

  const encoded = encodeURIComponent(q)
  return c.json(await githubGet(
    `/search/repositories?q=${encoded}&per_page=${limit}&sort=stars&order=desc`, creds
  ))
})
