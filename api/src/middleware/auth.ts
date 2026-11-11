import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'

// ---------------------------------------------------------------------------
// Auth + context middleware
//
// Resolution chain:
//   1. api_key       → member
//   2. X-Workspace   → workspace → venture
//   3. venture_members → PAT, email, venture_role
//   4. workspace access check:
//        venture admin  → implicit access to all workspaces
//        venture member → must have workspace_members row
// ---------------------------------------------------------------------------
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const apiKey      = c.req.header('X-Api-Key')
  const workspaceId = c.req.header('X-Workspace')

  if (!apiKey)      return c.json({ error: 'Missing X-Api-Key header' },  401)
  if (!workspaceId) return c.json({ error: 'Missing X-Workspace header' }, 400)

  const db = c.env.DB

  // 1. Resolve member
  const member = await db
    .prepare('SELECT id, display_name FROM members WHERE api_key = ?')
    .bind(apiKey)
    .first<{ id: string; display_name: string }>()

  if (!member) return c.json({ error: 'Invalid API key' }, 401)

  // 2. Resolve workspace + venture in one query
  const workspace = await db
    .prepare(`
      SELECT w.id, w.venture_id, w.display_name, w.github_repo,
             w.board_type, w.notion_api_key, w.notion_database_id,
             w.github_project_id, w.slack_channel_id
      FROM workspaces w WHERE w.id = ?
    `)
    .bind(workspaceId)
    .first<{
      id: string; venture_id: string; display_name: string
      github_repo: string; board_type: 'notion' | 'github' | 'both'
      notion_api_key: string | null; notion_database_id: string | null
      github_project_id: string | null; slack_channel_id: string | null
    }>()

  if (!workspace) return c.json({ error: `Workspace '${workspaceId}' not found` }, 404)

  const venture = await db
    .prepare('SELECT id, slack_bot_token, slack_channel_id FROM ventures WHERE id = ?')
    .bind(workspace.venture_id)
    .first<{
      id: string
      slack_bot_token: string | null; slack_channel_id: string | null
    }>()

  if (!venture) return c.json({ error: 'Venture not found' }, 500)

  // 3. Resolve venture membership
  const ventureMember = await db
    .prepare(`
      SELECT venture_role, github_pat, notion_user, email
      FROM venture_members WHERE venture_id = ? AND member_id = ?
    `)
    .bind(workspace.venture_id, member.id)
    .first<{
      venture_role: string; github_pat: string
      notion_user: string | null; email: string | null
    }>()

  if (!ventureMember) {
    return c.json({ error: `You are not a member of venture '${workspace.venture_id}'` }, 403)
  }

  // 4. Workspace access check
  //    venture admin → bypass; venture member → needs workspace_members row
  if (ventureMember.venture_role !== 'admin') {
    const wsAccess = await db
      .prepare('SELECT workspace_role FROM workspace_members WHERE workspace_id = ? AND member_id = ?')
      .bind(workspaceId, member.id)
      .first<{ workspace_role: string }>()

    if (!wsAccess) {
      return c.json({
        error: `You do not have access to workspace '${workspaceId}'`
      }, 403)
    }
    c.set('workspaceRole', wsAccess.workspace_role)
  } else {
    c.set('workspaceRole', 'admin')
  }

  // Slack channel: workspace override → venture default → null
  const slackChannel = workspace.slack_channel_id ?? venture.slack_channel_id ?? null

  c.set('member',       member)
  c.set('workspace',    workspace)
  c.set('venture',      venture)
  c.set('ventureMember', ventureMember)
  c.set('credentials', {
    notionApiKey:     workspace.notion_api_key,
    notionDatabaseId: workspace.notion_database_id,
    notionUser:       ventureMember.notion_user ?? member.id,
    notionUserEmail:  ventureMember.email ?? null,
    githubToken:      ventureMember.github_pat,
    githubProjectId:  workspace.github_project_id,
    slackBotToken:    venture.slack_bot_token,
    slackChannelId:   slackChannel,
  })

  await next()
}

// ---------------------------------------------------------------------------
// Admin-only guard — checks workspace-level role
// Use after authMiddleware
// ---------------------------------------------------------------------------
export function adminOnly(c: Context<AppEnv>, next: Next) {
  const role = c.get('workspaceRole')
  if (role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }
  return next()
}
