import { Hono } from 'hono'
import { notionGet, notionPost, notionPatch, resolvePageId, resolveNotionUserId } from './client'
import { slackNotifyTaskStatus, slackNotifyTaskAssigned } from '../slack/notify'
import type { AppEnv } from '../types'

export const notionTaskRoutes = new Hono<AppEnv>()

// Guard: all notion/task routes require a notion-type workspace
notionTaskRoutes.use('*', async (c, next) => {
  const ws = c.get('workspace')
  if (ws.board_type !== 'notion') {
    return c.json({ error: 'This workspace uses GitHub as its board. Use /v1/github/issue routes instead.' }, 400)
  }
  return next()
})

const NO_PREFIX_RE = /^\(\d+\) */

function titleWithoutNo(t: string) { return t.replace(NO_PREFIX_RE, '') }
function titleWithNo(no: number, t: string) { return `(${no}) ${titleWithoutNo(t)}` }

// ---------------------------------------------------------------------------
// GET /notion/task/list
// ?mine=1 &icebox=1 &review_queue=1 &filter_prop=X &filter_val=Y
// &sort=X &sort_dir=asc|desc
// ---------------------------------------------------------------------------
notionTaskRoutes.get('/list', async (c) => {
  const creds = c.get('credentials')
  const q     = c.req.query()

  // Review queue — topological sort by Depends on, tie-break by PR number
  if (q.review_queue === '1') {
    return reviewQueue(c, creds)
  }

  let body: Record<string, unknown> = {
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
  }

  if (q.sort) {
    body.sorts = [{ property: q.sort, direction: q.sort_dir === 'desc' ? 'descending' : 'ascending' }]
  }

  if (q.mine === '1') {
    if (!creds.notionUserEmail) return c.json({ error: 'mine requires email set on your venture membership' }, 400)
    const uid = await resolveNotionUserId(creds.notionUserEmail, creds)
    body.filter = { property: 'Assignee', people: { contains: uid } }
  } else if (q.filter_prop && q.filter_val) {
    body.filter = {
      or: [
        { property: q.filter_prop, rich_text:   { contains: q.filter_val } },
        { property: q.filter_prop, select:       { equals:   q.filter_val } },
        { property: q.filter_prop, status:       { equals:   q.filter_val } },
        { property: q.filter_prop, multi_select: { contains: q.filter_val } },
      ]
    }
  }

  const result = await notionPost(
    `/databases/${creds.notionDatabaseId}/query`, creds, body
  ) as { results: unknown[] }

  // Filter icebox unless explicitly requested or filtering by status
  if (q.icebox !== '1' && !q.filter_prop) {
    result.results = (result.results as Array<Record<string, unknown>>).filter((r) => {
      const props = (r as Record<string, unknown>).properties as Record<string, Record<string, unknown>>
      const statusEntry = Object.values(props).find((p) => p.type === 'status')
      if (!statusEntry) return true
      const name = (statusEntry.status as Record<string, unknown> | undefined)?.name
      return name !== 'Icebox'
    })
  }

  return c.json(result)
})

// ---------------------------------------------------------------------------
// Review queue — Kahn's topological sort by Depends on, tie-break by PR #
// ---------------------------------------------------------------------------
async function reviewQueue(c: import('hono').Context<AppEnv>, creds: import('../types').Credentials) {
  type Task = {
    id: string; no: number; title: string; pr_url: string; dep_ids: string[]
  }

  const raw = await notionPost(
    `/databases/${creds.notionDatabaseId}/query`, creds,
    { filter: { property: 'Status', status: { equals: 'Pending Review' } } }
  ) as { results: Array<Record<string, unknown>> }

  if (!raw.results.length) return c.json({ tasks: [], message: 'No tasks in Pending Review.' })

  // Build task list
  const tasks: Task[] = raw.results.map((r) => {
    const props = r.properties as Record<string, Record<string, unknown>>
    const noEntry  = Object.values(props).find((p) => p.type === 'unique_id') as { unique_id: { number: number } }
    const titleEntry = Object.values(props).find((p) => p.type === 'title') as { title: Array<{ plain_text: string }> }
    const prEntry  = props['Pull Request'] as { url?: string } | undefined
    const depsEntry = props['Depends on'] as { relation?: Array<{ id: string }> } | undefined
    return {
      id:      r.id as string,
      no:      noEntry?.unique_id.number ?? 0,
      title:   titleEntry?.title.map((t) => t.plain_text).join('').replace(NO_PREFIX_RE, '') ?? '',
      pr_url:  prEntry?.url ?? '',
      dep_ids: depsEntry?.relation?.map((d) => d.id) ?? [],
    }
  })

  // Validate external deps and build in-degree map
  const allDepIds = [...new Set(tasks.flatMap((t) => t.dep_ids))]
  const idToIdx   = new Map(tasks.map((t, i) => [t.id, i]))
  const inDegree  = new Array(tasks.length).fill(0)
  const errors: string[] = []

  // Fetch external deps in parallel
  const externalDepIds = allDepIds.filter((id) => !idToIdx.has(id))
  const depStatusMap   = new Map<string, string>()

  await Promise.all(externalDepIds.map(async (id) => {
    const page = await notionGet(`/pages/${id}`, creds) as { properties: Record<string, Record<string, unknown>> }
    const statusEntry = Object.values(page.properties).find((p) => p.type === 'status') as
      { status: { name: string } } | undefined
    depStatusMap.set(id, statusEntry?.status.name ?? '')
  }))

  for (const task of tasks) {
    for (const depId of task.dep_ids) {
      if (idToIdx.has(depId)) {
        inDegree[tasks.indexOf(task)]++
      } else {
        const st = depStatusMap.get(depId) ?? ''
        if (st !== 'Awaiting Deployment' && st !== 'Completed') {
          errors.push(`No.${task.no} depends on a task in status '${st}' (must be Awaiting Deployment or Completed)`)
        }
      }
    }
  }

  if (errors.length) return c.json({ error: 'Review queue blocked', details: errors }, 409)

  // PR number helper
  const prNum = (t: Task) => { const m = t.pr_url.match(/\/(\d+)$/); return m ? parseInt(m[1]) : 999999 }

  // Kahn's algorithm
  let queue = tasks
    .map((_, i) => i)
    .filter((i) => inDegree[i] === 0)
    .sort((a, b) => prNum(tasks[a]) - prNum(tasks[b]))

  const sorted: Task[] = []
  const localInDegree  = [...inDegree]

  while (queue.length) {
    const cur = queue.shift()!
    sorted.push(tasks[cur])

    const newlyFree: number[] = []
    for (let j = 0; j < tasks.length; j++) {
      if (tasks[j].dep_ids.includes(tasks[cur].id)) {
        localInDegree[j]--
        if (localInDegree[j] === 0) newlyFree.push(j)
      }
    }
    newlyFree.sort((a, b) => prNum(tasks[a]) - prNum(tasks[b]))
    queue = [...queue, ...newlyFree]
  }

  if (sorted.length < tasks.length) {
    return c.json({ error: 'Cycle detected in Pending Review dependencies' }, 409)
  }

  return c.json({ tasks: sorted.map((t) => ({ no: t.no, title: t.title, pr_url: t.pr_url })) })
}

// ---------------------------------------------------------------------------
// GET /notion/task/:no
// ---------------------------------------------------------------------------
notionTaskRoutes.get('/:no', async (c) => {
  const creds  = c.get('credentials')
  const no     = parseInt(c.req.param('no'), 10)
  const pageId = await resolvePageId(no, creds)
  const [page, comments] = await Promise.all([
    notionGet(`/pages/${pageId}`, creds),
    notionGet(`/comments?block_id=${pageId}`, creds),
  ])
  return c.json({ page, comments })
})

// ---------------------------------------------------------------------------
// POST /notion/task — create
// ---------------------------------------------------------------------------
notionTaskRoutes.post('/', async (c) => {
  const creds = c.get('credentials')
  const body  = await c.req.json<{ title: string; [k: string]: unknown }>()
  if (!body.title) return c.json({ error: 'title is required' }, 400)

  const result = await notionPost('/pages', creds, {
    parent:     { database_id: creds.notionDatabaseId },
    properties: { 'Title': { title: [{ type: 'text', text: { content: body.title } }] } },
  }) as { id: string; url: string; properties: Record<string, unknown> }

  const noEntry = Object.values(result.properties).find(
    (p) => (p as Record<string, unknown>).type === 'unique_id'
  ) as Record<string, unknown> | undefined
  const no = (noEntry?.unique_id as Record<string, unknown> | undefined)?.number as number

  if (no) {
    await notionPatch(`/pages/${result.id}`, creds, {
      properties: { 'Title': { title: [{ type: 'text', text: { content: titleWithNo(no, body.title) } }] } }
    })
  }

  return c.json({ id: result.id, no, url: result.url }, 201)
})

// ---------------------------------------------------------------------------
// PATCH /notion/task/:no — update a property
// ---------------------------------------------------------------------------
notionTaskRoutes.patch('/:no', async (c) => {
  const creds = c.get('credentials')
  const no    = parseInt(c.req.param('no'), 10)
  const body  = await c.req.json<{ property: string; value: string }>()

  if (!body.property || body.value === undefined) {
    return c.json({ error: 'property and value are required' }, 400)
  }

  const pageId = await resolvePageId(no, creds)
  const page   = await notionGet(`/pages/${pageId}`, creds) as {
    url: string
    properties: Record<string, { type: string; status?: { name: string }; select?: { name: string } }>
  }

  const realProp = Object.keys(page.properties).find(
    (k) => k.toLowerCase() === body.property.toLowerCase()
  )
  if (!realProp) return c.json({ error: `Property '${body.property}' not found` }, 404)

  const propType = page.properties[realProp].type
  const propBody = buildPropBody(propType, body.value)

  if ((propType === 'status' || propType === 'select') && realProp.toLowerCase() === 'status') {
    const oldStatus = propType === 'status'
      ? page.properties[realProp].status?.name
      : page.properties[realProp].select?.name

    const titleProp = Object.values(page.properties).find((p) => p.type === 'title') as
      { title: Array<{ plain_text: string }> } | undefined
    const title = titleProp?.title.map((t) => t.plain_text).join('').replace(NO_PREFIX_RE, '') ?? ''

    await notionPost('/comments', creds, {
      parent: { page_id: pageId },
      rich_text: [{ type: 'text', text: {
        content: `(${creds.notionUser}) Status: ${oldStatus ?? '?'} → ${body.value}`
      }}]
    })

    await slackNotifyTaskStatus(no, title, oldStatus ?? '?', body.value, page.url, creds)
  }

  await notionPatch(`/pages/${pageId}`, creds, { properties: { [realProp]: propBody } })
  return c.json({ ok: true, no, property: realProp, value: body.value })
})

// ---------------------------------------------------------------------------
// PATCH /notion/task/:no/assign
// ---------------------------------------------------------------------------
notionTaskRoutes.patch('/:no/assign', async (c) => {
  const creds = c.get('credentials')
  const no    = parseInt(c.req.param('no'), 10)
  const body  = await c.req.json<{ emails: string[] }>()
  if (!body.emails?.length) return c.json({ error: 'emails array is required' }, 400)

  const pageId = await resolvePageId(no, creds)
  const page   = await notionGet(`/pages/${pageId}`, creds) as {
    url: string
    properties: Record<string, { type: string; title?: Array<{ plain_text: string }> }>
  }

  const peopleIds  = await Promise.all(body.emails.map((e) => resolveNotionUserId(e, creds)))
  const peopleProp = Object.keys(page.properties).find((k) => page.properties[k].type === 'people')
  if (!peopleProp) return c.json({ error: 'No people property found on task' }, 404)

  await notionPatch(`/pages/${pageId}`, creds, {
    properties: { [peopleProp]: { people: peopleIds.map((id) => ({ object: 'user', id })) } }
  })

  const titleProp = Object.values(page.properties).find((p) => p.type === 'title') as
    { title: Array<{ plain_text: string }> } | undefined
  const title = titleProp?.title.map((t) => t.plain_text).join('').replace(NO_PREFIX_RE, '') ?? ''

  await Promise.all(
    body.emails.map((email) => slackNotifyTaskAssigned(no, title, email, email, page.url, creds))
  )

  return c.json({ ok: true, no, assigned: body.emails })
})

// ---------------------------------------------------------------------------
// PATCH /notion/task/:no/unassign
// ---------------------------------------------------------------------------
notionTaskRoutes.patch('/:no/unassign', async (c) => {
  const creds = c.get('credentials')
  const no    = parseInt(c.req.param('no'), 10)
  const body  = await c.req.json<{ emails: string[] }>()
  if (!body.emails?.length) return c.json({ error: 'emails array is required' }, 400)

  const pageId = await resolvePageId(no, creds)
  const page   = await notionGet(`/pages/${pageId}`, creds) as {
    properties: Record<string, {
      type: string
      people?: Array<{ id: string; name?: string }>
    }>
  }

  const peopleProp = Object.keys(page.properties).find((k) => page.properties[k].type === 'people')
  if (!peopleProp) return c.json({ error: 'No people property found on task' }, 404)

  // Resolve emails to IDs, then filter them out of current assignees
  const removeIds  = await Promise.all(body.emails.map((e) => resolveNotionUserId(e, creds)))
  const removeSet  = new Set(removeIds)
  const current    = page.properties[peopleProp].people ?? []
  const remaining  = current
    .filter((p) => !removeSet.has(p.id))
    .map((p) => ({ object: 'user', id: p.id }))

  await notionPatch(`/pages/${pageId}`, creds, {
    properties: { [peopleProp]: { people: remaining } }
  })

  return c.json({ ok: true, no, unassigned: body.emails })
})

// ---------------------------------------------------------------------------
// POST /notion/task/fix-titles?apply=1
// Scans all tasks and repairs missing (No.) prefix. Dry-run unless apply=1.
// ---------------------------------------------------------------------------
notionTaskRoutes.post('/fix-titles', async (c) => {
  const creds = c.get('credentials')
  const apply = c.req.query('apply') === '1'

  const drifted: Array<{ no: number; current: string; fixed: string }> = []
  let cursor = ''
  let checked = 0

  while (true) {
    const body: Record<string, unknown> = {}
    if (cursor) body.start_cursor = cursor

    const page = await notionPost(
      `/databases/${creds.notionDatabaseId}/query`, creds, body
    ) as { results: Array<Record<string, unknown>>; next_cursor: string | null; has_more: boolean }

    for (const r of page.results) {
      const props   = r.properties as Record<string, Record<string, unknown>>
      const noEntry = Object.values(props).find((p) => p.type === 'unique_id') as
        { unique_id: { number: number } } | undefined
      const titleEntry = Object.values(props).find((p) => p.type === 'title') as
        { title: Array<{ plain_text: string }> } | undefined

      const no      = noEntry?.unique_id.number
      const current = titleEntry?.title.map((t) => t.plain_text).join('') ?? ''

      if (!no || !current) continue
      checked++

      const fixed = titleWithNo(no, current)
      if (fixed === current) continue

      drifted.push({ no, current, fixed })

      if (apply) {
        await notionPatch(`/pages/${r.id as string}`, creds, {
          properties: { 'Title': { title: [{ type: 'text', text: { content: fixed } }] } }
        })
      }
    }

    if (!page.has_more || !page.next_cursor) break
    cursor = page.next_cursor
  }

  return c.json({
    checked,
    drifted: drifted.length,
    applied: apply,
    tasks: drifted,
  })
})

// ---------------------------------------------------------------------------
// Property body builder
// ---------------------------------------------------------------------------
function buildPropBody(type: string, value: string): Record<string, unknown> {
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
