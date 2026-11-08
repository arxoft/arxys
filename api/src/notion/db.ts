import { Hono } from 'hono'
import { notionGet, notionPatch } from './client'
import type { AppEnv } from '../types'

export const notionDbRoutes = new Hono<AppEnv>()

// Guard: all notion/db routes require a notion-type workspace
notionDbRoutes.use('*', async (c, next) => {
  const ws = c.get('workspace')
  if (ws.board_type !== 'notion') {
    return c.json({ error: 'This workspace uses GitHub as its board. Notion routes are not available.' }, 400)
  }
  return next()
})

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

  // Standard arxys schema — mirrors cli/lib/notion/db.sh cmd_db_bootstrap
  const properties: Record<string, unknown> = {
    'Status': {
      status: {
        options: [
          { name: 'Planning',            color: 'gray'   },
          { name: 'Backlog',             color: 'brown'  },
          { name: 'Up Next',             color: 'orange' },
          { name: 'In Progress',         color: 'yellow' },
          { name: 'Pending Review',      color: 'blue'   },
          { name: 'Awaiting Deployment', color: 'purple' },
          { name: 'Testing',             color: 'pink'   },
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
    'Priority':      { select:       { options: [
      { name: 'Critical', color: 'red'    },
      { name: 'High',     color: 'orange' },
      { name: 'Medium',   color: 'yellow' },
      { name: 'Low',      color: 'gray'   },
    ]}},
    'Assignee':      { people: {} },
    'Due Date':      { date: {} },
    'Tags':          { multi_select: { options: [
      { name: 'has-migration',  color: 'red'    },
      { name: 'has-env-change', color: 'orange' },
      { name: 'issue-persists', color: 'red'    },
      { name: 'reviewed',       color: 'green'  },
      { name: 'pending-merge',  color: 'blue'   },
      { name: 'coding',         color: 'yellow' },
    ]}},
    'Notes':         { rich_text: {} },
    'URL':           { url: {} },
    'Effort':        { number: { format: 'number' } },
    'Git Branch':    { rich_text: {} },
    'Pull Request':  { url: {} },
    'Review round':  { number: { format: 'number' } },
    'Depends on':    { relation: { database_id: databaseId, single_property: {} } },
  }

  await notionPatch(`/databases/${databaseId}`, creds, { properties })

  return c.json({ ok: true, database_id: databaseId, bootstrapped: Object.keys(properties) })
})
