import { useState, useEffect, useRef } from 'react'
import { api, type Member, type Venture } from '../api'

export function Members() {
  const [members,  setMembers]  = useState<Member[]>([])
  const [ventures, setVentures] = useState<Venture[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const newMemberRef = useRef<HTMLDialogElement>(null)
  const apiKeyRef    = useRef<HTMLDialogElement>(null)

  const [form, setForm] = useState({
    // Member
    id: '', display_name: '',
    // Venture membership
    venture_id: '', github_pat: '', venture_role: 'member',
    notion_user: '', email: '',
  })
  const [newApiKey,    setNewApiKey]    = useState('')
  const [newMemberId,  setNewMemberId]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')

  async function load() {
    try {
      const [ms, vs] = await Promise.all([api.members.list(), api.ventures.list()])
      setMembers(ms); setVentures(vs)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function saveMember(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      // 1. Create member
      const res = await api.members.create({
        id: form.id, display_name: form.display_name,
      })

      // 2. Add venture membership
      await api.ventureMembers.add(form.venture_id, {
        member_id:    form.id,
        github_pat:   form.github_pat,
        venture_role: form.venture_role as 'admin' | 'member',
        notion_user:  form.notion_user || undefined,
        email:        form.email       || undefined,
      })

      setNewApiKey(res.api_key)
      setNewMemberId(res.id)
      newMemberRef.current?.close()
      apiKeyRef.current?.showModal()
      setForm({ id: '', display_name: '', venture_id: '', github_pat: '', venture_role: 'member', notion_user: '', email: '' })
      load()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Error')
    } finally { setSaving(false) }
  }

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="section-header">
        <h2>Members</h2>
        <button className="primary" onClick={() => { setMsg(''); newMemberRef.current?.showModal() }}>
          + New member
        </button>
      </div>

      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {error   && <div className="error">{error}</div>}

      {members.map(m => (
        <div className="card" key={m.id}>
          <div className="row">
            <h3>{m.display_name}</h3>
            <span className="badge">{m.id}</span>
          </div>
          <p style={{ marginTop: 4 }}>Joined {m.created_at?.slice(0, 10)}</p>
        </div>
      ))}

      {/* New member + venture membership */}
      <dialog ref={newMemberRef}>
        <h3>New member</h3>
        <form onSubmit={saveMember}>

          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Identity
          </div>
          <div className="field"><label>ID (slug)</label>
            <input required value={form.id} onChange={f('id')} placeholder="john" /></div>
          <div className="field"><label>Display name</label>
            <input required value={form.display_name} onChange={f('display_name')} placeholder="John Smith" /></div>

          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '16px 0 10px' }}>
            Venture membership
          </div>
          <div className="field"><label>Venture</label>
            <select required value={form.venture_id} onChange={f('venture_id')}>
              <option value="">Select venture…</option>
              {ventures.map(v => <option key={v.id} value={v.id}>{v.display_name}</option>)}
            </select></div>
          <div className="field"><label>Role</label>
            <select value={form.venture_role} onChange={f('venture_role')}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select></div>
          <div className="field"><label>GitHub PAT</label>
            <input required value={form.github_pat} onChange={f('github_pat')} placeholder="ghp_..." /></div>
          <div className="field"><label>Email for this venture</label>
            <input type="email" value={form.email} onChange={f('email')} placeholder="you@venture.com" /></div>
          <div className="field"><label>Notion user handle</label>
            <input value={form.notion_user} onChange={f('notion_user')} placeholder="ako" /></div>

          {msg && <div className="error">{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => newMemberRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create member'}
            </button>
          </div>
        </form>
      </dialog>

      {/* API key reveal — shown once */}
      <dialog ref={apiKeyRef}>
        <h3>Member created</h3>
        <p style={{ marginBottom: 16, color: 'var(--muted)', fontSize: 13 }}>
          Save this API key — it will <strong style={{ color: 'var(--text)' }}>never be shown again</strong>.
        </p>
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 6, padding: 12, marginBottom: 8,
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Member ID</div>
          <div className="mono" style={{ color: 'var(--text)', marginBottom: 12 }}>{newMemberId}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>API Key</div>
          <div className="mono" style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{newApiKey}</div>
        </div>
        <div className="actions">
          <button className="primary" onClick={() => navigator.clipboard.writeText(newApiKey)}>
            Copy key
          </button>
          <button onClick={() => apiKeyRef.current?.close()}>Done</button>
        </div>
      </dialog>
    </div>
  )
}
