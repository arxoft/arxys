import { NOTION_VERSION, NOTION_BASE } from '../types'
import type { Credentials } from '../types'

// ---------------------------------------------------------------------------
// Thin Notion API client — mirrors lib/common.sh notion_get/post/patch
// ---------------------------------------------------------------------------

// Guard — call at the top of any Notion route handler
export function requireNotionCreds(creds: Credentials): { notionApiKey: string; notionDatabaseId: string } {
  if (!creds.notionApiKey || !creds.notionDatabaseId) {
    throw new Error('This workspace is not configured for Notion. Board type is GitHub.')
  }
  return { notionApiKey: creds.notionApiKey, notionDatabaseId: creds.notionDatabaseId }
}

async function notionRequest(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  creds: Credentials,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method,
    headers: {
      'Authorization':  `Bearer ${creds.notionApiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type':   'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json() as Record<string, unknown>

  if (data.object === 'error') {
    throw new Error(`Notion API error: ${data.message ?? 'unknown'}`)
  }

  return data
}

export const notionGet   = (path: string, creds: Credentials) =>
  notionRequest('GET',   path, creds)

export const notionPost  = (path: string, creds: Credentials, body: unknown) =>
  notionRequest('POST',  path, creds, body)

export const notionPatch = (path: string, creds: Credentials, body: unknown) =>
  notionRequest('PATCH', path, creds, body)

// ---------------------------------------------------------------------------
// Resolve task No. → Notion page ID
// ---------------------------------------------------------------------------
export async function resolvePageId(no: number, creds: Credentials): Promise<string> {
  const result = await notionPost(
    `/databases/${creds.notionDatabaseId}/query`,
    creds,
    { filter: { property: 'ID', unique_id: { equals: no } } }
  ) as { results: Array<{ id: string }> }

  const pageId = result.results[0]?.id
  if (!pageId) throw new Error(`No task found with No. = ${no}`)
  return pageId
}

// ---------------------------------------------------------------------------
// Resolve email → Notion user ID
// ---------------------------------------------------------------------------
export async function resolveNotionUserId(
  emailOrId: string,
  creds: Credentials
): Promise<string> {
  // Pass UUIDs through unchanged
  if (/^[0-9a-f-]{32,36}$/i.test(emailOrId)) return emailOrId

  const users = await notionGet('/users', creds) as {
    results: Array<{ id: string; type: string; person?: { email: string } }>
  }

  const lower = emailOrId.toLowerCase()
  const user  = users.results.find(
    (u) => u.type === 'person' && u.person?.email?.toLowerCase() === lower
  )

  if (!user) {
    const valid = users.results
      .filter((u) => u.type === 'person')
      .map((u) => u.person?.email)
      .join(', ')
    throw new Error(`Unknown email '${emailOrId}'. Valid emails: ${valid}`)
  }

  return user.id
}
