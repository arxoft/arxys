import { Hono } from 'hono'
import { authMiddleware } from './middleware/auth'
import { notionTaskRoutes }    from './notion/task'
import { notionCommentRoutes } from './notion/comment'
import { notionUserRoutes }    from './notion/user'
import { notionDbRoutes }      from './notion/db'
import { githubPrRoutes }    from './github/pr'
import { githubIssueRoutes } from './github/issue'
import { githubRepoRoutes }  from './github/repo'
import { githubUserRoutes }  from './github/user'
import { slackRoutes }       from './slack/routes'
import { adminRoutes }         from './admin'
import { authRoutes }          from './auth'
import type { AppEnv } from './types'

const ALLOWED_ORIGINS = [
  'https://arxys-admin.pages.dev',
  'https://admin.arxys.arxoft.com',
]

const app = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// CORS — manual middleware (reliable across all Hono versions)
// ---------------------------------------------------------------------------
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') ?? ''
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  // Handle preflight
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':      allowed,
        'Access-Control-Allow-Methods':     'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':     'Content-Type, X-Api-Key, X-Workspace, X-Session-Token',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age':           '86400',
      },
    })
  }

  await next()

  // Attach CORS headers to every response
  c.res.headers.set('Access-Control-Allow-Origin',      allowed)
  c.res.headers.set('Access-Control-Allow-Credentials', 'true')
})

// ---------------------------------------------------------------------------
// API reference — no auth required
// ---------------------------------------------------------------------------
app.get('/', (c) => c.json({
  service:  'arxys-api',
  version:  '1.0.0',
  base_url: 'https://arxys.arxoft.com',
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
    auth: {
      description: 'OTP email login — no headers required',
      routes: [
        'POST /auth/otp/request       { email }                          → sends 6-digit OTP',
        'POST /auth/otp/verify        { email, code }                    → returns session token',
        'POST /auth/logout            { token }                          → invalidates session',
        'GET  /auth/me                                                   → validate session + member info',
      ],
    },

    'notion/task': {
      description: 'Notion task management',
      routes: [
        'GET  /v1/notion/task/list                                       → list tasks (excludes Icebox by default)',
        'GET  /v1/notion/task/list?mine=1                                → tasks assigned to you',
        'GET  /v1/notion/task/list?icebox=1                              → include Icebox tasks',
        'GET  /v1/notion/task/list?review_queue=1                        → Pending Review, topological sort',
        'GET  /v1/notion/task/list?filter_prop=Status&filter_val=Backlog → filter by property',
        'GET  /v1/notion/task/list?sort=Priority&sort_dir=asc            → sort by property',
        'GET  /v1/notion/task/:no                                        → task details + comments',
        'POST /v1/notion/task                { title }                   → create task',
        'PATCH /v1/notion/task/:no           { property, value }         → update any property',
        'PATCH /v1/notion/task/:no/assign    { emails: [] }              → set assignees',
        'PATCH /v1/notion/task/:no/unassign  { emails: [] }              → remove assignees',
        'POST /v1/notion/task/fix-titles                                 → dry-run: show drifted titles',
        'POST /v1/notion/task/fix-titles?apply=1                         → repair (No.) prefixes',
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
// All operational routes require auth + workspace context
// Mounted under /v1 to avoid conflicting with /admin and /auth
// ---------------------------------------------------------------------------
const api = new Hono<AppEnv>()
api.use('*', authMiddleware)

api.route('/notion/task',    notionTaskRoutes)
api.route('/notion/comment', notionCommentRoutes)
api.route('/notion/user',    notionUserRoutes)
api.route('/notion/db',      notionDbRoutes)
api.route('/github/pr',    githubPrRoutes)
api.route('/github/issue', githubIssueRoutes)
api.route('/github/repo',  githubRepoRoutes)
api.route('/github/user',  githubUserRoutes)
api.route('/slack',        slackRoutes)

app.route('/v1', api)

// ---------------------------------------------------------------------------
// Admin routes — session token auth, managed inside adminRoutes
// ---------------------------------------------------------------------------
app.route('/admin', adminRoutes)

app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message ?? 'Internal server error' }, 500)
})

export default app
