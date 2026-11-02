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

  // Must be venture admin in at least one venture,
  // OR have no venture memberships at all (bootstrap state — empty DB)
  const membershipCount = await c.env.DB
    .prepare('SELECT COUNT(*) as count FROM venture_members WHERE member_id = ?')
    .bind(session.member_id)
    .first<{ count: number }>()

  const isAdmin = membershipCount?.count === 0 || await c.env.DB
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
    .prepare('SELECT id, display_name, slack_channel_id, created_at FROM ventures')
    .all()
  return c.json(rows.results)
})

adminRoutes.post('/ventures', async (c) => {
  const body = await c.req.json<{
    id: string; display_name: string
    slack_bot_token?: string; slack_channel_id?: string
  }>()
  await c.env.DB
    .prepare('INSERT INTO ventures (id, display_name, slack_bot_token, slack_channel_id) VALUES (?, ?, ?, ?)')
    .bind(body.id, body.display_name, body.slack_bot_token ?? null, body.slack_channel_id ?? null)
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
  const body = await c.req.json<{ id: string; display_name: string; login_email?: string }>()

  const raw    = crypto.getRandomValues(new Uint8Array(16))
  const apiKey = 'axk_' + Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('')

  await c.env.DB
    .prepare('INSERT INTO members (id, display_name, api_key, login_email) VALUES (?, ?, ?, ?)')
    .bind(body.id, body.display_name, apiKey, body.login_email ?? null)
    .run()

  return c.json({ ok: true, id: body.id, api_key: apiKey }, 201)
})

// PATCH member — update display_name and/or id (slug)
// Slug rename is done in a transaction to update all FK references manually
adminRoutes.patch('/members/:member_id', async (c) => {
  const oldId = c.req.param('member_id')
  const body  = await c.req.json<{ display_name?: string; id?: string; login_email?: string }>()

  if (!body.display_name && !body.id && body.login_email === undefined) {
    return c.json({ error: 'Nothing to update' }, 400)
  }

  const exists = await c.env.DB
    .prepare('SELECT id FROM members WHERE id = ?')
    .bind(oldId)
    .first()
  if (!exists) return c.json({ error: `Member '${oldId}' not found` }, 404)

  const newId = body.id ?? oldId

  if (body.id && body.id !== oldId) {
    // Check new slug not already taken
    const conflict = await c.env.DB
      .prepare('SELECT id FROM members WHERE id = ?')
      .bind(body.id)
      .first()
    if (conflict) return c.json({ error: `ID '${body.id}' is already taken` }, 409)

    // Rename: insert new row, update all FK references, delete old row
    // D1 doesn't support multi-statement transactions via the API in a single
    // .prepare() call, so we run each statement sequentially
    const displayName = body.display_name
      ? body.display_name
      : (await c.env.DB.prepare('SELECT display_name FROM members WHERE id = ?').bind(oldId).first<{ display_name: string }>())?.display_name ?? oldId

    await c.env.DB.prepare('INSERT INTO members (id, display_name, api_key, created_at) SELECT ?, ?, api_key, created_at FROM members WHERE id = ?')
      .bind(newId, displayName, oldId).run()
    await c.env.DB.prepare('UPDATE venture_members  SET member_id = ? WHERE member_id = ?').bind(newId, oldId).run()
    await c.env.DB.prepare('UPDATE workspace_members SET member_id = ? WHERE member_id = ?').bind(newId, oldId).run()
    await c.env.DB.prepare('UPDATE sessions          SET member_id = ? WHERE member_id = ?').bind(newId, oldId).run()
    await c.env.DB.prepare('DELETE FROM members WHERE id = ?').bind(oldId).run()

    return c.json({ ok: true, id: newId })
  }

  // Display name / login_email only
  if (body.display_name) {
    await c.env.DB.prepare('UPDATE members SET display_name = ? WHERE id = ?').bind(body.display_name, oldId).run()
  }
  if (body.login_email !== undefined) {
    await c.env.DB.prepare('UPDATE members SET login_email = ? WHERE id = ?').bind(body.login_email || null, oldId).run()
  }

  return c.json({ ok: true, id: oldId })
})

// Delete member — cascades to venture_members, workspace_members, sessions
adminRoutes.delete('/members/:member_id', async (c) => {
  const memberId = c.req.param('member_id')
  const adminId  = c.get('adminMemberId')

  // Prevent self-deletion
  if (memberId === adminId) {
    return c.json({ error: 'You cannot delete your own account' }, 400)
  }

  // Prevent deletion if this member is the last admin in any venture
  const ventureAdminships = await c.env.DB
    .prepare(`SELECT venture_id FROM venture_members WHERE member_id = ? AND venture_role = 'admin'`)
    .bind(memberId)
    .all<{ venture_id: string }>()

  for (const { venture_id } of ventureAdminships.results) {
    const adminCount = await c.env.DB
      .prepare(`SELECT COUNT(*) as count FROM venture_members WHERE venture_id = ? AND venture_role = 'admin'`)
      .bind(venture_id)
      .first<{ count: number }>()

    if ((adminCount?.count ?? 0) <= 1) {
      return c.json({
        error: `Cannot delete: ${memberId} is the last admin of venture '${venture_id}'. Assign another admin first.`
      }, 400)
    }
  }

  await c.env.DB
    .prepare('DELETE FROM members WHERE id = ?')
    .bind(memberId)
    .run()

  return c.json({ ok: true })
})

// Regenerate API key — returns new key once, never retrievable again
adminRoutes.post('/members/:member_id/regenerate-key', async (c) => {
  const memberId = c.req.param('member_id')

  const exists = await c.env.DB
    .prepare('SELECT id FROM members WHERE id = ?')
    .bind(memberId)
    .first()
  if (!exists) return c.json({ error: `Member '${memberId}' not found` }, 404)

  const raw    = crypto.getRandomValues(new Uint8Array(16))
  const apiKey = 'axk_' + Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('')

  await c.env.DB
    .prepare('UPDATE members SET api_key = ? WHERE id = ?')
    .bind(apiKey, memberId)
    .run()

  return c.json({ ok: true, member_id: memberId, api_key: apiKey })
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

// GET venture members for a venture
adminRoutes.get('/ventures/:venture_id/members', async (c) => {
  const ventureId = c.req.param('venture_id')
  const rows = await c.env.DB
    .prepare(`SELECT vm.member_id, m.display_name, vm.venture_role, vm.notion_user, vm.email
              FROM venture_members vm JOIN members m ON vm.member_id = m.id
              WHERE vm.venture_id = ?`)
    .bind(ventureId)
    .all<{ member_id: string; display_name: string; venture_role: string; notion_user: string | null; email: string | null }>()
  return c.json(rows.results)
})

// PATCH venture membership — update role, PAT, email, notion_user
adminRoutes.patch('/ventures/:venture_id/members/:member_id', async (c) => {
  const { venture_id, member_id } = c.req.param()
  const body = await c.req.json<{
    github_pat?: string; venture_role?: 'admin' | 'member'
    notion_user?: string; email?: string
  }>()

  const fields: string[] = []
  const values: unknown[] = []

  if (body.github_pat   !== undefined) { fields.push('github_pat = ?');   values.push(body.github_pat) }
  if (body.venture_role !== undefined) { fields.push('venture_role = ?'); values.push(body.venture_role) }
  if (body.notion_user  !== undefined) { fields.push('notion_user = ?');  values.push(body.notion_user || null) }
  if (body.email        !== undefined) { fields.push('email = ?');        values.push(body.email || null) }

  if (!fields.length) return c.json({ error: 'Nothing to update' }, 400)

  values.push(venture_id, member_id)
  await c.env.DB
    .prepare(`UPDATE venture_members SET ${fields.join(', ')} WHERE venture_id = ? AND member_id = ?`)
    .bind(...values)
    .run()

  return c.json({ ok: true, venture_id, member_id })
})

// DELETE venture membership
adminRoutes.delete('/ventures/:venture_id/members/:member_id', async (c) => {
  const { venture_id, member_id } = c.req.param()
  await c.env.DB
    .prepare('DELETE FROM venture_members WHERE venture_id = ? AND member_id = ?')
    .bind(venture_id, member_id)
    .run()
  return c.json({ ok: true })
})

// ── Workspace membership ──────────────────────────────────────────────────────

// GET workspace members
adminRoutes.get('/workspaces/:workspace_id/members', async (c) => {
  const workspaceId = c.req.param('workspace_id')
  const rows = await c.env.DB
    .prepare(`SELECT wm.member_id, m.display_name, wm.workspace_role
              FROM workspace_members wm JOIN members m ON wm.member_id = m.id
              WHERE wm.workspace_id = ?`)
    .bind(workspaceId)
    .all<{ member_id: string; display_name: string; workspace_role: string }>()
  return c.json(rows.results)
})

adminRoutes.post('/workspaces/:workspace_id/members', async (c) => {
  const workspaceId = c.req.param('workspace_id')
  const body = await c.req.json<{ member_id: string; workspace_role?: 'admin' | 'member' }>()

  await c.env.DB
    .prepare('INSERT INTO workspace_members (workspace_id, member_id, workspace_role) VALUES (?, ?, ?)')
    .bind(workspaceId, body.member_id, body.workspace_role ?? 'member')
    .run()

  return c.json({ ok: true, workspace_id: workspaceId, member_id: body.member_id }, 201)
})

// PATCH workspace membership role
adminRoutes.patch('/workspaces/:workspace_id/members/:member_id', async (c) => {
  const { workspace_id, member_id } = c.req.param()
  const body = await c.req.json<{ workspace_role: 'admin' | 'member' }>()
  if (!body.workspace_role) return c.json({ error: 'workspace_role is required' }, 400)

  await c.env.DB
    .prepare('UPDATE workspace_members SET workspace_role = ? WHERE workspace_id = ? AND member_id = ?')
    .bind(body.workspace_role, workspace_id, member_id)
    .run()

  return c.json({ ok: true, workspace_id, member_id })
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
