import { Hono } from 'hono'
import { authMiddleware } from './middleware/auth'
import { notionTaskRoutes }    from './notion/task'
import { notionCommentRoutes } from './notion/comment'
import { notionUserRoutes }    from './notion/user'
import { notionDbRoutes }      from './notion/db'
import { githubPrRoutes }      from './github/pr'
import { githubIssueRoutes }   from './github/issue'
import { githubRepoRoutes }    from './github/repo'
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
// Health check — no auth required
// ---------------------------------------------------------------------------
app.get('/', (c) => c.json({ service: 'arxys-api', status: 'ok' }))

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
api.route('/github/pr',      githubPrRoutes)
api.route('/github/issue',   githubIssueRoutes)
api.route('/github/repo',    githubRepoRoutes)

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
