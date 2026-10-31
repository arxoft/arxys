import { Hono } from 'hono'
import type { AppEnv } from './types'

// ---------------------------------------------------------------------------
// Admin routes — venture/workspace/member management
// Auth: X-Session-Token (from OTP login) — must belong to a venture admin
// ---------------------------------------------------------------------------

export const adminRoutes = new Hono<AppEnv>()

// Session auth middleware for admin routes
adminRoutes.use('*', async (c, next) => {
  const token = c.req.header('X-Session-Token')
  if (!token) return c.json({ error: 'Missing X-Session-Token' }, 401)

  const now = new Date().toISOString()
  const session = await c.env.DB
    .prepare(`
      SELECT s.member_id, m.display_name
      FROM sessions s JOIN members m ON s.member_id = m.id
      WHERE s.token = ? AND s.expires_at > ?
    `)
    .bind(token, now)
    .first<{ member_id: string; display_name: string }>()

  if (!session) return c.json({ error: 'Invalid or expired session' }, 401)

  // Must be venture admin in at least one venture
  const isAdmin = await c.env.DB
    .prepare("SELECT 1 FROM venture_members WHERE member_id = ? AND venture_role = 'admin' LIMIT 1")
    .bind(session.member_id)
    .first()

  if (!isAdmin) return c.json({ error: 'Admin access required' }, 403)

  c.set('adminMemberId', session.member_id)
  await next()
})

// ── Ventures ────────────────────────────────────────────────────────────────

adminRoutes.get('/ventures', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT id, display_name, github_org, slack_channel_id, created_at FROM ventures')
    .all()
  return c.json(rows.results)
})

adminRoutes.post('/ventures', async (c) => {
  const body = await c.req.json<{
    id: string; display_name: string; github_org: string
    slack_bot_token?: string; slack_channel_id?: string
  }>()

  await c.env.DB
    .prepare(`INSERT INTO ventures (id, display_name, github_org, slack_bot_token, slack_channel_id)
              VALUES (?, ?, ?, ?, ?)`)
    .bind(body.id, body.display_name, body.github_org,
          body.slack_bot_token ?? null, body.slack_channel_id ?? null)
    .run()

  return c.json({ ok: true, id: body.id }, 201)
})

// ── Workspaces ───────────────────────────────────────────────────────────────

adminRoutes.get('/workspaces', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT id, venture_id, display_name, github_repo, notion_database_id FROM workspaces')
    .all()
  return c.json(rows.results)
})

adminRoutes.post('/workspaces', async (c) => {
  const body = await c.req.json<{
    id: string; venture_id: string; display_name: string
    github_repo: string; notion_api_key: string
    notion_database_id: string; slack_channel_id?: string
  }>()

  await c.env.DB
    .prepare(`INSERT INTO workspaces
              (id, venture_id, display_name, github_repo, notion_api_key,
               notion_database_id, slack_channel_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(body.id, body.venture_id, body.display_name, body.github_repo,
          body.notion_api_key, body.notion_database_id, body.slack_channel_id ?? null)
    .run()

  return c.json({ ok: true, id: body.id }, 201)
})

// ── Members ──────────────────────────────────────────────────────────────────

adminRoutes.get('/members', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT id, display_name, created_at FROM members')
    .all()
  return c.json(rows.results)
})

adminRoutes.post('/members', async (c) => {
  const body = await c.req.json<{
    id: string; display_name: string
  }>()

  const raw    = crypto.getRandomValues(new Uint8Array(16))
  const apiKey = 'axk_' + Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('')

  await c.env.DB
    .prepare('INSERT INTO members (id, display_name, api_key) VALUES (?, ?, ?)')
    .bind(body.id, body.display_name, apiKey)
    .run()

  return c.json({ ok: true, id: body.id, api_key: apiKey }, 201)
})

// ── Venture membership ────────────────────────────────────────────────────────

adminRoutes.post('/ventures/:venture_id/members', async (c) => {
  const ventureId = c.req.param('venture_id')
  const body = await c.req.json<{
    member_id: string; github_pat: string
    venture_role?: 'admin' | 'member'; notion_user?: string; email?: string
  }>()

  await c.env.DB
    .prepare(`INSERT INTO venture_members (venture_id, member_id, venture_role, github_pat, notion_user, email)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(ventureId, body.member_id, body.venture_role ?? 'member',
          body.github_pat, body.notion_user ?? null, body.email ?? null)
    .run()

  return c.json({ ok: true, venture_id: ventureId, member_id: body.member_id }, 201)
})

// ── Workspace membership ──────────────────────────────────────────────────────

adminRoutes.post('/workspaces/:workspace_id/members', async (c) => {
  const workspaceId = c.req.param('workspace_id')
  const body = await c.req.json<{
    member_id: string; workspace_role?: 'admin' | 'member'
  }>()

  await c.env.DB
    .prepare(`INSERT INTO workspace_members (workspace_id, member_id, workspace_role)
              VALUES (?, ?, ?)`)
    .bind(workspaceId, body.member_id, body.workspace_role ?? 'member')
    .run()

  return c.json({ ok: true, workspace_id: workspaceId, member_id: body.member_id }, 201)
})

adminRoutes.delete('/workspaces/:workspace_id/members/:member_id', async (c) => {
  const { workspace_id, member_id } = c.req.param()

  await c.env.DB
    .prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND member_id = ?')
    .bind(workspace_id, member_id)
    .run()

  return c.json({ ok: true })
})

// ── Workspace repos ───────────────────────────────────────────────────────────

adminRoutes.post('/workspaces/:workspace_id/repos', async (c) => {
  const workspaceId = c.req.param('workspace_id')
  const body = await c.req.json<{ repo: string; alias?: string }>()

  await c.env.DB
    .prepare('INSERT INTO workspace_repos (workspace_id, repo, alias) VALUES (?, ?, ?)')
    .bind(workspaceId, body.repo, body.alias ?? null)
    .run()

  return c.json({ ok: true }, 201)
})

// ── Venture boards ────────────────────────────────────────────────────────────

adminRoutes.post('/ventures/:venture_id/boards', async (c) => {
  const ventureId = c.req.param('venture_id')
  const body = await c.req.json<{ database_id: string; alias: string }>()

  await c.env.DB
    .prepare('INSERT INTO venture_boards (venture_id, database_id, alias) VALUES (?, ?, ?)')
    .bind(ventureId, body.database_id, body.alias)
    .run()

  return c.json({ ok: true }, 201)
})
