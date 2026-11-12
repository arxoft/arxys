import { Hono } from 'hono'
import { githubGraphQL, githubGet, githubPost } from './client'
import { slackNotifyTaskStatus, slackNotifyTaskAssigned, slackNotifyComment } from '../slack/notify'
import type { AppEnv, Credentials } from '../types'

export const githubProjectRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Standard arxys status options — mirrors Notion's status field
// ---------------------------------------------------------------------------
export const ARXYS_STATUSES = [
  'Planning',
  'Backlog',
  'Up Next',
  'In Progress',
  'Pending Review',
  'Awaiting Deployment',
  'Testing',
  'Pending Acceptance',
  'Completed',
  'Cancelled',
  'Icebox',
]

// Status → GitHub Projects color mapping (mirrors Notion semantic colors)
const STATUS_COLORS: Record<string, 'GRAY' | 'BLUE' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'PINK' | 'PURPLE'> = {
  'Planning':            'GRAY',
  'Backlog':             'GRAY',
  'Up Next':             'ORANGE',
  'In Progress':         'YELLOW',
  'Pending Review':      'BLUE',
  'Awaiting Deployment': 'PURPLE',
  'Testing':             'PINK',
  'Pending Acceptance':  'GREEN',
  'Completed':           'GREEN',
  'Cancelled':           'RED',
  'Icebox':              'GRAY',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ownerFromRepo(repo: string): string {
  return repo.split('/')[0]
}

async function getViewerNodeId(creds: Credentials): Promise<string> {
  const data = await githubGraphQL<{ viewer: { id: string } }>(
    `query { viewer { id } }`, {}, creds
  )
  return data.viewer.id
}

async function getOrgNodeId(login: string, creds: Credentials): Promise<string> {
  const data = await githubGraphQL<{ organization: { id: string } }>(
    `query($login: String!) { organization(login: $login) { id } }`,
    { login }, creds
  )
  return data.organization.id
}

// Fetch the Status field ID and its options from a project — used by bootstrap validation
export async function getStatusField(projectId: string, creds: Credentials): Promise<{
  fieldId: string
  options: Array<{ id: string; name: string }>
}> {
  const data = await githubGraphQL<{
    node: { fields: { nodes: Array<{ __typename: string; id: string; name: string; options?: Array<{ id: string; name: string }> }> } }
  }>(
    `query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              __typename
              ... on ProjectV2SingleSelectField { id name options { id name } }
            }
          }
        }
      }
    }`,
    { projectId }, creds
  )
  const field = data.node.fields.nodes.find(
    (f) => f.__typename === 'ProjectV2SingleSelectField' && f.name === 'Status'
  )
  if (!field || !field.options) throw new Error('Status field not found on project')
  return { fieldId: field.id, options: field.options }
}

// Get the current status value of a project item
async function getItemStatus(_projectId: string, itemId: string, creds: Credentials): Promise<string | null> {
  const data = await githubGraphQL<{
    node: {
      fieldValues: {
        nodes: Array<{ __typename: string; name?: string; field?: { name: string } }>
      }
    }
  }>(
    `query($itemId: ID!) {
      node(id: $itemId) {
        ... on ProjectV2Item {
          fieldValues(first: 20) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue { name field { name } }
            }
          }
        }
      }
    }`,
    { itemId }, creds
  )
  const statusField = data.node.fieldValues.nodes.find(
    (fv) => fv.__typename === 'ProjectV2ItemFieldSingleSelectValue' && fv.field?.name === 'Status'
  )
  return statusField?.name ?? null
}

// Get issue number and URL from a project item (for audit comments + Slack)
async function getItemIssueRef(itemId: string, creds: Credentials): Promise<{
  repo: string; number: number; url: string; title: string
} | null> {
  const data = await githubGraphQL<{
    node: {
      content: {
        __typename: string
        number?: number
        title?: string
        url?: string
        repository?: { nameWithOwner: string }
      } | null
    }
  }>(
    `query($itemId: ID!) {
      node(id: $itemId) {
        ... on ProjectV2Item {
          content {
            __typename
            ... on Issue { number title url repository { nameWithOwner } }
          }
        }
      }
    }`,
    { itemId }, creds
  )
  const c = data.node.content
  if (!c || c.__typename !== 'Issue' || !c.number || !c.url || !c.repository) return null
  return { repo: c.repository.nameWithOwner, number: c.number, url: c.url, title: c.title ?? '' }
}

// ---------------------------------------------------------------------------
// GET /github/project/list
// ---------------------------------------------------------------------------
githubProjectRoutes.get('/list', async (c) => {
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const owner = ownerFromRepo(ws.github_repo)

  let nodes: Array<{ id: string; number: number; title: string; url: string; closed: boolean }>

  try {
    const data = await githubGraphQL<{
      organization: { projectsV2: { nodes: typeof nodes } }
    }>(
      `query($login: String!) {
        organization(login: $login) {
          projectsV2(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes { id number title url closed }
          }
        }
      }`,
      { login: owner }, creds
    )
    nodes = data.organization.projectsV2.nodes
  } catch {
    const data = await githubGraphQL<{
      user: { projectsV2: { nodes: typeof nodes } }
    }>(
      `query($login: String!) {
        user(login: $login) {
          projectsV2(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes { id number title url closed }
          }
        }
      }`,
      { login: owner }, creds
    )
    nodes = data.user.projectsV2.nodes
  }

  return c.json({ projects: nodes })
})

// ---------------------------------------------------------------------------
// GET /github/project/members
// Lists org members with their GitHub login and email (if visible).
// Equivalent to GET /notion/user/list for GitHub workspaces.
// ---------------------------------------------------------------------------
githubProjectRoutes.get('/members', async (c) => {
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const owner = ownerFromRepo(ws.github_repo)

  try {
    const members = await githubGet(`/orgs/${owner}/members?per_page=100`, creds) as Array<{
      login: string; id: number; avatar_url: string; html_url: string
    }>
    return c.json({ members: members.map((m) => ({ login: m.login, url: m.html_url })) })
  } catch {
    // Fall back to viewer only (personal account / no org access)
    const me = await githubGet('/user', creds) as { login: string; html_url: string }
    return c.json({ members: [{ login: me.login, url: me.html_url }] })
  }
})

// ---------------------------------------------------------------------------
// POST /github/project
// Body: { title: string }
// ---------------------------------------------------------------------------
githubProjectRoutes.post('/', async (c) => {
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const body  = await c.req.json<{ title: string }>()
  if (!body.title) return c.json({ error: 'title is required' }, 400)

  const owner = ownerFromRepo(ws.github_repo)
  let ownerId: string
  let ownerType: 'org' | 'user'
  try {
    ownerId   = await getOrgNodeId(owner, creds); ownerType = 'org'
  } catch {
    ownerId   = await getViewerNodeId(creds);     ownerType = 'user'
  }

  const data = await githubGraphQL<{
    createProjectV2: { projectV2: { id: string; number: number; url: string } }
  }>(
    `mutation($ownerId: ID!, $title: String!) {
      createProjectV2(input: { ownerId: $ownerId, title: $title }) {
        projectV2 { id number url }
      }
    }`,
    { ownerId, title: body.title }, creds
  )
  const project = data.createProjectV2.projectV2
  return c.json({ id: project.id, number: project.number, url: project.url, ownerType }, 201)
})

// ---------------------------------------------------------------------------
// POST /github/project/bootstrap
// Provisions the standard arxys field schema on a project.
// If project_id is provided → provisions fields on that existing project.
// If only title is provided → creates a new project first, then provisions.
// Mirrors Notion's db bootstrap: additive, safe to re-run.
// Body: { project_id?: string, title?: string }
// ---------------------------------------------------------------------------
githubProjectRoutes.post('/bootstrap', async (c) => {
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const body  = await c.req.json<{ project_id?: string; title?: string }>().catch(() => ({} as { project_id?: string; title?: string }))

  // project_id priority: body → workspace credential → error
  const resolvedProjectId = body.project_id ?? creds.githubProjectId ?? null

  if (!resolvedProjectId && !body.title) {
    return c.json({ error: 'Provide project_id, or set github_project_id on the workspace, or provide title to create a new project' }, 400)
  }

  let projectId: string
  let projectUrl: string
  let projectNumber: number

  if (resolvedProjectId) {
    // Use existing project — fetch its details
    const data = await githubGraphQL<{
      node: { id: string; number: number; url: string; title: string }
    }>(
      `query($id: ID!) { node(id: $id) { ... on ProjectV2 { id number url title } } }`,
      { id: resolvedProjectId }, creds
    )
    if (!data.node?.id) return c.json({ error: `Project '${resolvedProjectId}' not found or not accessible` }, 404)
    projectId     = data.node.id
    projectUrl    = data.node.url
    projectNumber = data.node.number
  } else {
    // Create a new project
    const owner = ownerFromRepo(ws.github_repo)
    let ownerId: string
    try {
      ownerId = await getOrgNodeId(owner, creds)
    } catch {
      ownerId = await getViewerNodeId(creds)
    }
    const createData = await githubGraphQL<{
      createProjectV2: { projectV2: { id: string; number: number; url: string } }
    }>(
      `mutation($ownerId: ID!, $title: String!) {
        createProjectV2(input: { ownerId: $ownerId, title: $title }) {
          projectV2 { id number url }
        }
      }`,
      { ownerId, title: body.title }, creds
    )
    projectId     = createData.createProjectV2.projectV2.id
    projectUrl    = createData.createProjectV2.projectV2.url
    projectNumber = createData.createProjectV2.projectV2.number
  }

  // Fetch existing field names to avoid duplicates (safe to re-run)
  const existingData = await githubGraphQL<{
    node: { fields: { nodes: Array<{ __typename: string; name: string }> } }
  }>(
    `query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 { fields(first: 50) { nodes { __typename ... on ProjectV2Field { name } ... on ProjectV2SingleSelectField { name } ... on ProjectV2IterationField { name } } } }
      }
    }`,
    { id: projectId }, creds
  )
  const existingNames = new Set(existingData.node.fields.nodes.map((f) => f.name))

  type FieldResult = { name: string; id: string }
  const provisioned: FieldResult[] = []

  // Helper to create a single-select field
  async function addSingleSelect(name: string, options: Array<{ name: string; color: string }>) {
    if (existingNames.has(name)) return
    const data = await githubGraphQL<{
      createProjectV2Field: { projectV2Field: { id: string; name: string } }
    }>(
      `mutation($projectId: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
        createProjectV2Field(input: { projectId: $projectId, dataType: SINGLE_SELECT, name: $name, singleSelectOptions: $options }) {
          projectV2Field { ... on ProjectV2SingleSelectField { id name } }
        }
      }`,
      { projectId, name, options: options.map((o) => ({ ...o, description: '' })) },
      creds
    )
    provisioned.push(data.createProjectV2Field.projectV2Field)
  }

  // Helper to create a text/number/date field
  async function addField(name: string, dataType: 'TEXT' | 'NUMBER' | 'DATE') {
    if (existingNames.has(name)) return
    const data = await githubGraphQL<{
      createProjectV2Field: { projectV2Field: { id: string; name: string } }
    }>(
      `mutation($projectId: ID!, $name: String!, $dataType: ProjectV2CustomFieldType!) {
        createProjectV2Field(input: { projectId: $projectId, dataType: $dataType, name: $name }) {
          projectV2Field { ... on ProjectV2Field { id name } }
        }
      }`,
      { projectId, name, dataType }, creds
    )
    provisioned.push(data.createProjectV2Field.projectV2Field)
  }

  // Provision all fields (sequential — GitHub GraphQL doesn't support batched mutations well)
  await addSingleSelect('Status', ARXYS_STATUSES.map((name) => ({
    name, color: STATUS_COLORS[name] ?? 'GRAY',
  })))

  await addSingleSelect('Priority', [
    { name: 'Critical', color: 'RED'    },
    { name: 'High',     color: 'ORANGE' },
    { name: 'Medium',   color: 'YELLOW' },
    { name: 'Low',      color: 'GRAY'   },
  ])

  await addField('Effort',        'NUMBER')
  await addField('Due Date',      'DATE')
  await addField('Git Branch',    'TEXT')
  await addField('Pull Request',  'TEXT')
  await addField('Review round',  'NUMBER')
  await addField('Tags',          'TEXT')
  await addField('Notes',         'TEXT')
  await addField('URL',           'TEXT')

  // Persist the project ID to the workspace
  await c.env.DB
    .prepare(`UPDATE workspaces SET github_project_id = ? WHERE id = ?`)
    .bind(projectId, ws.id)
    .run()

  return c.json({
    ok:          true,
    project_id:  projectId,
    number:      projectNumber,
    url:         projectUrl,
    provisioned: provisioned.map((f) => f.name),
    skipped:     [...existingNames].filter((n) => !['Title', 'Assignees', 'Status'].includes(n)), // built-in fields
  }, 201)
})

// ---------------------------------------------------------------------------
// GET /github/project/:projectId/issues
// ?status=X  ?mine=1  ?icebox=1  ?field=X&value=Y
// Icebox items are hidden by default (same as Notion).
// ---------------------------------------------------------------------------
githubProjectRoutes.get('/:projectId/issues', async (c) => {
  const creds        = c.get('credentials')
  const projectId    = c.req.param('projectId')
  const filterStatus = c.req.query('status')
  const mine         = c.req.query('mine') === '1'
  const icebox       = c.req.query('icebox') === '1'
  const filterField  = c.req.query('field')
  const filterValue  = c.req.query('value')

  type ProjectItem = {
    id: string
    content: {
      __typename: string
      number: number; title: string; state: string; url: string
      assignees: { nodes: Array<{ login: string }> }
    } | null
    fieldValues: {
      nodes: Array<{
        __typename: string
        name?: string
        text?: string
        number?: number
        field?: { name: string }
      }>
    }
  }

  // Paginate through all items
  const allItems: ProjectItem[] = []
  let cursor: string | null = null

  type PageResult = {
    node: { items: { nodes: ProjectItem[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }
  }

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
                  ... on Issue {
                    number title state url
                    assignees(first: 10) { nodes { login } }
                  }
                }
                fieldValues(first: 20) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldSingleSelectValue { name field { name } }
                    ... on ProjectV2ItemFieldTextValue         { text field { name } }
                    ... on ProjectV2ItemFieldNumberValue       { number field { name } }
                  }
                }
              }
            }
          }
        }
      }`,
      { projectId, cursor }, creds
    )
    const page = data.node.items
    allItems.push(...page.nodes.filter((item: ProjectItem) => item.content?.__typename === 'Issue'))
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (cursor)

  // Map to a flat shape
  let issues = allItems.map((item) => {
    const fvs = item.fieldValues.nodes
    const statusFv = fvs.find(
      (fv) => fv.__typename === 'ProjectV2ItemFieldSingleSelectValue' && fv.field?.name === 'Status'
    )
    // Collect all field values as a map for generic filtering
    const fields: Record<string, string> = {}
    for (const fv of fvs) {
      if (!fv.field?.name) continue
      if (fv.__typename === 'ProjectV2ItemFieldSingleSelectValue' && fv.name) fields[fv.field.name] = fv.name
      if (fv.__typename === 'ProjectV2ItemFieldTextValue'         && fv.text !== undefined)   fields[fv.field.name] = String(fv.text)
      if (fv.__typename === 'ProjectV2ItemFieldNumberValue'       && fv.number !== undefined) fields[fv.field.name] = String(fv.number)
    }
    return {
      item_id:   item.id,
      number:    item.content!.number,
      title:     item.content!.title,
      state:     item.content!.state,
      url:       item.content!.url,
      assignees: item.content!.assignees.nodes.map((a) => a.login),
      status:    statusFv?.name ?? null,
      fields,
    }
  })

  // Hide Icebox by default (same as Notion)
  if (!icebox && !filterStatus && !filterField) {
    issues = issues.filter((i) => i.status !== 'Icebox')
  }

  if (filterStatus) {
    issues = issues.filter((i) => i.status === filterStatus)
  }

  if (filterField && filterValue) {
    issues = issues.filter((i) =>
      i.fields[filterField]?.toLowerCase().includes(filterValue.toLowerCase())
    )
  }

  if (mine) {
    const me = (await githubGet('/user', creds) as { login: string }).login
    issues = issues.filter((i) => i.assignees.includes(me))
  }

  return c.json({ issues })
})

// ---------------------------------------------------------------------------
// POST /github/project/:projectId/issues
// Adds an existing issue to the project.
// Body: { repo: string, issue_number: number }
// ---------------------------------------------------------------------------
githubProjectRoutes.post('/:projectId/issues', async (c) => {
  const creds     = c.get('credentials')
  const projectId = c.req.param('projectId')
  const body      = await c.req.json<{ repo: string; issue_number: number }>()

  if (!body.repo || !body.issue_number) {
    return c.json({ error: 'repo and issue_number are required' }, 400)
  }

  const issue = await githubGet(
    `/repos/${body.repo}/issues/${body.issue_number}`, creds
  ) as { node_id: string; number: number }

  const data = await githubGraphQL<{
    addProjectV2ItemById: { item: { id: string } }
  }>(
    `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }`,
    { projectId, contentId: issue.node_id }, creds
  )

  return c.json({ ok: true, item_id: data.addProjectV2ItemById.item.id, issue_number: issue.number }, 201)
})

// ---------------------------------------------------------------------------
// PATCH /github/project/:projectId/issues/:itemId
// Updates a single-select field on a project item (typically Status).
// When updating Status: posts audit comment on the issue + fires Slack.
// Body: { field_id: string, value: string }
// ---------------------------------------------------------------------------
githubProjectRoutes.patch('/:projectId/issues/:itemId', async (c) => {
  const creds     = c.get('credentials')
  const member    = c.get('member')
  const projectId = c.req.param('projectId')
  const itemId    = c.req.param('itemId')
  const body      = await c.req.json<{ field_id: string; value: string }>()

  if (!body.field_id || !body.value) {
    return c.json({ error: 'field_id and value are required' }, 400)
  }

  // Resolve option name → option ID
  const fieldData = await githubGraphQL<{
    node: { field: { name?: string; options: Array<{ id: string; name: string }> } }
  }>(
    `query($projectId: ID!, $fieldId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(id: $fieldId) {
            ... on ProjectV2SingleSelectField { name options { id name } }
          }
        }
      }
    }`,
    { projectId, fieldId: body.field_id }, creds
  )

  const option = fieldData.node.field.options.find(
    (o) => o.name.toLowerCase() === body.value.toLowerCase()
  )
  if (!option) {
    const valid = fieldData.node.field.options.map((o) => o.name).join(', ')
    return c.json({ error: `Unknown value '${body.value}'. Valid: ${valid}` }, 400)
  }

  const isStatusField = fieldData.node.field.name === 'Status'

  // Capture old status before updating (for audit + Slack)
  const oldStatus = isStatusField ? await getItemStatus(projectId, itemId, creds) : null

  // Apply the update
  await githubGraphQL(
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId:    $itemId,
        fieldId:   $fieldId,
        value:     { singleSelectOptionId: $optionId }
      }) {
        projectV2Item { id }
      }
    }`,
    { projectId, itemId, fieldId: body.field_id, optionId: option.id }, creds
  )

  // Status change side-effects: audit comment on issue + Slack notification
  if (isStatusField) {
    const issueRef = await getItemIssueRef(itemId, creds)
    if (issueRef) {
      const actor = member.id
      // Audit comment on the GitHub issue (mirrors Notion's status change comment)
      await githubPost(
        `/repos/${issueRef.repo}/issues/${issueRef.number}/comments`, creds,
        { body: `(${actor}) Status: ${oldStatus ?? '?'} → ${body.value}` }
      ).catch(() => { /* non-fatal */ })

      // Slack notification
      await slackNotifyTaskStatus(
        issueRef.number, issueRef.title,
        oldStatus ?? '?', body.value,
        issueRef.url, creds
      )
    }
  }

  return c.json({ ok: true, item_id: itemId, value: option.name })
})

// ---------------------------------------------------------------------------
// PATCH /github/project/:projectId/issues/:itemId/assign
// Assigns GitHub users (by login array) to the underlying issue.
// Fires a Slack notification per assignee.
// Body: { repo: string, assignees: string[] }
// ---------------------------------------------------------------------------
githubProjectRoutes.patch('/:projectId/issues/:itemId/assign', async (c) => {
  const creds   = c.get('credentials')
  const itemId  = c.req.param('itemId')
  const body    = await c.req.json<{ repo: string; assignees: string[] }>()

  if (!body.repo)            return c.json({ error: 'repo is required' }, 400)
  if (!body.assignees?.length) return c.json({ error: 'assignees array is required' }, 400)

  const issueRef = await getItemIssueRef(itemId, creds)
  if (!issueRef) return c.json({ error: 'Could not resolve issue from project item' }, 404)

  // Merge new assignees with existing ones
  const issue = await githubGet(
    `/repos/${body.repo}/issues/${issueRef.number}`, creds
  ) as { assignees: Array<{ login: string }> }

  const existing = issue.assignees.map((a) => a.login)
  const merged   = [...new Set([...existing, ...body.assignees])]

  await githubPost(
    `/repos/${body.repo}/issues/${issueRef.number}/assignees`, creds,
    { assignees: body.assignees }
  )

  // Slack per-assignee
  for (const login of body.assignees) {
    if (!existing.includes(login)) {
      await slackNotifyTaskAssigned(
        issueRef.number, issueRef.title,
        login, login,
        issueRef.url, creds
      )
    }
  }

  return c.json({ ok: true, assignees: merged })
})

// ---------------------------------------------------------------------------
// PATCH /github/project/:projectId/issues/:itemId/unassign
// Removes GitHub users from the underlying issue's assignees.
// Body: { repo: string, assignees: string[] }
// ---------------------------------------------------------------------------
githubProjectRoutes.patch('/:projectId/issues/:itemId/unassign', async (c) => {
  const creds  = c.get('credentials')
  const itemId = c.req.param('itemId')
  const body   = await c.req.json<{ repo: string; assignees: string[] }>()

  if (!body.repo)              return c.json({ error: 'repo is required' }, 400)
  if (!body.assignees?.length) return c.json({ error: 'assignees array is required' }, 400)

  const issueRef = await getItemIssueRef(itemId, creds)
  if (!issueRef) return c.json({ error: 'Could not resolve issue from project item' }, 404)

  await fetch(`https://api.github.com/repos/${body.repo}/issues/${issueRef.number}/assignees`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${creds.githubToken}`,
      'Accept':        'application/vnd.github+json',
      'Content-Type':  'application/json',
      'User-Agent':    'arxys-api/1.0',
    },
    body: JSON.stringify({ assignees: body.assignees }),
  })

  return c.json({ ok: true, unassigned: body.assignees })
})

// ---------------------------------------------------------------------------
// POST /github/project/:projectId/issues/:number/comment
// Posts a comment on a GitHub issue (by issue number, not item ID).
// Fires a Slack notification (same as Notion comment route).
// Body: { repo: string, text: string }
// ---------------------------------------------------------------------------
githubProjectRoutes.post('/:projectId/issues/:number/comment', async (c) => {
  const creds  = c.get('credentials')
  const member = c.get('member')
  const number = parseInt(c.req.param('number'), 10)
  const body   = await c.req.json<{ repo: string; text: string }>()

  if (!body.repo) return c.json({ error: 'repo is required' }, 400)
  if (!body.text) return c.json({ error: 'text is required' }, 400)

  const text = `(${member.id}) ${body.text}`

  const result = await githubPost(
    `/repos/${body.repo}/issues/${number}/comments`, creds,
    { body: text }
  ) as { id: number; html_url: string }

  // Slack notification (mirrors Notion comment route)
  const issue = await githubGet(
    `/repos/${body.repo}/issues/${number}`, creds
  ) as { title: string; html_url: string }

  await slackNotifyComment(number, issue.title, body.text, issue.html_url, creds)

  return c.json({ ok: true, id: result.id, url: result.html_url }, 201)
})

// ---------------------------------------------------------------------------
// GET /github/project/:projectId/fields
// Lists all custom fields on a project.
// ---------------------------------------------------------------------------
githubProjectRoutes.get('/:projectId/fields', async (c) => {
  const creds     = c.get('credentials')
  const projectId = c.req.param('projectId')

  const data = await githubGraphQL<{
    node: {
      fields: {
        nodes: Array<{
          __typename: string; id: string; name: string
          options?: Array<{ id: string; name: string }>
        }>
      }
    }
  }>(
    `query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              __typename
              ... on ProjectV2Field             { id name }
              ... on ProjectV2SingleSelectField  { id name options { id name } }
              ... on ProjectV2IterationField     { id name }
            }
          }
        }
      }
    }`,
    { projectId }, creds
  )

  return c.json({ fields: data.node.fields.nodes })
})
