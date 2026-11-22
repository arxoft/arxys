import { githubGet, githubPost } from './client'
import type { Credentials } from '../types'

// ---------------------------------------------------------------------------
// Org-level issue fields (Priority, Effort, Deploy Flags, ...)
//
// These are NOT Projects v2 fields — they live on the issue itself and are
// defined once per repository owner. Read via GET /orgs/{owner}/issue-fields,
// write via POST /repos/{owner}/{repo}/issues/{n}/issue-field-values.
//
// POST is additive per field. Never use PUT here: it replaces ALL of an
// issue's field values.
// ---------------------------------------------------------------------------

const API_VERSION = '2026-03-10'

export type IssueField = {
  id: number
  name: string
  data_type: 'text' | 'single_select' | 'number' | 'date' | 'multi_select'
  options?: Array<{ id: number; name: string }>
}

// Per-isolate cache — field definitions change rarely.
const cache = new Map<string, { fields: IssueField[]; expiresAt: number }>()

export async function listIssueFields(owner: string, creds: Credentials): Promise<IssueField[]> {
  const hit = cache.get(owner)
  if (hit && Date.now() < hit.expiresAt) return hit.fields
  let fields: IssueField[] = []
  try {
    fields = await githubGet(`/orgs/${owner}/issue-fields`, creds, API_VERSION) as IssueField[]
  } catch (e) {
    // 404 = personal account / issue fields not enabled → no issue fields.
    // Anything else (permissions, API version) must surface, not hide.
    if ((e as Error).message !== 'Not Found') {
      throw new Error(`Could not read issue fields for '${owner}': ${(e as Error).message}`)
    }
  }
  cache.set(owner, { fields, expiresAt: Date.now() + 5 * 60 * 1000 })
  return fields
}

export async function findIssueField(
  owner: string, name: string, creds: Credentials
): Promise<IssueField | undefined> {
  const fields = await listIssueFields(owner, creds)
  return fields.find((f) => f.name.toLowerCase() === name.toLowerCase())
}

// Validate/coerce a string value for the field's type. Throws on bad input.
export function coerceIssueFieldValue(field: IssueField, raw: string): string | number | string[] {
  switch (field.data_type) {
    case 'number': {
      const n = Number(raw)
      if (raw.trim() === '' || Number.isNaN(n)) throw new Error(`'${raw}' is not a number (field '${field.name}')`)
      return n
    }
    case 'single_select': {
      const opt = field.options?.find((o) => o.name.toLowerCase() === raw.toLowerCase())
      if (!opt) throw new Error(`Unknown value '${raw}'. Valid: ${(field.options ?? []).map((o) => o.name).join(', ')}`)
      return opt.name
    }
    case 'multi_select': {
      const names = raw.split(',').map((v) => v.trim()).filter(Boolean)
      return names.map((n) => {
        const opt = field.options?.find((o) => o.name.toLowerCase() === n.toLowerCase())
        if (!opt) throw new Error(`Unknown value '${n}'. Valid: ${(field.options ?? []).map((o) => o.name).join(', ')}`)
        return opt.name
      })
    }
    default:
      return raw // text, date (ISO 8601)
  }
}

export async function setIssueFieldValue(
  repo: string, issueNumber: number, field: IssueField, value: string | number | string[], creds: Credentials
): Promise<void> {
  await githubPost(
    `/repos/${repo}/issues/${issueNumber}/issue-field-values`,
    creds,
    { issue_field_values: [{ field_id: field.id, value }] },
    API_VERSION
  )
}
