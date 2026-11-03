import { Hono } from 'hono'
import type { AppEnv } from './types'

// ---------------------------------------------------------------------------
// Auth routes — OTP email login
//
// POST /auth/otp/request  { email }
//   → generates 6-digit OTP, stores with 10-min expiry, sends via Resend
//
// POST /auth/otp/verify   { email, code }
//   → validates OTP, creates 7-day session token, returns it
//
// POST /auth/logout        { token }
//   → deletes session
// ---------------------------------------------------------------------------

export const authRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// POST /auth/otp/request
// ---------------------------------------------------------------------------
authRoutes.post('/otp/request', async (c) => {
  const body = await c.req.json<{ email: string }>()
  if (!body.email) return c.json({ error: 'email is required' }, 400)

  const db    = c.env.DB
  const email = body.email.toLowerCase().trim()

  // Resolve member — check login_email on members first, then venture_members
  const member = await db
    .prepare(`
      SELECT id, display_name FROM members WHERE login_email = ?
      UNION
      SELECT m.id, m.display_name FROM members m
        JOIN venture_members vm ON m.id = vm.member_id
        WHERE vm.email = ?
      LIMIT 1
    `)
    .bind(email, email)
    .first<{ id: string; display_name: string }>()

  // Always respond with same message to avoid email enumeration
  if (!member) {
    return c.json({ ok: true, message: 'If that email is registered, a code has been sent.' })
  }

  // Generate 6-digit OTP
  const code     = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // Invalidate any existing unused codes for this email
  await db
    .prepare("UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0")
    .bind(email)
    .run()

  await db
    .prepare('INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)')
    .bind(email, code, expiresAt)
    .run()

  // Send email via Resend — fail loudly if not configured or rejected
  if (!c.env.RESEND_API_KEY || !c.env.RESEND_DOMAIN) {
    console.error('OTP email not sent: RESEND_API_KEY / RESEND_DOMAIN missing')
    return c.json({ error: 'Email service is not configured' }, 500)
  }

  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    `arxys <noreply@${c.env.RESEND_DOMAIN}>`,
      to:      [email],
      subject: 'Your arxys login code',
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:40px auto">
          <h2 style="margin-bottom:8px">arxys admin</h2>
          <p>Your login code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;padding:16px 0">${code}</div>
          <p style="color:#666;font-size:14px">Expires in 10 minutes. Do not share this code.</p>
        </div>
      `,
    }),
  })

  if (!sent.ok) {
    console.error(`OTP email not sent: Resend ${sent.status} ${await sent.text()}`)
    return c.json({ error: 'Failed to send login code' }, 502)
  }

  return c.json({ ok: true, message: 'If that email is registered, a code has been sent.' })
})

// ---------------------------------------------------------------------------
// POST /auth/otp/verify
// ---------------------------------------------------------------------------
authRoutes.post('/otp/verify', async (c) => {
  const body = await c.req.json<{ email: string; code: string }>()
  if (!body.email || !body.code) return c.json({ error: 'email and code are required' }, 400)

  const db    = c.env.DB
  const email = body.email.toLowerCase().trim()
  const now   = new Date().toISOString()

  // Find valid unused OTP
  const otp = await db
    .prepare(`
      SELECT id FROM otp_codes
      WHERE email = ? AND code = ? AND used = 0 AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `)
    .bind(email, body.code, now)
    .first<{ id: number }>()

  if (!otp) return c.json({ error: 'Invalid or expired code' }, 401)

  // Mark OTP as used
  await db
    .prepare('UPDATE otp_codes SET used = 1 WHERE id = ?')
    .bind(otp.id)
    .run()

  // Resolve member — check login_email on members first, then venture_members
  const member = await db
    .prepare(`
      SELECT id, display_name FROM members WHERE login_email = ?
      UNION
      SELECT m.id, m.display_name FROM members m
        JOIN venture_members vm ON m.id = vm.member_id
        WHERE vm.email = ?
      LIMIT 1
    `)
    .bind(email, email)
    .first<{ id: string; display_name: string }>()

  if (!member) return c.json({ error: 'Member not found' }, 404)

  // Generate session token
  const raw   = crypto.getRandomValues(new Uint8Array(32))
  const token = Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await db
    .prepare('INSERT INTO sessions (token, member_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, member.id, expiresAt)
    .run()

  return c.json({
    ok:           true,
    token,
    member_id:    member.id,
    display_name: member.display_name,
    expires_at:   expiresAt,
  })
})

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
authRoutes.post('/logout', async (c) => {
  const body = await c.req.json<{ token: string }>()
  if (!body.token) return c.json({ error: 'token is required' }, 400)

  await c.env.DB
    .prepare('DELETE FROM sessions WHERE token = ?')
    .bind(body.token)
    .run()

  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// GET /auth/me — validate session and return member info
// ---------------------------------------------------------------------------
authRoutes.get('/me', async (c) => {
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

  return c.json({ ok: true, member_id: session.member_id, display_name: session.display_name })
})
