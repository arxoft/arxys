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

const get  = <T>(path: string, admin = false)                => req<T>('GET',    path, undefined, admin)
const post = <T>(path: string, body: unknown, admin = false) => req<T>('POST',   path, body,      admin)
const patch = <T>(path: string, body: unknown, admin = false) => req<T>('PATCH', path, body,      admin)
const del  = <T>(path: string, admin = false)                => req<T>('DELETE', path, undefined, admin)

export const api = {
  auth: {
    requestOtp: (email: string) =>
      post('/auth/otp/request', { email }, true),
    verifyOtp: (email: string, code: string) =>
      post<{ ok: boolean; token: string; member_id: string; display_name: string; expires_at: string }>(
        '/auth/otp/verify', { email, code }, true),
    me:     () => get<{ ok: boolean; member_id: string; display_name: string }>('/auth/me', true),
    logout: () => post('/auth/logout', { token: token() }, true),
  },

  ventures: {
    list:   () => get<Venture[]>('/admin/ventures', true),
    create: (b: Omit<Venture, 'created_at'>) =>
      post<{ ok: boolean; id: string }>('/admin/ventures', b, true),
    update: (id: string, b: { display_name?: string; slack_bot_token?: string; slack_channel_id?: string }) =>
      patch<{ ok: boolean }>(`/admin/ventures/${id}`, b, true),
    slackTest: (id: string) =>
      post<{ ok: boolean }>(`/admin/ventures/${id}/slack-test`, {}, true),
  },

  workspaces: {
    list:   () => get<Workspace[]>('/admin/workspaces', true),
    create: (b: Omit<Workspace, 'created_at'>) =>
      post<{ ok: boolean; id: string }>('/admin/workspaces', b, true),
    notionTest: (workspace_id: string) =>
      post<{ ok: boolean; database_title: string }>(`/admin/workspaces/${workspace_id}/notion-test`, {}, true),
  },

  members: {
    list:   () => get<Member[]>('/admin/members', true),
    create: (b: { id: string; display_name: string }) =>
      post<{ ok: boolean; id: string; api_key: string }>('/admin/members', b, true),
    update: (member_id: string, b: { id?: string; display_name?: string }) =>
      patch<{ ok: boolean; id: string }>(`/admin/members/${member_id}`, b, true),
    delete: (member_id: string) =>
      del(`/admin/members/${member_id}`, true),
    regenerateKey: (member_id: string) =>
      post<{ ok: boolean; member_id: string; api_key: string }>(
        `/admin/members/${member_id}/regenerate-key`, {}, true),
  },

  ventureMembers: {
    list:   (venture_id: string) =>
      get<VentureMember[]>(`/admin/ventures/${venture_id}/members`, true),
    add:    (venture_id: string, b: {
      member_id: string; github_pat: string
      venture_role?: string; notion_user?: string; email?: string
    }) => post(`/admin/ventures/${venture_id}/members`, b, true),
    update: (venture_id: string, member_id: string, b: {
      github_pat?: string; venture_role?: string; notion_user?: string; email?: string
    }) => patch<{ ok: boolean }>(`/admin/ventures/${venture_id}/members/${member_id}`, b, true),
    remove: (venture_id: string, member_id: string) =>
      del(`/admin/ventures/${venture_id}/members/${member_id}`, true),
  },

  workspaceMembers: {
    list:   (workspace_id: string) =>
      get<WorkspaceMember[]>(`/admin/workspaces/${workspace_id}/members`, true),
    add:    (workspace_id: string, b: { member_id: string; workspace_role?: string }) =>
      post(`/admin/workspaces/${workspace_id}/members`, b, true),
    update: (workspace_id: string, member_id: string, b: { workspace_role: string }) =>
      patch<{ ok: boolean }>(`/admin/workspaces/${workspace_id}/members/${member_id}`, b, true),
    remove: (workspace_id: string, member_id: string) =>
      del(`/admin/workspaces/${workspace_id}/members/${member_id}`, true),
  },
}

// Types
export interface Venture {
  id: string; display_name: string
  has_slack_token?: number; slack_channel_id?: string; created_at?: string
}
export interface Workspace {
  id: string; venture_id: string; display_name: string
  github_repo: string; notion_api_key: string
  notion_database_id: string; slack_channel_id?: string; created_at?: string
}
export interface Member {
  id: string; display_name: string; created_at?: string
}
export interface VentureMember {
  member_id: string; display_name: string; venture_role: string
  notion_user: string | null; email: string | null
}
export interface WorkspaceMember {
  member_id: string; display_name: string; workspace_role: string
}
