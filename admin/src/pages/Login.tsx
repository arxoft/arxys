import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

type Step = 'email' | 'code'

export function Login() {
  const navigate  = useNavigate()
  const [step, setStep]     = useState<Step>('email')
  const [email, setEmail]   = useState('')
  const [code, setCode]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const codeRef = useRef<HTMLInputElement>(null)

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await api.auth.requestOtp(email)
      setStep('code')
      setTimeout(() => codeRef.current?.focus(), 100)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await api.auth.verifyOtp(email, code)
      localStorage.setItem('arxys_token',       res.token)
      localStorage.setItem('arxys_member_id',   res.member_id)
      localStorage.setItem('arxys_display_name', res.display_name)
      navigate('/ventures', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: 360 }}>
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>arxys</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>admin console</div>
        </div>

        {step === 'email' ? (
          <form onSubmit={requestOtp}>
            <div className="field">
              <label>Email address</label>
              <input
                type="email" required autoFocus
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted)' }}>
              Code sent to <strong style={{ color: 'var(--text)' }}>{email}</strong>
            </div>
            <div className="field">
              <label>6-digit code</label>
              <input
                ref={codeRef}
                type="text" inputMode="numeric" pattern="\d{6}"
                maxLength={6} required autoFocus
                value={code} onChange={e => setCode(e.target.value)}
                placeholder="000000"
                style={{ letterSpacing: 8, fontSize: 20, textAlign: 'center' }}
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
            <button
              type="button" style={{ width: '100%', marginTop: 8 }}
              onClick={() => { setStep('email'); setCode(''); setError('') }}
            >
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
