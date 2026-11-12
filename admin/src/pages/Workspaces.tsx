import { useState, useEffect, useRef } from 'react'
import { api, type Workspace } from '../api'

type WorkspaceForm = {
  id: string; venture_id: string; display_name: string; github_repo: string
  notion_api_key: string; notion_database_id: string
  github_project_id: string; slack_channel_id: string
}

type EditForm = {
  display_name: string; github_repo: string
  notion_api_key: string; notion_database_id: string
  github_project_id: string; slack_channel_id: string
}

const emptyForm: WorkspaceForm = {
  id: '', venture_id: '', display_name: '', github_repo: '',
  notion_api_key: '', notion_database_id: '',
  github_project_id: '', slack_channel_id: '',
}

/** Derive board_type from which fields are filled in. */
function deriveBoardType(f: { notion_api_key: string; notion_database_id: string; github_project_id: string }): 'notion' | 'github' | 'both' {
  const hasNotion = !!(f.notion_api_key && f.notion_database_id)
  const hasGithub = !!f.github_project_id
  if (hasNotion && hasGithub) return 'both'
  if (hasGithub) return 'github'
  return 'notion'
}

export function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [ventures,   setVentures]   = useState<{ id: string; display_name: string }[]>([])
  const [members,    setMembers]    = useState<{ id: string; display_name: string }[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  // Create dialog
  const wsDialogRef  = useRef<HTMLDialogElement>(null)
  const [form,    setForm]    = useState<WorkspaceForm>(emptyForm)

  // Edit dialog
  const editDialogRef = useRef<HTMLDialogElement>(null)
  const [editingWs,  setEditingWs]  = useState<Workspace | null>(null)
  const [editForm,   setEditForm]   = useState<EditForm>({
    display_name: '', github_repo: '',
    notion_api_key: '', notion_database_id: '',
    github_project_id: '', slack_channel_id: '',
  })
  const [editTestMsg, setEditTestMsg] = useState('')
  const [editTesting, setEditTesting] = useState(false)

  // Add member dialog
  const memDialogRef = useRef<HTMLDialogElement>(null)
  const [selectedWs, setSelectedWs] = useState('')
  const [memForm, setMemForm] = useState({ member_id: '', workspace_role: 'member' })

  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [testMsg, setTestMsg] = useState('')
  const [testing, setTesting] = useState(false)

  async function load() {
    try {
      const [ws, vs, ms] = await Promise.all([
        api.workspaces.list(), api.ventures.list(), api.members.list()
      ])
      setWorkspaces(ws)
      setVentures(vs)
      setMembers(ms)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Create ────────────────────────────────────────────────────────────────

  async function saveWs(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg('')
    try {
      const boardType = deriveBoardType(form)
      await api.workspaces.create({
        id:           form.id,
        venture_id:   form.venture_id,
        display_name: form.display_name,
        github_repo:  form.github_repo,
        board_type:   boardType,
        notion_api_key:     form.notion_api_key     || null,
        notion_database_id: form.notion_database_id || null,
        github_project_id:  form.github_project_id  || null,
        slack_channel_id:   form.slack_channel_id   || undefined,
      })
      setMsg('Workspace created.')
      setForm(emptyForm)
      load()
      setTimeout(() => wsDialogRef.current?.close(), 800)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function testConnection() {
    if (!form.id) { setTestMsg('Save workspace first, or test after creation.'); return }
    setTesting(true); setTestMsg('')
    try {
      const results: string[] = []
      if (form.notion_api_key && form.notion_database_id) {
        const r = await api.workspaces.notionTest(form.id)
        results.push(`✓ Notion — "${r.database_title}"`)
      }
      if (form.github_project_id) {
        const r = await api.workspaces.githubProjectTest(form.id)
        results.push(`✓ GitHub Project — "${r.project.title}"`)
      }
      setTestMsg(results.join('  ·  ') || 'No board credentials provided')
    } catch (e) {
      setTestMsg(`✗ ${e instanceof Error ? e.message : 'Connection failed'}`)
    } finally {
      setTesting(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function openEdit(ws: Workspace) {
    setEditingWs(ws)
    setEditForm({
      display_name:       ws.display_name,
      github_repo:        ws.github_repo,
      notion_api_key:     ws.notion_api_key     ?? '',
      notion_database_id: ws.notion_database_id ?? '',
      github_project_id:  ws.github_project_id  ?? '',
      slack_channel_id:   ws.slack_channel_id   ?? '',
    })
    setMsg(''); setEditTestMsg('')
    editDialogRef.current?.showModal()
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingWs) return
    setSaving(true); setMsg('')
    try {
      const boardType = deriveBoardType(editForm)
      await api.workspaces.update(editingWs.id, {
        display_name:       editForm.display_name       || undefined,
        github_repo:        editForm.github_repo        || undefined,
        board_type:         boardType,
        notion_api_key:     editForm.notion_api_key     || null,
        notion_database_id: editForm.notion_database_id || null,
        github_project_id:  editForm.github_project_id  || null,
        slack_channel_id:   editForm.slack_channel_id   || null,
      })
      setMsg('Saved.')
      load()
      setTimeout(() => editDialogRef.current?.close(), 800)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function testEditConnection() {
    if (!editingWs) return
    setEditTesting(true); setEditTestMsg('')
    try {
      const results: string[] = []
      if (editForm.notion_api_key && editForm.notion_database_id) {
        const r = await api.workspaces.notionTest(editingWs.id)
        results.push(`✓ Notion — "${r.database_title}"`)
      }
      if (editForm.github_project_id) {
        const r = await api.workspaces.githubProjectTest(editingWs.id)
        results.push(`✓ GitHub Project — "${r.project.title}"`)
      }
      setEditTestMsg(results.join('  ·  ') || 'No board credentials provided')
    } catch (e) {
      setEditTestMsg(`✗ ${e instanceof Error ? e.message : 'Connection failed'}`)
    } finally {
      setEditTesting(false)
    }
  }

  // ── Add member ────────────────────────────────────────────────────────────

  async function saveMem(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg('')
    try {
      await api.workspaceMembers.add(selectedWs, memForm)
      setMsg('Member added.')
      setMemForm({ member_id: '', workspace_role: 'member' })
      setTimeout(() => memDialogRef.current?.close(), 800)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const f  = (k: keyof WorkspaceForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))
  const ef = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditForm(p => ({ ...p, [k]: e.target.value }))
  const mf = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setMemForm(p => ({ ...p, [k]: e.target.value }))

  const ventureName = (id: string) => ventures.find(v => v.id === id)?.display_name ?? id
  const boardLabel  = (ws: Workspace) => {
    if (ws.board_type === 'both')   return '📋+⚙ Notion & GitHub'
    if (ws.board_type === 'github') return '⚙ GitHub'
    return '📋 Notion'
  }

  return (
    <div>
      <div className="section-header">
        <h2>Workspaces</h2>
        <button className="primary" onClick={() => { setMsg(''); setTestMsg(''); wsDialogRef.current?.showModal() }}>
          + New workspace
        </button>
      </div>

      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {error   && <div className="error">{error}</div>}

      {workspaces.map(w => (
        <div key={w.id} className="card">
          <div className="row">
            <h3>{w.display_name}</h3>
            <span className="badge">{w.id}</span>
            <span className="badge">{ventureName(w.venture_id)}</span>
            <span className="badge" style={{ background: w.board_type === 'github' ? 'var(--accent, #238636)' : w.board_type === 'both' ? 'var(--accent2, #6f42c1)' : undefined }}>
              {boardLabel(w)}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button style={{ fontSize: 12 }} onClick={() => openEdit(w)}>Edit</button>
              <button style={{ fontSize: 12 }} onClick={() => {
                setSelectedWs(w.id)
                setMsg('')
                memDialogRef.current?.showModal()
              }}>+ Member</button>
            </div>
          </div>
          <p style={{ marginTop: 6 }}>
            <span className="mono">{w.github_repo}</span>
          </p>
        </div>
      ))}

      {/* ── New workspace dialog ──────────────────────────────────────────── */}
      <dialog ref={wsDialogRef}>
        <h3>New workspace</h3>
        <form onSubmit={saveWs}>
          <div className="field">
            <label>ID (slug)</label>
            <input required value={form.id} onChange={f('id')} placeholder="arxoft-backend" />
          </div>
          <div className="field">
            <label>Venture</label>
            <select required value={form.venture_id} onChange={f('venture_id')}>
              <option value="">Select venture…</option>
              {ventures.map(v => <option key={v.id} value={v.id}>{v.display_name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Display name</label>
            <input required value={form.display_name} onChange={f('display_name')} placeholder="Arxoft Backend" />
          </div>
          <div className="field">
            <label>GitHub repo (org/repo)</label>
            <input required value={form.github_repo} onChange={f('github_repo')} placeholder="arxoft/backend" />
          </div>
          <div className="field">
            <label>Notion API key</label>
            <input value={form.notion_api_key} onChange={f('notion_api_key')} placeholder="ntn_…" />
          </div>
          <div className="field">
            <label>Notion database ID</label>
            <input value={form.notion_database_id} onChange={f('notion_database_id')} placeholder="3d2f1c05…" />
          </div>
          <div className="field">
            <label>GitHub Project ID</label>
            <input value={form.github_project_id} onChange={f('github_project_id')} placeholder="PVT_… (leave blank to bootstrap later)" />
          </div>
          <div className="field">
            <label>Slack channel ID <span style={{ color: 'var(--muted)', fontWeight: 'normal' }}>(optional)</span></label>
            <input value={form.slack_channel_id} onChange={f('slack_channel_id')} placeholder="C0XXXXXXXX" />
          </div>
          {testMsg && <div className={testMsg.startsWith('✓') ? 'success' : 'error'} style={{ marginBottom: 8 }}>{testMsg}</div>}
          {msg     && <div className={msg.includes('created') ? 'success' : 'error'}>{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => wsDialogRef.current?.close()}>Cancel</button>
            <button type="button" onClick={testConnection} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
          </div>
        </form>
      </dialog>

      {/* ── Edit workspace dialog ─────────────────────────────────────────── */}
      <dialog ref={editDialogRef}>
        <h3>Edit {editingWs?.id}</h3>
        <form onSubmit={saveEdit}>
          <div className="field">
            <label>Display name</label>
            <input required value={editForm.display_name} onChange={ef('display_name')} placeholder="Arxoft Backend" />
          </div>
          <div className="field">
            <label>GitHub repo (org/repo)</label>
            <input required value={editForm.github_repo} onChange={ef('github_repo')} placeholder="arxoft/backend" />
          </div>
          <div className="field">
            <label>Notion API key</label>
            <input value={editForm.notion_api_key} onChange={ef('notion_api_key')} placeholder="ntn_…" />
          </div>
          <div className="field">
            <label>Notion database ID</label>
            <input value={editForm.notion_database_id} onChange={ef('notion_database_id')} placeholder="3d2f1c05…" />
          </div>
          <div className="field">
            <label>GitHub Project ID</label>
            <input value={editForm.github_project_id} onChange={ef('github_project_id')} placeholder="PVT_…" />
          </div>
          <div className="field">
            <label>Slack channel ID <span style={{ color: 'var(--muted)', fontWeight: 'normal' }}>(optional)</span></label>
            <input value={editForm.slack_channel_id} onChange={ef('slack_channel_id')} placeholder="C0XXXXXXXX" />
          </div>
          {editTestMsg && <div className={editTestMsg.startsWith('✓') ? 'success' : 'error'} style={{ marginBottom: 8 }}>{editTestMsg}</div>}
          {msg         && <div className={msg === 'Saved.' ? 'success' : 'error'}>{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => editDialogRef.current?.close()}>Cancel</button>
            <button type="button" onClick={testEditConnection} disabled={editTesting}>{editTesting ? 'Testing…' : 'Test connection'}</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </dialog>

      {/* ── Add member dialog ─────────────────────────────────────────────── */}
      <dialog ref={memDialogRef}>
        <h3>Add member to <em>{selectedWs}</em></h3>
        <form onSubmit={saveMem}>
          <div className="field">
            <label>Member</label>
            <select required value={memForm.member_id} onChange={mf('member_id')}>
              <option value="">Select member…</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.display_name} ({m.id})</option>)}
            </select>
          </div>
          <div className="field">
            <label>Role</label>
            <select value={memForm.workspace_role} onChange={mf('workspace_role')}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
          {msg && <div className={msg.includes('added') ? 'success' : 'error'}>{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => memDialogRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
