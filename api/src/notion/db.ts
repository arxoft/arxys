import { Hono } from 'hono'
import { notionGet, notionPatch } from './client'
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
  let databaseId  = creds.notionDatabaseId

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

// POST /notion/db/bootstrap[?board=alias]
// Provisions a Notion database with the standard arxys schema.
// Uses PATCH (additive) — existing properties are preserved.
notionDbRoutes.post('/bootstrap', async (c) => {
  const creds     = c.get('credentials')
  const workspace = c.get('workspace')
  const alias     = c.req.query('board')
  let databaseId  = creds.notionDatabaseId

  if (alias) {
    const db  = c.env.DB
    const row = await db
      .prepare('SELECT database_id FROM venture_boards WHERE venture_id = ? AND alias = ?')
      .bind(workspace.venture_id, alias)
      .first<{ database_id: string }>()
    if (!row) return c.json({ error: `Board alias '${alias}' not found` }, 404)
    databaseId = row.database_id
  }

  // Standard arxys schema for Notion databases. Notion is no longer the
  // primary project-management board (that is GHP), but it remains fully
  // supported for todos and relational DBs, so the full field set is kept.
  const properties: Record<string, unknown> = {
    'Status': {
      status: {
        options: [
          { name: 'Planning',            color: 'gray'   },
          { name: 'Backlog',             color: 'brown'  },
          { name: 'Up Next',             color: 'orange' },
          { name: 'In Progress',         color: 'yellow' },
          { name: 'Testing',             color: 'pink'   },
          { name: 'Deploying',           color: 'purple' },
          { name: 'Pending Acceptance',  color: 'green'  },
          { name: 'Completed',           color: 'green'  },
          { name: 'Cancelled',           color: 'red'    },
          { name: 'Icebox',              color: 'default'},
        ],
        groups: [
          { name: 'To-do',       color: 'gray',   option_ids: [] },
          { name: 'In progress', color: 'blue',   option_ids: [] },
          { name: 'Complete',    color: 'green',  option_ids: [] },
        ]
      }
    },
    'Priority':    { select: { options: [
      { name: 'Critical', color: 'red'    },
      { name: 'High',     color: 'orange' },
      { name: 'Medium',   color: 'yellow' },
      { name: 'Low',      color: 'gray'   },
    ]}},
    'Assignee':    { people: {} },
    'Due Date':    { date: {} },
    'Tags':        { multi_select: { options: [] } },
    'Description': { rich_text: {} },
    'Effort':      { number: { format: 'number' } },
    'Git Branch':   { rich_text: {} },
    'Pull Request': { url: {} },
    'Review round': { number: { format: 'number' } },
    'Depends on':   { relation: { database_id: databaseId, single_property: {} } },
  }

  await notionPatch(`/databases/${databaseId}`, creds, { properties })

  return c.json({ ok: true, database_id: databaseId, bootstrapped: Object.keys(properties) })
})
