import { useState, useEffect, useRef } from 'react'
import { api, type Workspace } from '../api'

type WorkspaceForm = {
  id: string; venture_id: string; display_name: string; github_repo: string
  board_type: 'notion' | 'github'
  notion_api_key: string; notion_database_id: string
  github_project_id: string; slack_channel_id: string
}

const emptyForm: WorkspaceForm = {
  id: '', venture_id: '', display_name: '', github_repo: '',
  board_type: 'notion',
  notion_api_key: '', notion_database_id: '',
  github_project_id: '', slack_channel_id: '',
}

export function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [ventures,   setVentures]   = useState<{ id: string; display_name: string }[]>([])
  const [members,    setMembers]    = useState<{ id: string; display_name: string }[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  const wsDialogRef  = useRef<HTMLDialogElement>(null)
  const memDialogRef = useRef<HTMLDialogElement>(null)
  const [selectedWs, setSelectedWs] = useState('')

  const [form,    setForm]    = useState<WorkspaceForm>(emptyForm)
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

  async function saveWs(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      const payload: Omit<Workspace, 'created_at'> = {
        id:           form.id,
        venture_id:   form.venture_id,
        display_name: form.display_name,
        github_repo:  form.github_repo,
        board_type:   form.board_type,
        notion_api_key:     form.board_type === 'notion' ? form.notion_api_key     : null,
        notion_database_id: form.board_type === 'notion' ? form.notion_database_id : null,
        github_project_id:  form.board_type === 'github' ? (form.github_project_id || null) : null,
        slack_channel_id:   form.slack_channel_id || undefined,
      }
      await api.workspaces.create(payload)
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
    if (!form.id) { setTestMsg('Save workspace first, or test from the workspace detail after creation.'); return }
    setTesting(true)
    setTestMsg('')
    try {
      if (form.board_type === 'notion') {
        const r = await api.workspaces.notionTest(form.id)
        setTestMsg(`✓ Notion connected — "${r.database_title}"`)
      } else {
        const r = await api.workspaces.githubProjectTest(form.id)
        setTestMsg(`✓ GitHub Project connected — "${r.project.title}"`)
      }
    } catch (e) {
      setTestMsg(`✗ ${e instanceof Error ? e.message : 'Connection failed'}`)
    } finally {
      setTesting(false)
    }
  }

  async function saveMem(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
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
  const mf = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setMemForm(p => ({ ...p, [k]: e.target.value }))

  const ventureName = (id: string) => ventures.find(v => v.id === id)?.display_name ?? id
  const boardLabel  = (ws: Workspace) => ws.board_type === 'github' ? '⚙ GitHub' : '📋 Notion'

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
            <span className="badge" style={{ background: w.board_type === 'github' ? 'var(--accent, #238636)' : undefined }}>
              {boardLabel(w)}
            </span>
            <button style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => {
              setSelectedWs(w.id)
              setMsg('')
              memDialogRef.current?.showModal()
            }}>
              + Member
            </button>
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

          {/* Board type selector */}
          <div className="field">
            <label>Board type</label>
            <select value={form.board_type} onChange={f('board_type')}>
              <option value="notion">📋 Notion</option>
              <option value="github">⚙ GitHub Project</option>
            </select>
          </div>

          {/* Notion fields */}
          {form.board_type === 'notion' && <>
            <div className="field">
              <label>Notion API key</label>
              <input required value={form.notion_api_key} onChange={f('notion_api_key')} placeholder="ntn_..." />
            </div>
            <div className="field">
              <label>Notion database ID</label>
              <input required value={form.notion_database_id} onChange={f('notion_database_id')} placeholder="3d2f1c05..." />
            </div>
          </>}

          {/* GitHub fields */}
          {form.board_type === 'github' && <>
            <div className="field">
              <label>GitHub Project ID (PVT_...)</label>
              <input value={form.github_project_id} onChange={f('github_project_id')} placeholder="PVT_... (optional)" />
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -8 }}>
              Leave blank and run <span className="mono">POST /v1/github/project/bootstrap</span> to auto-create.
            </p>
          </>}

          <div className="field">
            <label>Slack channel ID (optional, overrides venture default)</label>
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
