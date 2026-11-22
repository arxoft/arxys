import { Hono } from 'hono'
import { githubGet, githubPost, githubGraphQL, resolveRepo } from './github/client'
import { findIssueField, coerceIssueFieldValue, setIssueFieldValue, getIssueFieldValues } from './github/issue-fields'
import { trySetProjectDate } from './github/project'
import { notionGet, notionPost, notionPatch, resolveNotionUserId } from './notion/client'
import { slackNotifyTaskStatus, slackNotifyTaskAssigned } from './slack/notify'
import type { AppEnv, Credentials } from './types'

export const taskRoutes = new Hono<AppEnv>()

// =============================================================================
// /v1/task — unified task abstraction
//
// Dispatches to GHP or Notion based on workspace.board_type.
// Callers never need to know which backend is in use.
//
// Routes:
//   GET    /v1/task/list              list tasks
//   GET    /v1/task/:ref              get task + comments
//   POST   /v1/task                  create task
//   PATCH  /v1/task/:ref             update a field
//   PATCH  /v1/task/:ref/assign      assign users
//   PATCH  /v1/task/:ref/unassign    remove assignees
//   POST   /v1/task/:ref/comment     add comment
//
// :ref — issue number (integer) for GHP, Notion unique_id No. for Notion.
//
// GHP requires a github_project_id on the workspace. Issue create adds to
// the workspace repo but does NOT auto-add to the project; callers should
// POST /v1/github/project/:id/issues to link.
// =============================================================================

// ---------------------------------------------------------------------------
// Helpers — board type guard
// ---------------------------------------------------------------------------
function boardType(ws: { github_project_id: string | null; notion_database_id: string | null }): 'github' | 'notion' | null {
  if (ws.github_project_id) return 'github'
  if (ws.notion_database_id) return 'notion'
  return null
}

function requireBoard(c: import('hono').Context<AppEnv>): 'github' | 'notion' {
  const ws = c.get('workspace')
  const bt = boardType(ws)
  if (!bt) throw Object.assign(new Error('Workspace has no task board configured (set github_project_id or notion_database_id)'), { status: 400 })
  return bt
}

// ---------------------------------------------------------------------------
// GHP helpers
// ---------------------------------------------------------------------------

// Thrown when an issue number matches tasks in more than one repo on the board.
export class AmbiguousTaskRefError extends Error {
  status = 409
}

// Resolve a task ref (GitHub issue number) to its project item.
// Issue numbers are only unique per repo, so this scans the whole board and
// refuses to guess: if several repos have that number, it throws a 409 listing
// them unless `repo` (owner/repo) is given to disambiguate.
async function ghpResolveItemByIssueNumber(
  issueNumber: number,
  projectId: string,
  creds: Credentials,
  repo?: string
): Promise<{ itemId: string; title: string; url: string } | null> {
  type PageResult = {
    node: {
      items: {
        nodes: Array<{
          id: string
          content: { __typename: string; number: number; title: string; url: string } | null
        }>
        pageInfo: { hasNextPage: boolean; endCursor: string }
      }
    }
  }
  const matches: Array<{ itemId: string; title: string; url: string; repo: string }> = []
  let cursor: string | null = null
  do {
    const data: PageResult = await githubGraphQL<PageResult>(
      `query($projectId: ID!, $cursor: String) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                content {
                  __typename
                  ... on Issue { number title url }
                }
              }
            }
          }
        }
      }`,
      { projectId, cursor },
      creds
    )
    const page = data.node.items
    for (const n of page.nodes) {
      if (n.content?.__typename !== 'Issue' || n.content.number !== issueNumber) continue
      const itemRepo = n.content.url.match(/github\.com\/(.+?)\/issues\//)?.[1] ?? ''
      if (repo && itemRepo.toLowerCase() !== repo.toLowerCase()) continue
      matches.push({ itemId: n.id, title: n.content.title, url: n.content.url, repo: itemRepo })
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (cursor)

  if (matches.length > 1) {
    throw new AmbiguousTaskRefError(
      `Task #${issueNumber} is ambiguous — it exists in ${matches.map((m) => m.repo).join(', ')}. ` +
      `Pass ?repo=owner/repo to choose one.`
    )
  }
  return matches[0] ?? null
}

// ---------------------------------------------------------------------------
// Notion helpers
// ---------------------------------------------------------------------------

async function notionResolvePageId(no: number, creds: Credentials): Promise<string> {
  const result = await notionPost(
    `/databases/${creds.notionDatabaseId}/query`,
    creds,
    { filter: { property: 'ID', unique_id: { equals: no } } }
  ) as { results: Array<{ id: string }> }
  const pageId = result.results[0]?.id
  if (!pageId) throw new Error(`No record found with No. = ${no}`)
  return pageId
}

// ---------------------------------------------------------------------------
// GET /v1/task/list
// ?mine=1  ?icebox=1  ?status=X  ?label=X (GHP only)
// ---------------------------------------------------------------------------
taskRoutes.get('/list', async (c) => {
  const bt    = requireBoard(c)
  const creds = c.get('credentials')
  const q     = c.req.query()

  if (bt === 'github') {
    const projectId = creds.githubProjectId!
    type ProjectItem = {
      id: string
      content: { __typename: string; number: number; title: string; state: string; url: string; assignees: { nodes: Array<{ login: string }> } } | null
      fieldValues: { nodes: Array<{ __typename: string; name?: string; text?: string; number?: number; field?: { name: string } }> }
    }
    const allItems: ProjectItem[] = []
    let cursor: string | null = null
    type PageResult = { node: { items: { nodes: ProjectItem[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } }
    do {
      const data: PageResult = await githubGraphQL<PageResult>(
        `query($projectId: ID!, $cursor: String) {
          node(id: $projectId) {
            ... on ProjectV2 {
              items(first: 100, after: $cursor) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  id
                  content {
                    __typename
                    ... on Issue { number title state url assignees(first: 10) { nodes { login } } }
                  }
                  fieldValues(first: 20) {
                    nodes {
                      __typename
                      ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
                      ... on ProjectV2ItemFieldTextValue         { text field { ... on ProjectV2Field { name } } }
                      ... on ProjectV2ItemFieldNumberValue       { number field { ... on ProjectV2Field { name } } }
                    }
                  }
                }
              }
            }
          }
        }`,
        { projectId, cursor }, creds)
      const page = data.node.items
      allItems.push(...page.nodes.filter((n) => n.content?.__typename === 'Issue'))
      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
    } while (cursor)

    let issues = allItems.map((item) => {
      const fvs      = item.fieldValues.nodes
      const statusFv = fvs.find((fv) => fv.__typename === 'ProjectV2ItemFieldSingleSelectValue' && fv.field?.name === 'Status')
      const fields: Record<string, string> = {}
      for (const fv of fvs) {
        if (!fv.field?.name) continue
        if (fv.__typename === 'ProjectV2ItemFieldSingleSelectValue' && fv.name)             fields[fv.field.name] = fv.name
        if (fv.__typename === 'ProjectV2ItemFieldTextValue'         && fv.text !== undefined) fields[fv.field.name] = String(fv.text)
        if (fv.__typename === 'ProjectV2ItemFieldNumberValue'       && fv.number !== undefined) fields[fv.field.name] = String(fv.number)
      }
      return {
        ref:       item.content!.number,
        item_id:   item.id,
        title:     item.content!.title,
        state:     item.content!.state,
        url:       item.content!.url,
        assignees: item.content!.assignees.nodes.map((a) => a.login),
        status:    statusFv?.name ?? null,
        fields,
        backend:   'github',
      }
    })

    if (!q.icebox && !q.status) issues = issues.filter((i) => i.status !== 'Icebox')
    if (q.status)  issues = issues.filter((i) => i.status === q.status)
    if (q.mine === '1') {
      const me = creds.githubLogin ?? (await githubGet('/user', creds) as { login: string }).login
      issues = issues.filter((i) => i.assignees.includes(me))
    }

    return c.json({ tasks: issues })
  }

  // Notion path
  const body: Record<string, unknown> = {
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
  }
  if (q.mine === '1') {
    if (!creds.notionUserEmail) return c.json({ error: 'mine requires email set on your venture membership' }, 400)
    const uid = await resolveNotionUserId(creds.notionUserEmail, creds)
    body.filter = { property: 'Assignee', people: { contains: uid } }
  }
  const result = await notionPost(`/databases/${creds.notionDatabaseId}/query`, creds, body) as { results: unknown[] }
  if (!q.icebox) {
    result.results = (result.results as Array<Record<string, unknown>>).filter((r) => {
      const props = (r as Record<string, unknown>).properties as Record<string, Record<string, unknown>>
      const statusEntry = Object.values(props).find((p) => p.type === 'status')
      if (!statusEntry) return true
      const name = (statusEntry.status as Record<string, unknown> | undefined)?.name
      return name !== 'Icebox'
    })
  }
  return c.json({ tasks: result.results, backend: 'notion' })
})

// ---------------------------------------------------------------------------
// GET /v1/task/:ref
// ---------------------------------------------------------------------------
taskRoutes.get('/:ref', async (c) => {
  const bt    = requireBoard(c)
  const creds = c.get('credentials')
  const ref   = parseInt(c.req.param('ref'), 10)

  if (bt === 'github') {
    // Resolve the issue's actual repo via the project — handles cross-repo projects
    const projectId = creds.githubProjectId!
    const item = await ghpResolveItemByIssueNumber(ref, projectId, creds, c.req.query('repo'))
    if (!item) return c.json({ error: `Issue #${ref} not found in project` }, 404)

    // Extract repo from the issue URL: https://github.com/owner/repo/issues/N
    const repoMatch = item.url.match(/github\.com\/(.+?)\/issues\//)
    const repo = repoMatch ? repoMatch[1] : resolveRepo(undefined, c.get('workspace').github_repo)

    const [issue, comments, issue_fields] = await Promise.all([
      githubGet(`/repos/${repo}/issues/${ref}`, creds),
      githubGet(`/repos/${repo}/issues/${ref}/comments`, creds),
      getIssueFieldValues(repo, ref, creds),
    ])
    return c.json({ task: issue, comments, issue_fields, backend: 'github' })
  }

  const pageId = await notionResolvePageId(ref, creds)
  const [page, comments] = await Promise.all([
    notionGet(`/pages/${pageId}`, creds),
    notionGet(`/comments?block_id=${pageId}`, creds),
  ])
  return c.json({ task: page, comments, backend: 'notion' })
})

// ---------------------------------------------------------------------------
// POST /v1/task
// Body: { title: string, body_text?: string (GHP), assignee?: string (GHP login) }
// GHP: the issue is also added to the workspace's project board (response: in_project)
// ---------------------------------------------------------------------------
taskRoutes.post('/', async (c) => {
  const bt    = requireBoard(c)
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const body  = await c.req.json<{ title: string; body_text?: string; assignee?: string }>()
  if (!body.title) return c.json({ error: 'title is required' }, 400)

  if (bt === 'github') {
    const repo    = resolveRepo(undefined, ws.github_repo)
    const payload: Record<string, unknown> = { title: body.title }
    if (body.body_text) payload.body      = body.body_text
    if (body.assignee)  payload.assignees = [body.assignee]
    const result = await githubPost(`/repos/${repo}/issues`, creds, payload) as
      { number: number; html_url: string; node_id: string }

    // A task is an issue on the project board — add it there. If this fails the
    // issue still exists, so report it loudly instead of failing the request.
    let inProject = false
    let warning: string | undefined
    if (!creds.githubProjectId) {
      warning = 'Workspace has no github_project_id — issue created but not added to a project'
    } else {
      try {
        await githubGraphQL(
          `mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } }
          }`,
          { projectId: creds.githubProjectId, contentId: result.node_id }, creds)
        inProject = true
      } catch (e) {
        warning = `Issue created but could not be added to the project: ${(e as Error).message}`
      }
    }
    return c.json({ ref: result.number, url: result.html_url, backend: 'github', in_project: inProject, ...(warning ? { warning } : {}) }, 201)
  }

  const result = await notionPost('/pages', creds, {
    parent:     { database_id: creds.notionDatabaseId },
    properties: { 'Title': { title: [{ type: 'text', text: { content: body.title } }] } },
  }) as { id: string; url: string }
  return c.json({ id: result.id, url: result.url, backend: 'notion' }, 201)
})

// ---------------------------------------------------------------------------
// PATCH /v1/task/:ref
// Body: { field: string, value: string }
// GHP:    field is an org issue field (e.g. "Priority", "Effort") or a project field (e.g. "Status")
// Notion: field is the property name
// ---------------------------------------------------------------------------
taskRoutes.patch('/:ref', async (c) => {
  const bt    = requireBoard(c)
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const ref   = parseInt(c.req.param('ref'), 10)
  const body  = await c.req.json<{ field: string; value: string }>()
  if (!body.field || body.value === undefined) return c.json({ error: 'field and value are required' }, 400)

  if (bt === 'github') {
    const projectId = creds.githubProjectId!
    const item = await ghpResolveItemByIssueNumber(ref, projectId, creds, c.req.query('repo'))
    if (!item) return c.json({ error: `Issue #${ref} not found in project` }, 404)

    // Org-level issue fields (Priority, Effort, ...) live on the issue, not the
    // project — try them first. The issue's own repo owner defines the fields.
    const repoMatch = item.url.match(/github\.com\/(.+?)\/issues\//)
    const issueRepo = repoMatch ? repoMatch[1] : resolveRepo(undefined, ws.github_repo)
    const issueField = await findIssueField(issueRepo.split('/')[0], body.field, creds)
    if (issueField) {
      let value: string | number | string[]
      try { value = coerceIssueFieldValue(issueField, String(body.value)) }
      catch (e) { return c.json({ error: (e as Error).message }, 400) }
      await setIssueFieldValue(issueRepo, ref, issueField, value, creds)
      return c.json({ ok: true, ref, field: issueField.name, value: body.value, backend: 'github', source: 'issue-field' })
    }

    // Fetch all fields to find the right one by name
    const fieldData = await githubGraphQL<{
      node: { fields: { nodes: Array<{ __typename: string; id: string; name: string; options?: Array<{ id: string; name: string }> }> } }
    }>(
      `query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 50) {
              nodes {
                __typename
                ... on ProjectV2SingleSelectField { id name options { id name } }
                ... on ProjectV2Field             { id name }
                ... on ProjectV2IterationField    { id name }
              }
            }
          }
        }
      }`,
      { projectId }, creds)

    const matched = fieldData.node.fields.nodes.find(
      (f) => f.name.toLowerCase() === body.field.toLowerCase()
    )
    if (!matched) return c.json({ error: `Field '${body.field}' not found on project` }, 404)

    const isSingleSelect = matched.__typename === 'ProjectV2SingleSelectField'
    const isStatus       = matched.name === 'Status'

    if (!isSingleSelect && await trySetProjectDate(projectId, item.itemId, matched.id, body.value, creds)) {
      return c.json({ ok: true, ref, field: matched.name, value: body.value, backend: 'github' })
    }

    if (isSingleSelect) {
      const option = matched.options?.find((o) => o.name.toLowerCase() === body.value.toLowerCase())
      if (!option) {
        const valid = (matched.options ?? []).map((o) => o.name).join(', ')
        return c.json({ error: `Unknown value '${body.value}'. Valid: ${valid}` }, 400)
      }

      if (isStatus) {
        // Audit comment + Slack (same as direct project route)
        const member = c.get('member')
        const oldStatusData = await githubGraphQL<{
          node: { fieldValues: { nodes: Array<{ __typename: string; name?: string; field?: { name: string } }> } }
        }>(
          `query($itemId: ID!) {
            node(id: $itemId) {
              ... on ProjectV2Item {
                fieldValues(first: 20) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
                  }
                }
              }
            }
          }`,
          { itemId: item.itemId }, creds)
        const oldStatus = oldStatusData.node.fieldValues.nodes.find(
          (fv) => fv.__typename === 'ProjectV2ItemFieldSingleSelectValue' && fv.field?.name === 'Status'
        )?.name ?? null

        await githubGraphQL(
          `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
            updateProjectV2ItemFieldValue(input: {
              projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
              value: { singleSelectOptionId: $optionId }
            }) { projectV2Item { id } }
          }`,
          { projectId, itemId: item.itemId, fieldId: matched.id, optionId: option.id }, creds)

        const repo = resolveRepo(undefined, ws.github_repo)
        await githubPost(`/repos/${repo}/issues/${ref}/comments`, creds, {
          body: `(${member.id}) Status: ${oldStatus ?? '?'} → ${body.value}`
        }).catch(() => {/* non-fatal */})
        await slackNotifyTaskStatus(ref, item.title, oldStatus ?? '?', body.value, item.url, creds)
      } else {
        await githubGraphQL(
          `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
            updateProjectV2ItemFieldValue(input: {
              projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
              value: { singleSelectOptionId: $optionId }
            }) { projectV2Item { id } }
          }`,
          { projectId, itemId: item.itemId, fieldId: matched.id, optionId: option.id }, creds)
      }
    } else {
      const numVal   = parseFloat(body.value)
      const isNumeric = !isNaN(numVal) && String(numVal) === body.value.trim()
      if (isNumeric) {
        try {
          await githubGraphQL(
            `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $num: Float!) {
              updateProjectV2ItemFieldValue(input: {
                projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
                value: { number: $num }
              }) { projectV2Item { id } }
            }`,
            { projectId, itemId: item.itemId, fieldId: matched.id, num: numVal }, creds)
        } catch {
          await githubGraphQL(
            `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $text: String!) {
              updateProjectV2ItemFieldValue(input: {
                projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
                value: { text: $text }
              }) { projectV2Item { id } }
            }`,
            { projectId, itemId: item.itemId, fieldId: matched.id, text: body.value }, creds)
        }
      } else {
        await githubGraphQL(
          `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $text: String!) {
            updateProjectV2ItemFieldValue(input: {
              projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
              value: { text: $text }
            }) { projectV2Item { id } }
          }`,
          { projectId, itemId: item.itemId, fieldId: matched.id, text: body.value }, creds)
      }
    }

    return c.json({ ok: true, ref, field: matched.name, value: body.value, backend: 'github' })
  }

  // Notion path
  const pageId = await notionResolvePageId(ref, creds)
  const page   = await notionGet(`/pages/${pageId}`, creds) as {
    url: string
    properties: Record<string, { type: string; status?: { name: string }; select?: { name: string }; title?: Array<{ plain_text: string }> }>
  }

  const realProp = Object.keys(page.properties).find(
    (k) => k.toLowerCase() === body.field.toLowerCase()
  )
  if (!realProp) return c.json({ error: `Property '${body.field}' not found` }, 404)

  const propType = page.properties[realProp].type

  if ((propType === 'status' || propType === 'select') && realProp.toLowerCase() === 'status') {
    const oldStatus = propType === 'status'
      ? page.properties[realProp].status?.name
      : page.properties[realProp].select?.name

    const titleProp = Object.values(page.properties).find((p) => p.type === 'title') as
      { title: Array<{ plain_text: string }> } | undefined
    const title = titleProp?.title.map((t) => t.plain_text).join('') ?? ''

    await notionPost('/comments', creds, {
      parent: { page_id: pageId },
      rich_text: [{ type: 'text', text: { content: `(${creds.notionUser}) Status: ${oldStatus ?? '?'} → ${body.value}` }}]
    })
    await slackNotifyTaskStatus(ref, title, oldStatus ?? '?', body.value, page.url, creds)
  }

  await notionPatch(`/pages/${pageId}`, creds, {
    properties: { [realProp]: buildNotionPropBody(propType, body.value) }
  })
  return c.json({ ok: true, ref, field: realProp, value: body.value, backend: 'notion' })
})

// ---------------------------------------------------------------------------
// PATCH /v1/task/:ref/assign
// GHP:    Body: { assignees: string[] }  (GitHub logins)
// Notion: Body: { assignees: string[] }  (emails)
// ---------------------------------------------------------------------------
taskRoutes.patch('/:ref/assign', async (c) => {
  const bt    = requireBoard(c)
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const ref   = parseInt(c.req.param('ref'), 10)
  const body  = await c.req.json<{ assignees: string[] }>()
  if (!body.assignees?.length) return c.json({ error: 'assignees array is required' }, 400)

  if (bt === 'github') {
    const projectId = creds.githubProjectId!
    const item = await ghpResolveItemByIssueNumber(ref, projectId, creds, c.req.query('repo'))
    if (!item) return c.json({ error: `Issue #${ref} not found in project` }, 404)
    const repoMatch = item.url.match(/github\.com\/(.+?)\/issues\//)
    const repo = repoMatch ? repoMatch[1] : resolveRepo(undefined, ws.github_repo)
    // Merge with existing assignees
    const issue = await githubGet(`/repos/${repo}/issues/${ref}`, creds) as
      { title: string; html_url: string; assignees: Array<{ login: string }> }
    const existing = issue.assignees.map((a) => a.login)
    await githubPost(`/repos/${repo}/issues/${ref}/assignees`, creds, { assignees: body.assignees })
    for (const login of body.assignees) {
      if (!existing.includes(login)) {
        await slackNotifyTaskAssigned(ref, issue.title, login, login, issue.html_url, creds)
      }
    }
    return c.json({ ok: true, ref, assigned: body.assignees, backend: 'github' })
  }

  const pageId     = await notionResolvePageId(ref, creds)
  const page       = await notionGet(`/pages/${pageId}`, creds) as {
    url: string
    properties: Record<string, { type: string; title?: Array<{ plain_text: string }> }>
  }
  const peopleIds  = await Promise.all(body.assignees.map((e) => resolveNotionUserId(e, creds)))
  const peopleProp = Object.keys(page.properties).find((k) => page.properties[k].type === 'people')
  if (!peopleProp) return c.json({ error: 'No people property found' }, 404)

  await notionPatch(`/pages/${pageId}`, creds, {
    properties: { [peopleProp]: { people: peopleIds.map((id) => ({ object: 'user', id })) } }
  })
  const titleProp = Object.values(page.properties).find((p) => p.type === 'title') as
    { title: Array<{ plain_text: string }> } | undefined
  const title = titleProp?.title.map((t) => t.plain_text).join('') ?? ''
  await Promise.all(body.assignees.map((email) =>
    slackNotifyTaskAssigned(ref, title, email, email, page.url, creds)
  ))
  return c.json({ ok: true, ref, assigned: body.assignees, backend: 'notion' })
})

// ---------------------------------------------------------------------------
// PATCH /v1/task/:ref/unassign
// GHP:    Body: { assignees: string[] }  (GitHub logins)
// Notion: Body: { assignees: string[] }  (emails)
// ---------------------------------------------------------------------------
taskRoutes.patch('/:ref/unassign', async (c) => {
  const bt    = requireBoard(c)
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const ref   = parseInt(c.req.param('ref'), 10)
  const body  = await c.req.json<{ assignees: string[] }>()
  if (!body.assignees?.length) return c.json({ error: 'assignees array is required' }, 400)

  if (bt === 'github') {
    const projectId = creds.githubProjectId!
    const item = await ghpResolveItemByIssueNumber(ref, projectId, creds, c.req.query('repo'))
    if (!item) return c.json({ error: `Issue #${ref} not found in project` }, 404)
    const repoMatch = item.url.match(/github\.com\/(.+?)\/issues\//)
    const repo = repoMatch ? repoMatch[1] : resolveRepo(undefined, ws.github_repo)
    await fetch(`https://api.github.com/repos/${repo}/issues/${ref}/assignees`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${creds.githubToken}`,
        'Accept':        'application/vnd.github+json',
        'Content-Type':  'application/json',
        'User-Agent':    'arxys-api/1.0',
      },
      body: JSON.stringify({ assignees: body.assignees }),
    })
    return c.json({ ok: true, ref, unassigned: body.assignees, backend: 'github' })
  }

  const pageId     = await notionResolvePageId(ref, creds)
  const page       = await notionGet(`/pages/${pageId}`, creds) as {
    properties: Record<string, { type: string; people?: Array<{ id: string }> }>
  }
  const peopleProp = Object.keys(page.properties).find((k) => page.properties[k].type === 'people')
  if (!peopleProp) return c.json({ error: 'No people property found' }, 404)

  const removeIds = await Promise.all(body.assignees.map((e) => resolveNotionUserId(e, creds)))
  const removeSet = new Set(removeIds)
  const remaining = (page.properties[peopleProp].people ?? [])
    .filter((p) => !removeSet.has(p.id))
    .map((p) => ({ object: 'user', id: p.id }))

  await notionPatch(`/pages/${pageId}`, creds, {
    properties: { [peopleProp]: { people: remaining } }
  })
  return c.json({ ok: true, ref, unassigned: body.assignees, backend: 'notion' })
})

// ---------------------------------------------------------------------------
// POST /v1/task/:ref/comment
// Body: { text: string }
// ---------------------------------------------------------------------------
taskRoutes.post('/:ref/comment', async (c) => {
  const bt     = requireBoard(c)
  const creds  = c.get('credentials')
  const ws     = c.get('workspace')
  const member = c.get('member')
  const ref    = parseInt(c.req.param('ref'), 10)
  const body   = await c.req.json<{ text: string }>()
  if (!body.text) return c.json({ error: 'text is required' }, 400)

  if (bt === 'github') {
    const projectId = creds.githubProjectId!
    const item = await ghpResolveItemByIssueNumber(ref, projectId, creds, c.req.query('repo'))
    if (!item) return c.json({ error: `Issue #${ref} not found in project` }, 404)
    const repoMatch = item.url.match(/github\.com\/(.+?)\/issues\//)
    const repo = repoMatch ? repoMatch[1] : resolveRepo(undefined, ws.github_repo)
    const text   = `(${member.id}) ${body.text}`
    const result = await githubPost(`/repos/${repo}/issues/${ref}/comments`, creds, { body: text }) as
      { id: number; html_url: string }
    return c.json({ ok: true, id: result.id, url: result.html_url, backend: 'github' }, 201)
  }

  const pageId = await notionResolvePageId(ref, creds)
  const text   = `(${creds.notionUser}) ${body.text}`
  const result = await notionPost('/comments', creds, {
    parent:    { page_id: pageId },
    rich_text: [{ type: 'text', text: { content: text } }],
  }) as { id: string }
  return c.json({ ok: true, id: result.id, backend: 'notion' }, 201)
})

// ---------------------------------------------------------------------------
// Notion property body builder (kept local — only needed for Notion fallback)
// ---------------------------------------------------------------------------
function buildNotionPropBody(type: string, value: string): Record<string, unknown> {
  switch (type) {
    case 'title':        return { title:        [{ type: 'text', text: { content: value } }] }
    case 'rich_text':    return { rich_text:     [{ type: 'text', text: { content: value } }] }
    case 'select':       return { select:        { name: value } }
    case 'status':       return { status:        { name: value } }
    case 'multi_select': return { multi_select:  value.split(',').map((v) => ({ name: v.trim() })) }
    case 'number':       return { number:        parseFloat(value) }
    case 'checkbox':     return { checkbox:      ['true', '1', 'yes'].includes(value.toLowerCase()) }
    case 'url':          return { url:           value }
    case 'email':        return { email:         value }
    case 'phone_number': return { phone_number:  value }
    case 'date':         return { date:          { start: value } }
    default:             throw new Error(`Unsupported property type: ${type}`)
  }
}
