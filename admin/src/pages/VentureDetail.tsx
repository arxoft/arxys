import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, type Venture, type Workspace, type Member, type VentureMember, type WorkspaceMember } from '../api'

// ---------------------------------------------------------------------------
// Inline editable field
// ---------------------------------------------------------------------------
function Field({ label, value, onSave, type = 'text', placeholder = '' }: {
  label: string; value: string; type?: string; placeholder?: string
  onSave: (v: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val,     setVal]     = useState(value)
  const [saving,  setSaving]  = useState(false)

  async function commit() {
    if (val === value) { setEditing(false); return }
    setSaving(true)
    try { await onSave(val); setEditing(false) }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  if (!editing) return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div className="row" style={{ gap: 8 }}>
        <span className="mono" style={{ fontSize: 13, flex: 1 }}>{value || <em style={{ color: 'var(--muted)' }}>not set</em>}</span>
        <button style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => { setVal(value); setEditing(true) }}>Edit</button>
      </div>
    </div>
  )

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div className="row" style={{ gap: 6 }}>
        <input type={type} value={val} placeholder={placeholder}
          onChange={e => setVal(e.target.value)}
          style={{ flex: 1 }} autoFocus
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        />
        <button className="primary" style={{ fontSize: 11, padding: '3px 10px' }} disabled={saving} onClick={commit}>
          {saving ? '…' : 'Save'}
        </button>
        <button style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setEditing(false)}>×</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------
function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)' }}>
        {title}
      </div>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export function VentureDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [venture,    setVenture]    = useState<Venture | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [vmembers,   setVmembers]   = useState<VentureMember[]>([])
  const [allMembers, setAllMembers] = useState<Member[]>([])
  const [wsmembers,  setWsmembers]  = useState<Record<string, WorkspaceMember[]>>({})
  const [expandedWs, setExpandedWs] = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  // Dialog refs
  const newWsRef    = useRef<HTMLDialogElement>(null)
  const newVmRef    = useRef<HTMLDialogElement>(null)
  const editVmRef   = useRef<HTMLDialogElement>(null)
  const addWsmRef   = useRef<HTMLDialogElement>(null)

  // Forms
  const [wsForm, setWsForm] = useState({
    id: '', display_name: '', github_repo: '',
    notion_api_key: '', notion_database_id: '', slack_channel_id: '',
  })
  const [vmForm, setVmForm] = useState({
    member_id: '', github_pat: '', venture_role: 'member', notion_user: '', email: '',
  })
  const [editVmTarget, setEditVmTarget] = useState<VentureMember | null>(null)
  const [editVmForm,   setEditVmForm]   = useState({
    github_pat: '', venture_role: 'member', notion_user: '', email: '',
  })
  const [addWsmTarget, setAddWsmTarget] = useState<string>('')
  const [addWsmForm,   setAddWsmForm]   = useState({ member_id: '', workspace_role: 'member' })

  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState('')

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    try {
      const [allV, ws, vm, allM] = await Promise.all([
        api.ventures.list(),
        api.workspaces.list(),
        api.ventureMembers.list(id!),
        api.members.list(),
      ])
      setVenture(allV.find(v => v.id === id) ?? null)
      setWorkspaces(ws.filter(w => w.venture_id === id))
      setVmembers(vm)
      setAllMembers(allM)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  async function loadWsMembers(ws_id: string) {
    if (wsmembers[ws_id]) return
    const rows = await api.workspaceMembers.list(ws_id)
    setWsmembers(p => ({ ...p, [ws_id]: rows }))
  }

  // ── Create workspace ──────────────────────────────────────────────────────
  async function saveWs(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      await api.workspaces.create({ ...wsForm, venture_id: id! })
      newWsRef.current?.close()
      setWsForm({ id: '', display_name: '', github_repo: '', notion_api_key: '', notion_database_id: '', slack_channel_id: '' })
      load()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  // ── Add venture member ────────────────────────────────────────────────────
  async function saveVm(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      await api.ventureMembers.add(id!, {
        member_id:    vmForm.member_id,
        github_pat:   vmForm.github_pat,
        venture_role: vmForm.venture_role as 'admin' | 'member',
        notion_user:  vmForm.notion_user || undefined,
        email:        vmForm.email       || undefined,
      })
      newVmRef.current?.close()
      setVmForm({ member_id: '', github_pat: '', venture_role: 'member', notion_user: '', email: '' })
      const rows = await api.ventureMembers.list(id!)
      setVmembers(rows)
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  // ── Edit venture member ───────────────────────────────────────────────────
  function openEditVm(vm: VentureMember) {
    setEditVmTarget(vm)
    setEditVmForm({ github_pat: '', venture_role: vm.venture_role, notion_user: vm.notion_user ?? '', email: vm.email ?? '' })
    setMsg(''); editVmRef.current?.showModal()
  }

  async function saveEditVm(e: React.FormEvent) {
    e.preventDefault(); if (!editVmTarget) return
    setSaving(true); setMsg('')
    try {
      await api.ventureMembers.update(id!, editVmTarget.member_id, {
        github_pat:   editVmForm.github_pat   || undefined,
        venture_role: editVmForm.venture_role as 'admin' | 'member',
        notion_user:  editVmForm.notion_user,
        email:        editVmForm.email,
      })
      editVmRef.current?.close()
      const rows = await api.ventureMembers.list(id!)
      setVmembers(rows)
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  async function removeVm(member_id: string, display_name: string) {
    if (!confirm(`Remove ${display_name} from this venture?`)) return
    await api.ventureMembers.remove(id!, member_id)
    setVmembers(p => p.filter(m => m.member_id !== member_id))
  }

  // ── Workspace members ─────────────────────────────────────────────────────
  async function saveAddWsm(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      await api.workspaceMembers.add(addWsmTarget, {
        member_id:      addWsmForm.member_id,
        workspace_role: addWsmForm.workspace_role as 'admin' | 'member',
      })
      addWsmRef.current?.close()
      setAddWsmForm({ member_id: '', workspace_role: 'member' })
      setWsmembers(p => { const n = { ...p }; delete n[addWsmTarget]; return n })
      loadWsMembers(addWsmTarget)
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  async function removeWsm(ws_id: string, member_id: string) {
    await api.workspaceMembers.remove(ws_id, member_id)
    setWsmembers(p => ({ ...p, [ws_id]: (p[ws_id] ?? []).filter(m => m.member_id !== member_id) }))
  }

  async function updateWsmRole(ws_id: string, member_id: string, role: string) {
    await api.workspaceMembers.update(ws_id, member_id, { workspace_role: role })
    setWsmembers(p => ({
      ...p,
      [ws_id]: (p[ws_id] ?? []).map(m => m.member_id === member_id ? { ...m, workspace_role: role } : m)
    }))
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const wf  = (k: keyof typeof wsForm)     => (e: React.ChangeEvent<HTMLInputElement>) => setWsForm(p => ({ ...p, [k]: e.target.value }))
  const vmf = (k: keyof typeof vmForm)     => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setVmForm(p => ({ ...p, [k]: e.target.value }))
  const evf = (k: keyof typeof editVmForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEditVmForm(p => ({ ...p, [k]: e.target.value }))
  const awf = (k: keyof typeof addWsmForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setAddWsmForm(p => ({ ...p, [k]: e.target.value }))

  // Members not yet in this venture (available to add)
  const existingVmIds = new Set(vmembers.map(m => m.member_id))
  const availableMembers = allMembers.filter(m => !existingVmIds.has(m.id))

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>
  if (error)   return <div className="error">{error}</div>
  if (!venture) return <div className="error">Venture not found.</div>

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button style={{ fontSize: 12, marginBottom: 12, color: 'var(--muted)' }}
          onClick={() => navigate('/ventures')}>← Ventures</button>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>{venture.display_name}</h2>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{venture.id}</div>
          </div>
        </div>
      </div>

      {/* ── Venture settings ── */}
      <SectionHeader title="Settings" />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
        <Field label="Slack bot token" value={venture.slack_bot_token ?? ''} type="password"
          placeholder="xoxb-..."
          onSave={async () => { /* future: PATCH venture */ }} />
        <Field label="Slack channel ID" value={venture.slack_channel_id ?? ''}
          placeholder="C0XXXXXXX"
          onSave={async () => { /* future: PATCH venture */ }} />
      </div>

      {/* ── Workspaces ── */}
      <SectionHeader title="Workspaces"
        action={<button className="primary" style={{ fontSize: 12 }}
          onClick={() => { setMsg(''); newWsRef.current?.showModal() }}>+ New workspace</button>}
      />

      {workspaces.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No workspaces yet.</div>}

      {workspaces.map(ws => {
        const isOpen = expandedWs === ws.id
        const wsm    = wsmembers[ws.id] ?? []
        // Venture admins always have access — show them as implicit
        const admins = vmembers.filter(m => m.venture_role === 'admin')

        return (
          <div key={ws.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}>
            {/* Workspace header */}
            <div
              className="row"
              style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
              onClick={async () => {
                if (isOpen) { setExpandedWs(null); return }
                setExpandedWs(ws.id)
                await loadWsMembers(ws.id)
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{ws.display_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  <span className="mono">{ws.github_repo}</span>
                  <span style={{ margin: '0 6px' }}>·</span>
                  <span className="mono" style={{ fontSize: 11 }}>{ws.id}</span>
                </div>
              </div>
              <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {/* Workspace detail */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
                {/* Credentials (read-only for now) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Notion</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    DB: <span className="mono">{ws.notion_database_id}</span>
                  </div>
                </div>

                {/* Members */}
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Access
                </div>

                {/* Venture admins — implicit */}
                {admins.map(m => (
                  <div key={m.member_id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13 }}>{m.display_name}</span>
                    <span className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}>{m.member_id}</span>
                    <span className="badge admin" style={{ marginLeft: 8 }}>venture admin</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>implicit</span>
                  </div>
                ))}

                {/* Explicit workspace members */}
                {wsm.map(m => (
                  <div key={m.member_id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13 }}>{m.display_name}</span>
                    <span className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}>{m.member_id}</span>
                    <select
                      value={m.workspace_role}
                      style={{ width: 'auto', padding: '2px 6px', marginLeft: 8 }}
                      onChange={e => updateWsmRole(ws.id, m.member_id, e.target.value)}
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                    <button className="danger" style={{ fontSize: 11, marginLeft: 'auto' }}
                      onClick={() => removeWsm(ws.id, m.member_id)}>Remove</button>
                  </div>
                ))}

                <button style={{ fontSize: 12, marginTop: 10 }} onClick={() => {
                  setAddWsmTarget(ws.id)
                  setAddWsmForm({ member_id: '', workspace_role: 'member' })
                  setMsg('')
                  addWsmRef.current?.showModal()
                }}>+ Add member</button>
              </div>
            )}
          </div>
        )
      })}

      {/* ── Venture members ── */}
      <SectionHeader title="Members"
        action={availableMembers.length > 0
          ? <button style={{ fontSize: 12 }} onClick={() => { setMsg(''); newVmRef.current?.showModal() }}>+ Add member</button>
          : undefined}
      />

      {vmembers.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No members yet.</div>}

      {vmembers.map(vm => (
        <div key={vm.member_id} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px 16px', marginBottom: 8,
        }}>
          <div className="row">
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{vm.display_name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                <span className="mono">{vm.member_id}</span>
                {vm.email && <><span style={{ margin: '0 6px' }}>·</span><span>{vm.email}</span></>}
                {vm.notion_user && <><span style={{ margin: '0 6px' }}>·</span><span>@{vm.notion_user}</span></>}
              </div>
            </div>
            <span className={`badge ${vm.venture_role}`} style={{ marginLeft: 12 }}>{vm.venture_role}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button style={{ fontSize: 12 }} onClick={() => openEditVm(vm)}>Edit</button>
              <button className="danger" style={{ fontSize: 12 }} onClick={() => removeVm(vm.member_id, vm.display_name)}>Remove</button>
            </div>
          </div>
        </div>
      ))}

      {/* ── Dialogs ── */}

      {/* New workspace */}
      <dialog ref={newWsRef}>
        <h3>New workspace in {venture.display_name}</h3>
        <form onSubmit={saveWs}>
          <div className="field"><label>ID (slug)</label>
            <input required value={wsForm.id} onChange={wf('id')} placeholder="arxoft-backend" /></div>
          <div className="field"><label>Display name</label>
            <input required value={wsForm.display_name} onChange={wf('display_name')} placeholder="Backend" /></div>
          <div className="field"><label>GitHub repo (org/repo)</label>
            <input required value={wsForm.github_repo} onChange={wf('github_repo')} placeholder="arxoft/backend" /></div>
          <div className="field"><label>Notion API key</label>
            <input required value={wsForm.notion_api_key} onChange={wf('notion_api_key')} placeholder="ntn_..." /></div>
          <div className="field"><label>Notion database ID</label>
            <input required value={wsForm.notion_database_id} onChange={wf('notion_database_id')} placeholder="3d2f1c05..." /></div>
          <div className="field"><label>Slack channel ID (optional, overrides venture default)</label>
            <input value={wsForm.slack_channel_id} onChange={wf('slack_channel_id')} placeholder="C0XXXXXXX" /></div>
          {msg && <div className="error">{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => newWsRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </dialog>

      {/* Add venture member */}
      <dialog ref={newVmRef}>
        <h3>Add member to {venture.display_name}</h3>
        <form onSubmit={saveVm}>
          <div className="field"><label>Member</label>
            <select required value={vmForm.member_id} onChange={vmf('member_id')}>
              <option value="">Select member…</option>
              {availableMembers.map(m => <option key={m.id} value={m.id}>{m.display_name} ({m.id})</option>)}
            </select></div>
          <div className="field"><label>Role</label>
            <select value={vmForm.venture_role} onChange={vmf('venture_role')}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select></div>
          <div className="field"><label>GitHub PAT</label>
            <input required value={vmForm.github_pat} onChange={vmf('github_pat')} placeholder="ghp_..." /></div>
          <div className="field"><label>Email for this venture</label>
            <input type="email" value={vmForm.email} onChange={vmf('email')} placeholder="you@venture.com" /></div>
          <div className="field"><label>Notion user handle</label>
            <input value={vmForm.notion_user} onChange={vmf('notion_user')} placeholder="ako" /></div>
          {msg && <div className="error">{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => newVmRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Adding…' : 'Add'}</button>
          </div>
        </form>
      </dialog>

      {/* Edit venture member */}
      <dialog ref={editVmRef}>
        <h3>Edit {editVmTarget?.display_name} in {venture.display_name}</h3>
        <form onSubmit={saveEditVm}>
          <div className="field"><label>Role</label>
            <select value={editVmForm.venture_role} onChange={evf('venture_role')}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select></div>
          <div className="field"><label>Email for this venture</label>
            <input type="email" value={editVmForm.email} onChange={evf('email')} placeholder="you@venture.com" /></div>
          <div className="field"><label>Notion user handle</label>
            <input value={editVmForm.notion_user} onChange={evf('notion_user')} placeholder="ako" /></div>
          <div className="field"><label>GitHub PAT (blank = keep current)</label>
            <input value={editVmForm.github_pat} onChange={evf('github_pat')} placeholder="ghp_... (leave blank to keep)" /></div>
          {msg && <div className="error">{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => editVmRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </dialog>

      {/* Add workspace member */}
      <dialog ref={addWsmRef}>
        <h3>Add member to workspace</h3>
        <form onSubmit={saveAddWsm}>
          <div className="field"><label>Member</label>
            <select required value={addWsmForm.member_id} onChange={awf('member_id')}>
              <option value="">Select member…</option>
              {vmembers
                .filter(vm => vm.venture_role !== 'admin') // admins already have implicit access
                .filter(vm => !(wsmembers[addWsmTarget] ?? []).find(w => w.member_id === vm.member_id))
                .map(vm => <option key={vm.member_id} value={vm.member_id}>{vm.display_name}</option>)
              }
            </select></div>
          <div className="field"><label>Role</label>
            <select value={addWsmForm.workspace_role} onChange={awf('workspace_role')}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select></div>
          {msg && <div className="error">{msg}</div>}
          <div className="actions">
            <button type="button" onClick={() => addWsmRef.current?.close()}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Adding…' : 'Add'}</button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
