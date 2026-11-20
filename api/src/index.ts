import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth'
import { taskRoutes }          from './task'
import { workflowRoutes, getRulesContent, getSteeringContent } from './workflows'
import { notionTaskRoutes }    from './notion/task'
import { notionCommentRoutes } from './notion/comment'
import { notionUserRoutes }    from './notion/user'
import { notionDbRoutes }      from './notion/db'
import { githubPrRoutes }      from './github/pr'
import { githubIssueRoutes }   from './github/issue'
import { githubProjectRoutes } from './github/project'
import { githubRepoRoutes }    from './github/repo'
import { githubUserRoutes }    from './github/user'
import { slackRoutes }         from './slack/routes'
import { adminRoutes }         from './admin'
import { authRoutes }          from './auth'
import type { AppEnv } from './types'

const ALLOWED_ORIGINS = [
  'https://arxysadmin.arxoft.com',
  'https://arxys-admin.pages.dev',
]

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true
  if (/^https:\/\/[a-z0-9-]+\.arxys-admin\.pages\.dev$/.test(origin)) return true
  return false
}

const app = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// CORS — Hono built-in middleware with dynamic origin matching
// Handles OPTIONS preflight + response headers on every route automatically
// ---------------------------------------------------------------------------
app.use('*', cors({
  origin: (origin) => isAllowedOrigin(origin) ? origin : '',
  allowMethods:  ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders:  ['Content-Type', 'X-Api-Key', 'X-Workspace', 'X-Session-Token'],
  exposeHeaders: [],
  credentials:   true,
  maxAge:        86400,
}))

// Never let Cloudflare or any proxy cache API responses
app.use('*', async (c, next) => {
  await next()
  c.res.headers.set('Cache-Control', 'no-store')
})

// ---------------------------------------------------------------------------
// API reference — no auth required
// ---------------------------------------------------------------------------
app.get('/', (c) => c.json({
  service:  'arxys-api',
  version:  '1.0.0',
  base_url: 'https://arxysapis.arxoft.com',
  docs:     'https://github.com/arxoft/arxys',

  auth: {
    description: 'All /v1/* routes require X-Api-Key and X-Workspace headers. Admin routes require X-Session-Token (obtained via OTP login).',
    headers: {
      'X-Api-Key':       'Your personal arxys API key (axk_...)',
      'X-Workspace':     'Workspace slug (e.g. arxoft-main, alqada, sensei)',
      'X-Session-Token': 'Session token for admin routes (obtained via /auth/otp/verify)',
    },
  },

  endpoints: {
    'workflow + rules': {
      description: 'Workflow docs, task rules, and steering template — no auth required',
      routes: [
        'GET  /v1/workflow/list        → index of all workflows',
        'GET  /v1/workflow/:name       → full workflow doc (development, review, hotfix, deployment, testing, planning, task-creation, bug-reporting, release, onboarding)',
        'GET  /v1/rules               → task rules and hard git/production rules',
        'GET  /v1/steering            → canonical steering.example.md template',
      ],
    },

    auth: {
      description: 'OTP email login — no headers required',
      routes: [
        'POST /auth/otp/request       { email }                          → sends 6-digit OTP',
        'POST /auth/otp/verify        { email, code }                    → returns session token',
        'POST /auth/logout            { token }                          → invalidates session',
        'GET  /auth/me                                                   → validate session + member info',
      ],
    },

    task: {
      description: 'Unified task abstraction — dispatches to GHP or Notion based on workspace board_type',
      routes: [
        'GET    /v1/task/list                                             → list tasks (?mine=1 ?icebox=1 ?status=X)',
        'GET    /v1/task/:ref                                             → task + comments (:ref = issue number or Notion No.)',
        'POST   /v1/task              { title, body_text?, assignee? }   → create task',
        'PATCH  /v1/task/:ref         { field, value }                   → update field (Status, Priority, etc.)',
        'PATCH  /v1/task/:ref/assign  { assignees: [] }                  → assign (logins for GHP, emails for Notion)',
        'PATCH  /v1/task/:ref/unassign { assignees: [] }                 → remove assignees',
        'POST   /v1/task/:ref/comment { text }                           → add comment',
      ],
    },

    'notion/task': {
      description: 'Notion task management',
      routes: [
        'GET  /v1/notion/task/list                                       → list records (excludes Icebox by default)',
        'GET  /v1/notion/task/list?mine=1                                → records assigned to you',
        'GET  /v1/notion/task/list?icebox=1                              → include Icebox records',
        'GET  /v1/notion/task/list?filter_prop=Status&filter_val=Backlog → filter by property',
        'GET  /v1/notion/task/list?sort=Priority&sort_dir=asc            → sort by property',
        'GET  /v1/notion/task/:no                                        → record details + comments',
        'POST /v1/notion/task                { title }                   → create record',
        'PATCH /v1/notion/task/:no           { property, value }         → update any property',
        'PATCH /v1/notion/task/:no/assign    { emails: [] }              → set assignees',
        'PATCH /v1/notion/task/:no/unassign  { emails: [] }              → remove assignees',
      ],
    },

    'notion/comment': {
      description: 'Notion comments',
      routes: [
        'POST /v1/notion/comment/:no  { text }                           → add comment to task',
      ],
    },

    'notion/user': {
      description: 'Notion workspace members',
      routes: [
        'GET  /v1/notion/user/list                                        → list workspace members',
      ],
    },

    'notion/db': {
      description: 'Notion database management',
      routes: [
        'GET  /v1/notion/db/list                                          → list board aliases for this venture',
        'GET  /v1/notion/db/info                                          → fetch DB schema (default board)',
        'GET  /v1/notion/db/info?board=alias                              → fetch DB schema by alias',
        'POST /v1/notion/db/bootstrap                                     → provision standard arxys schema',
        'POST /v1/notion/db/bootstrap?board=alias                         → bootstrap a specific board',
      ],
    },

    'github/pr': {
      description: 'GitHub pull requests',
      routes: [
        'GET  /v1/github/pr/list?repo=owner/repo                          → list PRs',
        'GET  /v1/github/pr/list?repo=owner/repo&state=closed             → closed PRs',
        'GET  /v1/github/pr/list?repo=owner/repo&mine=1                   → your PRs',
        'GET  /v1/github/pr/:number?repo=owner/repo                       → PR details + reviews + comments',
        'GET  /v1/github/pr/:number/files?repo=owner/repo                 → changed files',
        'GET  /v1/github/pr/:number/status?repo=owner/repo                → CI check runs',
        'GET  /v1/github/pr/base-check?repo=o/r&base=main&sha=abc123      → staleness check',
        'POST /v1/github/pr                { repo, title, head, base? }   → create PR',
        'POST /v1/github/pr/:number/merge  { method? }                    → merge PR',
        'POST /v1/github/pr/:number/review { action, body_text? }         → submit review',
      ],
    },

    'github/issue': {
      description: 'GitHub issues',
      routes: [
        'GET  /v1/github/issue/list?repo=owner/repo                       → list issues',
        'GET  /v1/github/issue/:number?repo=owner/repo                    → issue details + comments',
        'POST /v1/github/issue            { repo, title, body_text? }     → create issue',
        'PATCH /v1/github/issue/:number   { state?, title?, ... }         → update issue',
        'POST /v1/github/issue/:number/comment { text }                   → add comment',
      ],
    },

    'github/project': {
      description: 'GitHub Projects v2 — task boards (GraphQL-backed). Requires venture.github_org to be set.',
      routes: [
        'POST /v1/github/org/bootstrap                                                       → provision org-level issue types (Task/Bug/Feature/Hotfix/Epic) + issue fields (Deploy Flags). Run once per org, safe to re-run.',
        'GET  /v1/github/project/list                                                        → list projects for venture org',
        'GET  /v1/github/project/members                                                     → list org members (equiv. to notion/user/list)',
        'POST /v1/github/project              { title }                                      → create project under venture org',
        'POST /v1/github/project/bootstrap    { project_id? OR title }                      → provision project fields (Status, Git Branch, Pull Request, Review round, Description, Due Date). Run org/bootstrap first.',
        'GET  /v1/github/project/:id/issues                                                  → list issues (Icebox hidden by default)',
        'GET  /v1/github/project/:id/issues?status=In+Progress                               → filter by status',
        'GET  /v1/github/project/:id/issues?mine=1                                           → your issues',
        'GET  /v1/github/project/:id/issues?icebox=1                                         → include Icebox issues',
        'GET  /v1/github/project/:id/issues?field=Priority&value=High                        → filter by any project field value',
        'POST /v1/github/project/:id/issues   { repo, issue_number }                        → add issue to project',
        'PATCH /v1/github/project/:id/issues/:itemId { field_id, value }                    → update field; Status change posts audit comment + Slack',
        'PATCH /v1/github/project/:id/issues/:itemId/assign   { assignees: [] }             → assign users by login, fires Slack per assignee',
        'PATCH /v1/github/project/:id/issues/:itemId/unassign { assignees: [] }             → remove assignees',
        'POST  /v1/github/project/:id/issues/:number/comment  { text }                      → comment on issue, fires Slack',
        'GET  /v1/github/project/:id/fields                                                  → list project fields + option IDs',
      ],
    },

    'github/repo': {
      description: 'GitHub repositories',
      routes: [
        'GET  /v1/github/repo/info?repo=owner/repo                        → repo details',
        'GET  /v1/github/repo/list                                         → list repos for venture org',
        'GET  /v1/github/repo/list?org=other-org                          → list repos for any org',
        'GET  /v1/github/repo/commits?repo=owner/repo                     → recent commits',
        'GET  /v1/github/repo/search?q=query                              → search repositories',
      ],
    },

    'github/user': {
      description: 'GitHub users',
      routes: [
        'GET  /v1/github/user/search?q=query                              → search users',
        'GET  /v1/github/user/me                                           → authenticated user info',
      ],
    },

    slack: {
      description: 'Manual Slack messaging — for significant agent events not covered by auto-notifications',
      routes: [
        'POST /v1/slack/notify  { text }  → send a message to the workspace Slack channel',
      ],
    },
  },
}))

// ---------------------------------------------------------------------------
// Auth routes — no middleware
// ---------------------------------------------------------------------------
app.route('/auth', authRoutes)

// ---------------------------------------------------------------------------
// Workflow, rules, and steering — no auth required
// ---------------------------------------------------------------------------
app.route('/v1/workflow', workflowRoutes)
app.get('/v1/rules',    (c) => c.text(getRulesContent(),    200, { 'Content-Type': 'text/markdown; charset=utf-8' }))
app.get('/v1/steering', (c) => c.text(getSteeringContent(), 200, { 'Content-Type': 'text/markdown; charset=utf-8' }))

// ---------------------------------------------------------------------------
// All operational routes require auth + workspace context
// ---------------------------------------------------------------------------
const api = new Hono<AppEnv>()
api.use('*', authMiddleware)

api.route('/task',           taskRoutes)
api.route('/notion/task',    notionTaskRoutes)
api.route('/notion/comment', notionCommentRoutes)
api.route('/notion/user',    notionUserRoutes)
api.route('/notion/db',      notionDbRoutes)
api.route('/github/pr',      githubPrRoutes)
api.route('/github/issue',   githubIssueRoutes)
api.route('/github/project', githubProjectRoutes)
api.route('/github/repo',    githubRepoRoutes)
api.route('/github/user',    githubUserRoutes)
api.route('/slack',          slackRoutes)

app.route('/v1', api)

// ---------------------------------------------------------------------------
// Admin routes — session token auth, managed inside adminRoutes
// ---------------------------------------------------------------------------
app.route('/admin', adminRoutes)

app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  const status = (err as Error & { status?: number }).status
  if (status === 400 || status === 403 || status === 404) {
    return c.json({ error: err.message }, status)
  }
  return c.json({ error: err.message ?? 'Internal server error' }, 500)
})

export default app
