import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { api } from '../api'

const nav = [
  { to: '/ventures', label: 'Ventures' },
  { to: '/members',  label: 'Members'  },
]

export function Layout() {
  const navigate = useNavigate()
  const name = localStorage.getItem('arxys_display_name') ?? 'Admin'

  async function logout() {
    try { await api.auth.logout() } catch { /* ignore */ }
    localStorage.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 200, background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '20px 0', flexShrink: 0,
      }}>
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>arxys</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>admin console</div>
        </div>

        <nav style={{ flex: 1, padding: '0 8px' }}>
          {nav.map(({ to, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'block', padding: '8px 12px',
              borderRadius: 6, marginBottom: 2,
              color: isActive ? 'var(--accent)' : 'var(--text)',
              background: isActive ? '#1f0e00' : 'transparent',
              textDecoration: 'none', fontSize: 13, fontWeight: 500,
            })}>
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{name}</div>
          <button onClick={logout} style={{ width: '100%', fontSize: 12 }}>Sign out</button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: 28, overflowY: 'auto', minWidth: 0 }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
