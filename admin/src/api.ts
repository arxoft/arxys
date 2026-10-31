// =============================================================================
// api.ts — typed client for arxys API
// =============================================================================

const BASE = 'https://arxys.arxoft.com'
const API  = `${BASE}/v1`

function token() { return localStorage.getItem('arxys_token') ?? '' }

async function req<T>(
  method: string, path: string, body?: unknown, isAdmin = false
): Promise<T> {
  const base = isAdmin ? BASE : API
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type':    'application/json',
      'X-Session-Token': token(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data as T
}

const get  = <T>(path: string, admin = false)               => req<T>('GET',    path, undefined, admin)
const post = <T>(path: string, body: unknown, admin = false) => req<T>('POST',   path, body, admin)
const del  = <T>(path: string, admin = false)               => req<T>('DELETE', path, undefined, admin)

// Auth
export const api = {
  auth: {
    requestOtp:  (email: string)               => post('/auth/otp/request', { email }, true),
    verifyOtp:   (email: string, code: string) => post<{
      ok: boolean; token: string; member_id: string
      display_name: string; expires_at: string
    }>('/auth/otp/verify', { email, code }, true),
    me:          ()                            => get<{ ok: boolean; member_id: string; display_name: string }>('/auth/me', true),
    logout:      ()                            => post('/auth/logout', { token: token() }, true),
  },

  ventures: {
    list:   () => get<Venture[]>('/admin/ventures', true),
    create: (b: Omit<Venture, 'created_at'>) => post<{ ok: boolean; id: string }>('/admin/ventures', b, true),
  },

  workspaces: {
    list:   () => get<Workspace[]>('/admin/workspaces', true),
    create: (b: Omit<Workspace, 'created_at'>) => post<{ ok: boolean; id: string }>('/admin/workspaces', b, true),
  },

  members: {
    list:   () => get<Member[]>('/admin/members', true),
    create: (b: { id: string; display_name: string }) =>
      post<{ ok: boolean; id: string; api_key: string }>('/admin/members', b, true),
  },

  ventureMembers: {
    add: (venture_id: string, b: {
      member_id: string; github_pat: string
      venture_role?: string; notion_user?: string; email?: string
    }) => post(`/admin/ventures/${venture_id}/members`, b, true),
  },

  workspaceMembers: {
    add:    (workspace_id: string, b: { member_id: string; workspace_role?: string }) =>
      post(`/admin/workspaces/${workspace_id}/members`, b, true),
    remove: (workspace_id: string, member_id: string) =>
      del(`/admin/workspaces/${workspace_id}/members/${member_id}`, true),
  },
}

// Types
export interface Venture {
  id: string; display_name: string; github_org: string
  slack_bot_token?: string; slack_channel_id?: string; created_at?: string
}
export interface Workspace {
  id: string; venture_id: string; display_name: string
  github_repo: string; notion_api_key: string
  notion_database_id: string; slack_channel_id?: string; created_at?: string
}
export interface Member {
  id: string; display_name: string; created_at?: string
}
