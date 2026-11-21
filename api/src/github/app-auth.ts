// =============================================================================
// app-auth.ts — GitHub App installation token exchange
//
// Replaces per-member PATs with short-lived tokens issued by a GitHub App.
// One App per arxys deployment, installed per venture org.
//
// Token lifetime: 1 hour. Cached for 55 minutes per installation ID.
// Cache is in-memory per Worker isolate — acceptable because Workers are
// short-lived and the exchange adds <100ms on a cold hit.
// =============================================================================

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

// ---------------------------------------------------------------------------
// Sign a GitHub App JWT (RS256, valid for 60 seconds)
// Workers runtime supports WebCrypto natively.
// ---------------------------------------------------------------------------
async function signAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = { iat: now - 60, exp: now + 60, iss: appId }

  const b64 = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const signingInput = `${b64(header)}.${b64(payload)}`

  // Import PEM private key
  const pemBody = privateKeyPem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')

  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${signingInput}.${sigB64}`
}

// ---------------------------------------------------------------------------
// Get a short-lived installation token for a venture org.
// Returns the token string — assign to credentials.githubToken.
// ---------------------------------------------------------------------------
export async function getInstallationToken(
  installationId: string,
  appId: string,
  privateKeyPem: string
): Promise<string> {
  const cached = tokenCache.get(installationId)
  if (cached && Date.now() < cached.expiresAt) return cached.token

  const jwt = await signAppJwt(appId, privateKeyPem)

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept':        'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent':    'arxys-api/1.0',
      },
    }
  )

  if (!res.ok) {
    const err = await res.json() as { message?: string }
    throw new Error(`GitHub App token exchange failed: ${err.message ?? res.status}`)
  }

  const data = await res.json() as { token: string; expires_at: string }
  const expiresAt = Date.now() + 55 * 60 * 1000  // cache for 55 min

  tokenCache.set(installationId, { token: data.token, expiresAt })
  return data.token
}
