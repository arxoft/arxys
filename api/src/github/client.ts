import { GITHUB_BASE, GITHUB_GRAPHQL } from '../types'
import type { Credentials } from '../types'

// ---------------------------------------------------------------------------
// Thin GitHub REST API client — mirrors lib/github/common.sh
// ---------------------------------------------------------------------------

async function githubRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  creds: Credentials,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${GITHUB_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${creds.githubToken}`,
      'Accept':        'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':  'application/json',
      'User-Agent':    'arxys-api/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  // 204 No Content — return empty object
  if (res.status === 204) return {}

  const data = await res.json() as Record<string, unknown>

  if (res.status >= 400) {
    const msg = (data.message as string) ?? `GitHub API error ${res.status}`
    throw new Error(msg)
  }

  return data
}

export const githubGet    = (path: string, creds: Credentials) =>
  githubRequest('GET',    path, creds)

export const githubPost   = (path: string, creds: Credentials, body: unknown) =>
  githubRequest('POST',   path, creds, body)

export const githubPatch  = (path: string, creds: Credentials, body: unknown) =>
  githubRequest('PATCH',  path, creds, body)

export const githubPut    = (path: string, creds: Credentials, body: unknown) =>
  githubRequest('PUT',    path, creds, body)

export const githubDelete = (path: string, creds: Credentials) =>
  githubRequest('DELETE', path, creds)

// ---------------------------------------------------------------------------
// GitHub GraphQL API client — used for Projects v2 (no REST equivalent)
// ---------------------------------------------------------------------------

export async function githubGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  creds: Credentials
): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${creds.githubToken}`,
      'Content-Type':  'application/json',
      'User-Agent':    'arxys-api/1.0',
    },
    body: JSON.stringify({ query, variables }),
  })

  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> }

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }

  if (!json.data) throw new Error('GitHub GraphQL returned no data')

  return json.data
}

// ---------------------------------------------------------------------------
// Repo resolution helper
//
// Resolves the effective repo for a request and validates it is within
// the workspace's allowed set.
//
// Rules:
//   - If ?repo= is omitted, defaults to workspace.github_repo
//   - Any explicit ?repo= must equal workspace.github_repo
//     (workspace_repos table was removed in migration 0013)
//   - Returns the validated repo string or throws a 403-worthy Error
// ---------------------------------------------------------------------------
export function resolveRepo(
  requested: string | undefined,
  workspaceRepo: string
): string {
  const repo = requested ?? workspaceRepo
  if (repo !== workspaceRepo) {
    throw Object.assign(
      new Error(`Repo '${repo}' is not associated with this workspace. Expected: ${workspaceRepo}`),
      { status: 403 }
    )
  }
  return repo
}
