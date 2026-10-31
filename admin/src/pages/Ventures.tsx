import { useState, useEffect, useRef } from 'react'
import { api, type Venture } from '../api'

export function Ventures() {
  const [ventures, setVentures] = useState<Venture[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [form, setForm] = useState({
    id: '', display_name: '', github_org: '',
    notion_api_key: '', slack_bot_token: '', slack_channel_id: '',
  })
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  async function load() {
    try {
      const data = await api.ventures.list()
      setVentures(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setSaveMsg('')
    try {
      await api.ventures.create({
        id:              form.id,
        display_name:    form.display_name,
        github_org:      form.github_org,
        slack_bot_token:  form.slack_bot_token  || undefined,
        slack_channel_id: form.slack_channel_id || undefined,
      })
      setSaveMsg('Venture created.')
      setForm({ id: '', display_name: '', github_org: '', notion_api_key: '', slack_bot_token: '', slack_channel_id: '' })
      load()
      setTimeout(() => dialogRef.current?.close(), 800)
    } catch (e: unknown) {
      setSaveMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="section-header">
        <h2>Ventures</h2>
        <button className="primary" onClick={() => dialogRef.current?.showModal()}>+ New venture</button>
      </div>

      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {error   && <div className="error">{error}</div>}

      {ventures.map(v => (
        <div className="card" key={v.id}>
          <div className="row">
            <h3>{v.display_name}</h3>
            <span className="badge">{v.id}</span>
          </div>
          <p style={{ marginTop: 6 }}>
            GitHub: <span className="mono">{v.github_org}</span>
            {v.slack_channel_id && <> · Slack: <span className="mono">{v.slack_channel_id}</span></>}
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
          <div className="field"><label>GitHub org / user handle</label>
            <input required value={form.github_org} onChange={f('github_org')} placeholder="arxoft" /></div>
          <div className="field"><label>Slack bot token (optional)</label>
            <input value={form.slack_bot_token} onChange={f('slack_bot_token')} placeholder="xoxb-..." /></div>
          <div className="field"><label>Slack channel ID (optional)</label>
            <input value={form.slack_channel_id} onChange={f('slack_channel_id')} placeholder="C0XXXXXXX" /></div>
          {saveMsg && <div className={saveMsg.includes('created') ? 'success' : 'error'}>{saveMsg}</div>}
          <div className="actions">
            <button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
