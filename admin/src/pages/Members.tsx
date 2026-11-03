import { useState, useEffect, useRef } from 'react'
import { api, type Member } from '../api'

export function Members() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const newMemberRef = useRef<HTMLDialogElement>(null)
  const apiKeyRef    = useRef<HTMLDialogElement>(null)
  const regenRef     = useRef<HTMLDialogElement>(null)
  const editRef      = useRef<HTMLDialogElement>(null)

  const [newForm,     setNewForm]     = useState({ id: '', display_name: '' })
  const [newApiKey,   setNewApiKey]   = useState('')
  const [newMemberId, setNewMemberId] = useState('')
  const [regenTarget, setRegenTarget] = useState<Member | null>(null)
  const [regenKey,    setRegenKey]    = useState('')
  const [editTarget,  setEditTarget]  = useState<Member | null>(null)
  const [editForm,    setEditForm]    = useState({ id: '', display_name: '' })
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')

  async function load() {
    try { setMembers(await api.members.list()) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function saveNew(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      const res = await api.members.create(newForm)
      setNewApiKey(res.api_key); setNewMemberId(res.id)
      newMemberRef.current?.close()
      apiKeyRef.current?.showModal()
      setNewForm({ id: '', display_name: '' })
      load()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  async function regenerateKey() {
    if (!regenTarget) return
    setSaving(true); setMsg('')
    try {
      const res = await api.members.regenerateKey(regenTarget.id)
      setRegenKey(res.api_key)
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  const f = (k: keyof typeof newForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setNewForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div className="section-header">
        <h2>Members</h2>
        <button className="primary" onClick={() => { setMsg(''); newMemberRef.current?.showModal() }}>
          + New member
        </button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        To manage venture or workspace access, open a venture from the Ventures page.
      </p>

      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {error   && <div className="error">{error}</div>}

      {members.map(m => (
        <div key={m.id} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px 16px', marginBottom: 8,
        }}>
          <div className="row">
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{m.display_name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                <span className="mono">{m.id}</span>
                {m.login_email && <><span style={{ margin: '0 6px' }}>·</span><span>{m.login_email}</span></>}
                <span style={{ margin: '0 6px' }}>·</span>
                <span>Joined {m.created_at?.slice(0, 10)}</span>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button style={{ fontSize: 12 }} onClick={() => {
                setEditTarget(m)
                setEditForm({ id: m.id, display_name: m.display_name })
                setMsg('')
                editRef.current?.showModal()
              }}>Edit</button>
              <button style={{ fontSize: 12 }} onClick={async () => {
                try {
                  const res = await api.members.getKey(m.id)
                  await navigator.clipboard.writeText(res.api_key)
                  alert('API key copied to clipboard')
                } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
              }}>Copy key</button>
              <button style={{ fontSize: 12 }}
                onClick={() => { setRegenTarget(m); setRegenKey(''); setMsg(''); regenRef.current?.showModal() }}>
                Regenerate key
              </button>
              <button className="danger" style={{ fontSize: 12 }}
                onClick={async () => {
                  if (!confirm(`Delete ${m.display_name}? This removes them from all ventures and workspaces.`)) return
                  try {
                    await api.members.delete(m.id)
                    setMembers(p => p.filter(x => x.id !== m.id))
                  } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
                }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* New member */}
      <dialog ref={newMemberRef}>
        <h3>New member</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          After creating, add them to a venture from the Ventures page.
        </p>
        <form onSubmit={saveNew}>
          <div className="field"><label>ID (slug)</label>
            <input required value={newForm.id} onChange={f('id')} placeholder="john" /></div>
          <div className="field"><label>Display name</label>
            <input required value={newForm.display_name} onChange={f('display_name')} placeholder="John Smith" /></div>
          {msg && <div className="error">{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => newMemberRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </dialog>

      {/* API key reveal */}
      <dialog ref={apiKeyRef}>
        <h3>Member created</h3>
        <p style={{ marginBottom: 16, color: 'var(--muted)', fontSize: 13 }}>
          Save this API key — it will <strong style={{ color: 'var(--text)' }}>never be shown again</strong>.
        </p>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Member ID</div>
          <div className="mono" style={{ color: 'var(--text)', marginBottom: 12 }}>{newMemberId}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>API Key</div>
          <div className="mono" style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{newApiKey}</div>
        </div>
        <div className="actions">
          <button className="primary" onClick={() => navigator.clipboard.writeText(newApiKey)}>Copy key</button>
          <button onClick={() => apiKeyRef.current?.close()}>Done</button>
        </div>
      </dialog>

      {/* Edit member */}
      <dialog ref={editRef}>
        <h3>Edit member</h3>
        <form onSubmit={async (e) => {
          e.preventDefault(); if (!editTarget) return
          setSaving(true); setMsg('')
          try {
            const res = await api.members.update(editTarget.id, editForm)
            editRef.current?.close()
            // If slug changed, update local list with new id
            setMembers(p => p.map(m => m.id === editTarget.id
              ? { ...m, id: res.id, display_name: editForm.display_name }
              : m))
          } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
          finally { setSaving(false) }
        }}>
          <div className="field"><label>ID (slug)</label>
            <input required value={editForm.id}
              onChange={e => setEditForm(p => ({ ...p, id: e.target.value }))}
              placeholder="john" /></div>
          <div className="field"><label>Display name</label>
            <input required value={editForm.display_name}
              onChange={e => setEditForm(p => ({ ...p, display_name: e.target.value }))}
              placeholder="John Smith" /></div>
          {editForm.id !== editTarget?.id && (
            <p style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 8 }}>
              ⚠ Changing the slug updates all venture and workspace memberships.
            </p>
          )}
          {msg && <div className="error">{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => editRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </dialog>

      {/* Regenerate key */}
      <dialog ref={regenRef}>        <h3>Regenerate key — {regenTarget?.display_name}</h3>
        {!regenKey ? (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
              The current key will be invalidated immediately. The member must update their <code>.env.arxys</code> before their next API call.
            </p>
            {msg && <div className="error">{msg}</div>}
            <div className="actions">
              <button onClick={() => regenRef.current?.close()}>Cancel</button>
              <button className="primary" disabled={saving} onClick={regenerateKey}>
                {saving ? 'Generating…' : 'Regenerate'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginBottom: 16, color: 'var(--muted)', fontSize: 13 }}>
              New key — <strong style={{ color: 'var(--text)' }}>save it now</strong>.
            </p>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, marginBottom: 8 }}>
              <div className="mono" style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{regenKey}</div>
            </div>
            <div className="actions">
              <button className="primary" onClick={() => navigator.clipboard.writeText(regenKey)}>Copy</button>
              <button onClick={() => { regenRef.current?.close(); setRegenKey('') }}>Done</button>
            </div>
          </>
        )}
      </dialog>
    </div>
  )
}
