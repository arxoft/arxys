import { Hono } from 'hono'
import { githubGraphQL, githubGet } from './client'
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Resolve org/user login from a repo slug "owner/repo"
function ownerFromRepo(repo: string): string {
  return repo.split('/')[0]
}

// Fetch the authenticated user's node ID (needed to create user-owned projects)
async function getViewerNodeId(creds: Credentials): Promise<string> {
  const data = await githubGraphQL<{ viewer: { id: string } }>(
    `query { viewer { id } }`, {}, creds
  )
  return data.viewer.id
}

// Fetch an org's node ID
async function getOrgNodeId(login: string, creds: Credentials): Promise<string> {
  const data = await githubGraphQL<{ organization: { id: string } }>(
    `query($login: String!) { organization(login: $login) { id } }`,
    { login },
    creds
  )
  return data.organization.id
}

// ---------------------------------------------------------------------------
// GET /github/project/list
// Lists all Projects v2 for the venture org (derived from workspace.github_repo)
// ---------------------------------------------------------------------------
githubProjectRoutes.get('/list', async (c) => {
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const owner = ownerFromRepo(ws.github_repo)

  // Try org first, fall back to user
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
      { login: owner },
      creds
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
      { login: owner },
      creds
    )
    nodes = data.user.projectsV2.nodes
  }

  return c.json({ projects: nodes })
})

// ---------------------------------------------------------------------------
// POST /github/project
// Creates a new Project v2 under the venture org (or user as fallback)
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
    ownerId   = await getOrgNodeId(owner, creds)
    ownerType = 'org'
  } catch {
    ownerId   = await getViewerNodeId(creds)
    ownerType = 'user'
  }

  const data = await githubGraphQL<{
    createProjectV2: { projectV2: { id: string; number: number; url: string } }
  }>(
    `mutation($ownerId: ID!, $title: String!) {
      createProjectV2(input: { ownerId: $ownerId, title: $title }) {
        projectV2 { id number url }
      }
    }`,
    { ownerId, title: body.title },
    creds
  )

  const project = data.createProjectV2.projectV2
  return c.json({ id: project.id, number: project.number, url: project.url, ownerType }, 201)
})

// ---------------------------------------------------------------------------
// POST /github/project/bootstrap
// Creates a project and provisions the standard arxys Status field with all
// 11 status options. Stores the project node ID back on the workspace in D1.
// Body: { title: string }
// ---------------------------------------------------------------------------
githubProjectRoutes.post('/bootstrap', async (c) => {
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const body  = await c.req.json<{ title: string }>()

  if (!body.title) return c.json({ error: 'title is required' }, 400)

  const owner = ownerFromRepo(ws.github_repo)

  // 1. Resolve owner node ID
  let ownerId: string
  try {
    ownerId = await getOrgNodeId(owner, creds)
  } catch {
    ownerId = await getViewerNodeId(creds)
  }

  // 2. Create the project
  const createData = await githubGraphQL<{
    createProjectV2: { projectV2: { id: string; number: number; url: string } }
  }>(
    `mutation($ownerId: ID!, $title: String!) {
      createProjectV2(input: { ownerId: $ownerId, title: $title }) {
        projectV2 { id number url }
      }
    }`,
    { ownerId, title: body.title },
    creds
  )
  const project = createData.createProjectV2.projectV2

  // 3. Add Status single-select field with all arxys status options
  const fieldData = await githubGraphQL<{
    createProjectV2Field: { projectV2Field: { id: string } }
  }>(
    `mutation($projectId: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
      createProjectV2Field(input: {
        projectId: $projectId,
        dataType: SINGLE_SELECT,
        name: $name,
        singleSelectOptions: $options
      }) {
        projectV2Field { ... on ProjectV2SingleSelectField { id name } }
      }
    }`,
    {
      projectId: project.id,
      name:      'Status',
      options:   ARXYS_STATUSES.map((name) => ({ name, color: 'GRAY', description: '' })),
    },
    creds
  )

  const fieldId = fieldData.createProjectV2Field.projectV2Field.id

  // 4. Persist the project ID back to the workspace row
  await c.env.DB
    .prepare(`UPDATE workspaces SET github_project_id = ?, board_type = 'github' WHERE id = ?`)
    .bind(project.id, ws.id)
    .run()

  return c.json({
    ok:         true,
    project_id: project.id,
    number:     project.number,
    url:        project.url,
    status_field_id: fieldId,
    statuses:   ARXYS_STATUSES,
  }, 201)
})

// ---------------------------------------------------------------------------
// GET /github/project/:projectId/issues
// Lists all issues (project items) in a Project v2 with their Status field value.
// Optional: ?status=In+Progress  ?mine=1
// ---------------------------------------------------------------------------
githubProjectRoutes.get('/:projectId/issues', async (c) => {
  const creds     = c.get('credentials')
  const projectId = c.req.param('projectId')
  const filterStatus = c.req.query('status')
  const mine      = c.req.query('mine') === '1'

  type ProjectItem = {
    id: string
    content: {
      __typename: string
      number: number
      title: string
      state: string
      url: string
      assignees: { nodes: Array<{ login: string }> }
    } | null
    fieldValues: {
      nodes: Array<{
        __typename: string
        name?: string
        field?: { name: string }
      }>
    }
  }

  const data = await githubGraphQL<{
    node: { items: { nodes: ProjectItem[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }
  }>(
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
                }
              }
            }
          }
        }
      }
    }`,
    { projectId, cursor: null },
    creds
  )

  let items = data.node.items.nodes
    .filter((item) => item.content?.__typename === 'Issue')

  // Extract status from field values
  const withStatus = items.map((item) => {
    const statusField = item.fieldValues.nodes.find(
      (fv) => fv.__typename === 'ProjectV2ItemFieldSingleSelectValue' && fv.field?.name === 'Status'
    )
    return {
      item_id:   item.id,
      number:    item.content!.number,
      title:     item.content!.title,
      state:     item.content!.state,
      url:       item.content!.url,
      assignees: item.content!.assignees.nodes.map((a) => a.login),
      status:    statusField?.name ?? null,
    }
  })

  if (filterStatus) {
    return c.json({ issues: withStatus.filter((i) => i.status === filterStatus) })
  }

  if (mine) {
    const me = (await githubGet('/user', creds) as { login: string }).login
    return c.json({ issues: withStatus.filter((i) => i.assignees.includes(me)) })
  }

  return c.json({ issues: withStatus })
})

// ---------------------------------------------------------------------------
// POST /github/project/:projectId/issues
// Adds an existing issue (by repo + number) to a Project v2.
// Body: { repo: "owner/repo", issue_number: 42 }
// ---------------------------------------------------------------------------
githubProjectRoutes.post('/:projectId/issues', async (c) => {
  const creds     = c.get('credentials')
  const projectId = c.req.param('projectId')
  const body      = await c.req.json<{ repo: string; issue_number: number }>()

  if (!body.repo || !body.issue_number) {
    return c.json({ error: 'repo and issue_number are required' }, 400)
  }

  // Resolve issue node ID via REST
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
    { projectId, contentId: issue.node_id },
    creds
  )

  return c.json({ ok: true, item_id: data.addProjectV2ItemById.item.id, issue_number: issue.number }, 201)
})

// ---------------------------------------------------------------------------
// PATCH /github/project/:projectId/issues/:itemId
// Updates a field value on a project item (typically Status).
// Body: { field_id: string, value: string }  — value is the option name e.g. "In Progress"
// ---------------------------------------------------------------------------
githubProjectRoutes.patch('/:projectId/issues/:itemId', async (c) => {
  const creds     = c.get('credentials')
  const projectId = c.req.param('projectId')
  const itemId    = c.req.param('itemId')
  const body      = await c.req.json<{ field_id: string; value: string }>()

  if (!body.field_id || !body.value) {
    return c.json({ error: 'field_id and value are required' }, 400)
  }

  // Fetch the field options to resolve option name → option ID
  const fieldData = await githubGraphQL<{
    node: {
      field: {
        options: Array<{ id: string; name: string }>
      }
    }
  }>(
    `query($projectId: ID!, $fieldId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(id: $fieldId) {
            ... on ProjectV2SingleSelectField { options { id name } }
          }
        }
      }
    }`,
    { projectId, fieldId: body.field_id },
    creds
  )

  const option = fieldData.node.field.options.find(
    (o) => o.name.toLowerCase() === body.value.toLowerCase()
  )
  if (!option) {
    const valid = fieldData.node.field.options.map((o) => o.name).join(', ')
    return c.json({ error: `Unknown status '${body.value}'. Valid: ${valid}` }, 400)
  }

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
    { projectId, itemId, fieldId: body.field_id, optionId: option.id },
    creds
  )

  return c.json({ ok: true, item_id: itemId, status: option.name })
})

// ---------------------------------------------------------------------------
// GET /github/project/:projectId/fields
// Lists all custom fields on a project (useful to get field IDs for PATCH above)
// ---------------------------------------------------------------------------
githubProjectRoutes.get('/:projectId/fields', async (c) => {
  const creds     = c.get('credentials')
  const projectId = c.req.param('projectId')

  const data = await githubGraphQL<{
    node: {
      fields: {
        nodes: Array<{
          __typename: string
          id: string
          name: string
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
              ... on ProjectV2Field { id name }
              ... on ProjectV2SingleSelectField { id name options { id name } }
              ... on ProjectV2IterationField { id name }
            }
          }
        }
      }
    }`,
    { projectId },
    creds
  )

  return c.json({ fields: data.node.fields.nodes })
})
