import { useState, useEffect, useRef } from 'react'
import { api, type Workspace, type Venture, type Member } from '../api'

export function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [ventures,   setVentures]   = useState<Venture[]>([])
  const [members,    setMembers]    = useState<Member[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  const wsDialogRef  = useRef<HTMLDialogElement>(null)
  const memDialogRef = useRef<HTMLDialogElement>(null)
  const [selectedWs, setSelectedWs] = useState<string>('')

  const [form, setForm] = useState({
    id: '', venture_id: '', display_name: '', github_repo: '',
    notion_api_key: '', notion_database_id: '', slack_channel_id: '',
  })
  const [memForm, setMemForm] = useState({ member_id: '', workspace_role: 'member' })
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')

  async function load() {
    try {
      const [ws, vs, ms] = await Promise.all([
        api.workspaces.list(), api.ventures.list(), api.members.list()
      ])
      setWorkspaces(ws); setVentures(vs); setMembers(ms)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function saveWs(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      await api.workspaces.create(form)
      setMsg('Workspace created.')
      setForm({ id: '', venture_id: '', display_name: '', github_repo: '', notion_api_key: '', notion_database_id: '', slack_channel_id: '' })
      load()
      setTimeout(() => wsDialogRef.current?.close(), 800)
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  async function saveMem(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      await api.workspaceMembers.add(selectedWs, memForm)
      setMsg('Member added.')
      setMemForm({ member_id: '', workspace_role: 'member' })
      setTimeout(() => memDialogRef.current?.close(), 800)
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  const f  = (k: keyof typeof form)    => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }))
  const mf = (k: keyof typeof memForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setMemForm(p => ({ ...p, [k]: e.target.value }))

  const ventureName = (id: string) => ventures.find(v => v.id === id)?.display_name ?? id

  return (
    <div>
      <div className="section-header">
        <h2>Workspaces</h2>
        <button className="primary" onClick={() => { setMsg(''); wsDialogRef.current?.showModal() }}>+ New workspace</button>
      </div>

      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {error   && <div className="error">{error}</div>}

      {workspaces.map(w => (
        <div className="card" key={w.id}>
          <div className="row">
            <h3>{w.display_name}</h3>
            <span className="badge">{w.id}</span>
            <span className="badge">{ventureName(w.venture_id)}</span>
            <button style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => {
              setSelectedWs(w.id); setMsg(''); memDialogRef.current?.showModal()
            }}>+ Member</button>
          </div>
          <p style={{ marginTop: 6 }}>
            <span className="mono">{w.github_repo}</span>
          </p>
        </div>
      ))}

      {/* New workspace dialog */}
      <dialog ref={wsDialogRef}>
        <h3>New workspace</h3>
        <form onSubmit={saveWs}>
          <div className="field"><label>ID (slug)</label>
            <input required value={form.id} onChange={f('id')} placeholder="arxoft-backend" /></div>
          <div className="field"><label>Venture</label>
            <select required value={form.venture_id} onChange={f('venture_id')}>
              <option value="">Select venture…</option>
              {ventures.map(v => <option key={v.id} value={v.id}>{v.display_name}</option>)}
            </select></div>
          <div className="field"><label>Display name</label>
            <input required value={form.display_name} onChange={f('display_name')} placeholder="Arxoft Backend" /></div>
          <div className="field"><label>GitHub repo (org/repo)</label>
            <input required value={form.github_repo} onChange={f('github_repo')} placeholder="arxoft/backend" /></div>
          <div className="field"><label>Notion API key</label>
            <input required value={form.notion_api_key} onChange={f('notion_api_key')} placeholder="ntn_..." /></div>
          <div className="field"><label>Notion database ID</label>
            <input required value={form.notion_database_id} onChange={f('notion_database_id')} placeholder="3d2f1c05..." /></div>
          <div className="field"><label>Slack channel ID (optional)</label>
            <input value={form.slack_channel_id} onChange={f('slack_channel_id')} placeholder="C0XXXXXXX" /></div>
          {msg && <div className={msg.includes('created') ? 'success' : 'error'}>{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => wsDialogRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
          </div>
        </form>
      </dialog>

      {/* Add member to workspace dialog */}
      <dialog ref={memDialogRef}>
        <h3>Add member to <em>{selectedWs}</em></h3>
        <form onSubmit={saveMem}>
          <div className="field"><label>Member</label>
            <select required value={memForm.member_id} onChange={mf('member_id')}>
              <option value="">Select member…</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.display_name} ({m.id})</option>)}
            </select></div>
          <div className="field"><label>Role</label>
            <select value={memForm.workspace_role} onChange={mf('workspace_role')}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select></div>
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
