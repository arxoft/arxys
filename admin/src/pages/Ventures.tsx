import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Venture } from '../api'

export function Ventures() {
  const navigate  = useNavigate()
  const [ventures, setVentures] = useState<Venture[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [form, setForm] = useState({
    id: '', display_name: '',
    slack_bot_token: '', slack_channel_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState('')

  async function load() {
    try { setVentures(await api.ventures.list()) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      await api.ventures.create({
        id: form.id, display_name: form.display_name,
        slack_bot_token:  form.slack_bot_token  || undefined,
        slack_channel_id: form.slack_channel_id || undefined,
      })
      dialogRef.current?.close()
      setForm({ id: '', display_name: '', slack_bot_token: '', slack_channel_id: '' })
      load()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  const f = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="section-header">
        <h2>Ventures</h2>
        <button className="primary" onClick={() => { setMsg(''); dialogRef.current?.showModal() }}>
          + New venture
        </button>
      </div>

      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {error   && <div className="error">{error}</div>}

      {ventures.map(v => (
        <div
          key={v.id}
          className="card"
          onClick={() => navigate(`/ventures/${v.id}`)}
          style={{ cursor: 'pointer' }}
        >
          <div className="row">
            <h3>{v.display_name}</h3>
            <span className="badge">{v.id}</span>
            {v.slack_channel_id && <span className="badge" style={{ color: 'var(--success)' }}>Slack ✓</span>}
            <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>→</span>
          </div>
          <p style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
            {v.slack_channel_id ? `Slack: ${v.slack_channel_id}` : 'No Slack configured'}
          </p>
        </div>
      ))}

      <dialog ref={dialogRef}>
        <h3>New venture</h3>
        <form onSubmit={save}>
          <div className="field"><label>ID (slug)</label>
            <input required value={form.id} onChange={f('id')} placeholder="arxoft" /></div>
          <div className="field"><label>Display name</label>
            <input required value={form.display_name} onChange={f('display_name')} placeholder="Arxoft" /></div>
          <div className="field"><label>Slack bot token (optional)</label>
            <input value={form.slack_bot_token} onChange={f('slack_bot_token')} placeholder="xoxb-..." /></div>
          <div className="field"><label>Slack channel ID (optional)</label>
            <input value={form.slack_channel_id} onChange={f('slack_channel_id')} placeholder="C0XXXXXXX" /></div>
          {msg && <div className="error">{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
