import { Hono } from 'hono'
import type { AppEnv } from './types'

export const workspaceRoutes = new Hono<AppEnv>()

// GET /workspace/members — members who can access the caller's workspace.
// Includes explicit workspace_members rows plus venture admins (implicit access).
// Exposes identity mapping only: no emails, PATs or tokens.
workspaceRoutes.get('/members', async (c) => {
  const workspace = c.get('workspace')
  const rows = await c.env.DB
    .prepare(`
      SELECT m.id AS member_id, m.display_name, vm.venture_role,
             wm.workspace_role, vm.github_login, vm.notion_user
      FROM venture_members vm
      JOIN members m ON m.id = vm.member_id
      LEFT JOIN workspace_members wm
        ON wm.member_id = vm.member_id AND wm.workspace_id = ?
      WHERE vm.venture_id = ?
        AND (wm.member_id IS NOT NULL OR vm.venture_role = 'admin')
      ORDER BY m.display_name
    `)
    .bind(workspace.id, workspace.venture_id)
    .all<{
      member_id: string; display_name: string; venture_role: string
      workspace_role: string | null; github_login: string | null; notion_user: string | null
    }>()

  return c.json({
    workspace: workspace.id,
    members: rows.results.map(r => ({
      id:             r.member_id,
      display_name:   r.display_name,
      role:           r.venture_role === 'admin' ? 'admin' : (r.workspace_role ?? 'member'),
      github_login:   r.github_login,
      notion_user:    r.notion_user,
    })),
  })
})
