import { Hono } from 'hono'
import { githubGet } from './client'
import type { AppEnv } from '../types'

export const githubUserRoutes = new Hono<AppEnv>()

// GET /github/user/search?q=query[&limit=20]
githubUserRoutes.get('/search', async (c) => {
  const creds = c.get('credentials')
  const q     = c.req.query('q')
  const limit = c.req.query('limit') ?? '20'
  if (!q) return c.json({ error: 'q query param required' }, 400)

  const encoded = encodeURIComponent(q)
  return c.json(await githubGet(
    `/search/users?q=${encoded}&per_page=${limit}`, creds
  ))
})

// GET /github/user/me — returns member's GitHub identity
// Uses stored github_login when available (App token has no /user identity)
githubUserRoutes.get('/me', async (c) => {
  const creds = c.get('credentials')
  // If we have a stored login, return it directly — avoids /user call which
  // fails with App tokens ("Resource not accessible by integration")
  if (creds.githubLogin) {
    return c.json({ login: creds.githubLogin })
  }
  // PAT fallback — /user works with personal access tokens
  return c.json(await githubGet('/user', creds))
})
