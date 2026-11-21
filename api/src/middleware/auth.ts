import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'
import { getInstallationToken } from '../github/app-auth'

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const apiKey      = c.req.header('X-Api-Key')
  const workspaceId = c.req.header('X-Workspace')

  if (!apiKey)      return c.json({ error: 'Missing X-Api-Key header' },  401)
  if (!workspaceId) return c.json({ error: 'Missing X-Workspace header' }, 400)

  const db = c.env.DB

  const member = await db
    .prepare('SELECT id, display_name FROM members WHERE api_key = ?')
    .bind(apiKey)
    .first<{ id: string; display_name: string }>()

  if (!member) return c.json({ error: 'Invalid API key' }, 401)

  const workspace = await db
    .prepare(`
      SELECT w.id, w.venture_id, w.display_name, w.github_repo,
             w.notion_api_key, w.notion_database_id,
             w.github_project_id, w.slack_channel_id
      FROM workspaces w WHERE w.id = ?
    `)
    .bind(workspaceId)
    .first<{
      id: string; venture_id: string; display_name: string
      github_repo: string
      notion_api_key: string | null; notion_database_id: string | null
      github_project_id: string | null; slack_channel_id: string | null
    }>()

  if (!workspace) return c.json({ error: `Workspace '${workspaceId}' not found` }, 404)

  const venture = await db
    .prepare('SELECT id, slack_bot_token, slack_channel_id, github_org, github_app_installation_id FROM ventures WHERE id = ?')
    .bind(workspace.venture_id)
    .first<{
      id: string
      slack_bot_token: string | null; slack_channel_id: string | null
      github_org: string | null; github_app_installation_id: string | null
    }>()

  if (!venture) return c.json({ error: 'Venture not found' }, 500)

  const ventureMember = await db
    .prepare(`
      SELECT venture_role, github_pat, github_login, notion_user, email
      FROM venture_members WHERE venture_id = ? AND member_id = ?
    `)
    .bind(workspace.venture_id, member.id)
    .first<{
      venture_role: string; github_pat: string | null; github_login: string | null
      notion_user: string | null; email: string | null
    }>()

  if (!ventureMember) {
    return c.json({ error: `You are not a member of venture '${workspace.venture_id}'` }, 403)
  }

  if (ventureMember.venture_role !== 'admin') {
    const wsAccess = await db
      .prepare('SELECT workspace_role FROM workspace_members WHERE workspace_id = ? AND member_id = ?')
      .bind(workspaceId, member.id)
      .first<{ workspace_role: string }>()

    if (!wsAccess) {
      return c.json({ error: `You do not have access to workspace '${workspaceId}'` }, 403)
    }
    c.set('workspaceRole', wsAccess.workspace_role)
  } else {
    c.set('workspaceRole', 'admin')
  }

  // Resolve GitHub token: App installation token (preferred) → member PAT (fallback)
  let githubToken: string
  if (venture.github_app_installation_id && c.env.GITHUB_APP_ID && c.env.GITHUB_APP_PRIVATE_KEY) {
    githubToken = await getInstallationToken(
      venture.github_app_installation_id,
      c.env.GITHUB_APP_ID,
      c.env.GITHUB_APP_PRIVATE_KEY
    )
  } else if (ventureMember.github_pat) {
    githubToken = ventureMember.github_pat
  } else {
    return c.json({
      error: 'No GitHub credentials configured. Set github_app_installation_id on the venture or github_pat on the member.'
    }, 503)
  }

  const slackChannel = workspace.slack_channel_id ?? venture.slack_channel_id ?? null

  c.set('member',        member)
  c.set('workspace',     workspace)
  c.set('venture',       venture)
  c.set('ventureMember', ventureMember)
  c.set('credentials', {
    notionApiKey:     workspace.notion_api_key,
    notionDatabaseId: workspace.notion_database_id,
    notionUser:       ventureMember.notion_user ?? member.id,
    notionUserEmail:  ventureMember.email ?? null,
    githubToken,
    githubLogin:      ventureMember.github_login,
    githubProjectId:  workspace.github_project_id,
    slackBotToken:    venture.slack_bot_token,
    slackChannelId:   slackChannel,
  })

  await next()
}

export function adminOnly(c: Context<AppEnv>, next: Next) {
  const role = c.get('workspaceRole')
  if (role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }
  return next()
}
