import { Hono } from 'hono'
import { notionGet } from './client'
import type { AppEnv } from '../types'

export const notionUserRoutes = new Hono<AppEnv>()

// Guard: all notion/user routes require a notion-type workspace
notionUserRoutes.use('*', async (c, next) => {
  const ws = c.get('workspace')
  if (ws.board_type !== 'notion') {
    return c.json({ error: 'This workspace uses GitHub as its board. Notion routes are not available.' }, 400)
  }
  return next()
})

// GET /notion/user/list
notionUserRoutes.get('/list', async (c) => {
  const creds = c.get('credentials')
  const users = await notionGet('/users', creds) as {
    results: Array<{ id: string; name: string; type: string; person?: { email: string } }>
  }
  const members = users.results
    .filter((u) => u.type === 'person')
    .map((u) => ({ id: u.id, name: u.name, email: u.person?.email }))
  return c.json({ members })
})
