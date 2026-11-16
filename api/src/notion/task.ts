import { Hono } from 'hono'
import { notionGet, notionPost, notionPatch, resolveNotionUserId } from './client'
import { slackNotifyTaskStatus, slackNotifyTaskAssigned } from '../slack/notify'
import type { AppEnv } from '../types'

export const notionTaskRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Resolve Notion unique_id No. → page ID
// Local to task routes — knowledge-base routes address pages by ID directly.
// ---------------------------------------------------------------------------
async function resolvePageId(no: number, creds: import('../types').Credentials): Promise<string> {
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
// GET /notion/task/list
// ?mine=1 &icebox=1 &filter_prop=X &filter_val=Y
// &sort=X &sort_dir=asc|desc
// ---------------------------------------------------------------------------
notionTaskRoutes.get('/list', async (c) => {
  const creds = c.get('credentials')
  const q     = c.req.query()

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
  }) as { id: string; url: string }

  return c.json({ id: result.id, url: result.url }, 201)
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
    properties: Record<string, { type: string; status?: { name: string }; select?: { name: string }; title?: Array<{ plain_text: string }> }>
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
    const title = titleProp?.title.map((t) => t.plain_text).join('') ?? ''

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
  const title = titleProp?.title.map((t) => t.plain_text).join('') ?? ''

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
