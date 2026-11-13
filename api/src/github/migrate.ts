import { Hono } from 'hono'
import { githubGraphQL, githubPost } from './client'
import { notionPost } from '../notion/client'
import { ARXYS_STATUSES } from './project'
import type { AppEnv, Credentials } from '../types'

export const githubMigrateRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// POST /github/migrate/notion-to-project
//
// One-way migration: copies all open Notion tasks from this workspace's
// Notion database into a GitHub Project, creating GitHub Issues for each.
//
// Steps:
//   1. Validate both Notion creds and GitHub project ID exist on workspace
//   2. Ensure the GitHub project has a Status field (bootstrap if missing)
//   3. Fetch all non-Completed/Cancelled tasks from Notion
//   4. For each task: create a GitHub Issue → add to Project → set Status
//   5. Return a migration report
//
// Query params:
//   ?dry_run=1   — report what would be migrated without writing anything
//   ?all=1       — include Completed and Cancelled tasks (default: open only)
// ---------------------------------------------------------------------------
githubMigrateRoutes.post('/notion-to-project', async (c) => {
  const creds = c.get('credentials')
  const ws    = c.get('workspace')
  const dry   = c.req.query('dry_run') === '1'
  const all   = c.req.query('all')     === '1'

  // 1. Validate prerequisites
  if (!creds.notionApiKey || !creds.notionDatabaseId) {
    return c.json({ error: 'Workspace has no Notion credentials — nothing to migrate.' }, 400)
  }
  if (!creds.githubProjectId) {
    return c.json({
      error: 'No GitHub project linked to this workspace. Create one first with POST /v1/github/project/bootstrap or set github_project_id via admin.',
    }, 400)
  }

  const projectId = creds.githubProjectId

  // 2. Ensure Status field exists on the project
  const statusFieldId = await ensureStatusField(projectId, creds)

  // 3. Fetch all tasks from Notion (paginated)
  const notionTasks = await fetchAllNotionTasks(creds, all)

  if (dry) {
    return c.json({
      dry_run: true,
      task_count: notionTasks.length,
      tasks: notionTasks.map((t) => ({
        no:       t.no,
        title:    t.title,
        status:   t.status,
        priority: t.priority,
        assignees: t.assigneeEmails,
      })),
    })
  }

  // 4. Migrate each task
  const results: Array<{
    no: number; title: string; issue_number?: number; item_id?: string
    status: string; error?: string
  }> = []

  for (const task of notionTasks) {
    try {
      // Create GitHub Issue on workspace repo
      const issueBody = buildIssueBody(task)
      const issue = await githubPost(
        `/repos/${ws.github_repo}/issues`,
        creds,
        {
          title:     task.title,
          body:      issueBody,
          labels:    buildLabels(task),
          assignees: [], // GitHub logins differ from Notion emails — skip auto-assign
        }
      ) as { number: number; node_id: string; html_url: string }

      // Add issue to Project
      const addData = await githubGraphQL<{
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
      const itemId = addData.addProjectV2ItemById.item.id

      // Set Status on the project item
      if (statusFieldId && task.status) {
        // Resolve option ID for this status
        const optionId = await resolveStatusOptionId(projectId, statusFieldId, task.status, creds)
        if (optionId) {
          await githubGraphQL(
            `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
              updateProjectV2ItemFieldValue(input: {
                projectId: $projectId,
                itemId:    $itemId,
                fieldId:   $fieldId,
                value:     { singleSelectOptionId: $optionId }
              }) { projectV2Item { id } }
            }`,
            { projectId, itemId, fieldId: statusFieldId, optionId },
            creds
          )
        }
      }

      // Add migration note as comment on the GitHub issue
      await githubPost(
        `/repos/${ws.github_repo}/issues/${issue.number}/comments`,
        creds,
        { body: `_Migrated from Notion task #${task.no}. Original URL: ${task.notionUrl}_` }
      )

      results.push({
        no:           task.no,
        title:        task.title,
        issue_number: issue.number,
        item_id:      itemId,
        status:       task.status ?? 'none',
      })
    } catch (err) {
      results.push({
        no:    task.no,
        title: task.title,
        status: task.status ?? 'none',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const succeeded = results.filter((r) => !r.error).length
  const failed    = results.filter((r) =>  r.error).length

  return c.json({
    ok:        failed === 0,
    migrated:  succeeded,
    failed,
    results,
  })
})

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type NotionTask = {
  no:            number
  title:         string
  status:        string | null
  priority:      string | null
  gitBranch:     string | null
  prUrl:         string | null
  notes:         string | null
  assigneeEmails: string[]
  notionUrl:     string
}

async function fetchAllNotionTasks(creds: Credentials, includeAll: boolean): Promise<NotionTask[]> {
  const tasks: NotionTask[] = []
  let cursor: string | undefined

  const closedStatuses = new Set(['Completed', 'Cancelled'])

  while (true) {
    const body: Record<string, unknown> = {
      sorts: [{ property: 'ID', direction: 'ascending' }],
    }
    if (cursor) body.start_cursor = cursor

    const result = await notionPost(
      `/databases/${creds.notionDatabaseId}/query`, creds, body
    ) as { results: Array<Record<string, unknown>>; has_more: boolean; next_cursor: string | null }

    for (const page of result.results) {
      const props = page.properties as Record<string, Record<string, unknown>>

      const noEntry    = Object.values(props).find((p) => p.type === 'unique_id') as { unique_id: { number: number } } | undefined
      const titleEntry = Object.values(props).find((p) => p.type === 'title') as { title: Array<{ plain_text: string }> } | undefined
      const statusEntry = props['Status'] as { type: string; status?: { name: string }; select?: { name: string } } | undefined
      const priorityEntry = props['Priority'] as { select?: { name: string } } | undefined
      const branchEntry = props['Git Branch'] as { rich_text?: Array<{ plain_text: string }> } | undefined
      const prEntry     = props['Pull Request'] as { url?: string } | undefined
      const notesEntry  = props['Notes'] as { rich_text?: Array<{ plain_text: string }> } | undefined
      const assigneeEntry = props['Assignee'] as { people?: Array<{ person?: { email: string } }> } | undefined

      const status = statusEntry?.status?.name ?? statusEntry?.select?.name ?? null

      // Skip closed tasks unless ?all=1
      if (!includeAll && status && closedStatuses.has(status)) continue

      tasks.push({
        no:            noEntry?.unique_id.number ?? 0,
        title:         titleEntry?.title.map((t) => t.plain_text).join('').replace(/^\(\d+\) */, '') ?? 'Untitled',
        status,
        priority:      priorityEntry?.select?.name ?? null,
        gitBranch:     branchEntry?.rich_text?.map((t) => t.plain_text).join('') ?? null,
        prUrl:         prEntry?.url ?? null,
        notes:         notesEntry?.rich_text?.map((t) => t.plain_text).join('') ?? null,
        assigneeEmails: assigneeEntry?.people?.map((p) => p.person?.email ?? '').filter(Boolean) ?? [],
        notionUrl:     page.url as string,
      })
    }

    if (!result.has_more || !result.next_cursor) break
    cursor = result.next_cursor
  }

  return tasks
}

function buildIssueBody(task: NotionTask): string {
  const lines: string[] = []

  if (task.notes) {
    lines.push(task.notes, '')
  }

  lines.push('---', '**Arxys metadata**', '')
  if (task.priority)  lines.push(`- **Priority:** ${task.priority}`)
  if (task.gitBranch) lines.push(`- **Git Branch:** \`${task.gitBranch}\``)
  if (task.prUrl)     lines.push(`- **Pull Request:** ${task.prUrl}`)
  if (task.assigneeEmails.length) {
    lines.push(`- **Notion Assignees:** ${task.assigneeEmails.join(', ')}`)
  }
  lines.push(`- **Notion task:** ${task.notionUrl}`)

  return lines.join('\n')
}

function buildLabels(task: NotionTask): string[] {
  const labels: string[] = []
  if (task.priority) labels.push(`priority:${task.priority.toLowerCase()}`)
  return labels
}

async function ensureStatusField(projectId: string, creds: Credentials): Promise<string | null> {
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
    { projectId },
    creds
  )

  const existing = data.node.fields.nodes.find(
    (f) => f.__typename === 'ProjectV2SingleSelectField' && f.name === 'arxys Status'
  )
  if (existing) return existing.id

  // Create it
  const created = await githubGraphQL<{
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
      projectId,
      name:    'arxys Status',
      options: ARXYS_STATUSES.map((name) => ({ name, color: 'GRAY', description: '' })),
    },
    creds
  )
  return created.createProjectV2Field.projectV2Field.id
}

// Cache option IDs within a migration run to avoid redundant GraphQL calls
const optionIdCache = new Map<string, string>()

async function resolveStatusOptionId(
  projectId: string,
  fieldId: string,
  statusName: string,
  creds: Credentials
): Promise<string | null> {
  const cacheKey = `${projectId}:${fieldId}`

  if (!optionIdCache.has(cacheKey)) {
    const data = await githubGraphQL<{
      node: { field: { options: Array<{ id: string; name: string }> } }
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
      { projectId, fieldId },
      creds
    )
    // Store all options under their names
    for (const opt of data.node.field.options) {
      optionIdCache.set(`${cacheKey}:${opt.name.toLowerCase()}`, opt.id)
    }
  }

  return optionIdCache.get(`${cacheKey}:${statusName.toLowerCase()}`) ?? null
}
