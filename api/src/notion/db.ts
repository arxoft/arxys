import { Hono } from 'hono'
import { notionGet } from './client'
import type { AppEnv } from '../types'

export const notionDbRoutes = new Hono<AppEnv>()

// GET /notion/db/list — list board aliases for this workspace's venture
notionDbRoutes.get('/list', async (c) => {
  const workspace = c.get('workspace')
  const db        = c.env.DB

  const rows = await db
    .prepare('SELECT alias, database_id FROM venture_boards WHERE venture_id = ?')
    .bind(workspace.venture_id)
    .all<{ alias: string; database_id: string }>()

  return c.json({ boards: rows.results })
})

// GET /notion/db/info[?board=alias] — fetch Notion DB schema
notionDbRoutes.get('/info', async (c) => {
  const creds     = c.get('credentials')
  const workspace = c.get('workspace')
  const alias     = c.req.query('board')

  let databaseId = creds.notionDatabaseId

  if (alias) {
    const db  = c.env.DB
    const row = await db
      .prepare('SELECT database_id FROM venture_boards WHERE venture_id = ? AND alias = ?')
      .bind(workspace.venture_id, alias)
      .first<{ database_id: string }>()
    if (!row) return c.json({ error: `Board alias '${alias}' not found` }, 404)
    databaseId = row.database_id
  }

  const schema = await notionGet(`/databases/${databaseId}`, creds)
  return c.json(schema)
})
