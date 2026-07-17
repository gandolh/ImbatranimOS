import { useState, type FormEvent } from 'react'
import { AxiosError } from 'axios'
import { Button, Input } from '../../shared/components/ui'
import { login } from './api/authApi'
import { useAuthStore } from './store/authStore'
import { AuthShell, FieldHint } from './FirstRunWizard'

/**
 * The lock screen: logging in is unlocking the computer. Plain/unbranded for
 * now (a later reskin brief brands it). Shows the TOTP field only when the
 * account has TOTP enabled.
 */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const totpEnabled = useAuthStore((s) => s.totpEnabled)
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError(null)
    try {
      await login(password, totpEnabled ? token : undefined)
      onUnlock()
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 429) {
        const secs = err.response?.data?.retryAfterSeconds
        setError(secs ? `Too many attempts. Wait ${secs}s.` : 'Too many attempts.')
      } else {
        setError('Incorrect password or code.')
      }
      setPassword('')
      setToken('')
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Locked" subtitle="Enter your password to unlock this computer.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="password"
          label="Password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {totpEnabled && (
          <Input
            id="totp"
            label="Authenticator code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        )}
        {error && <FieldHint>{error}</FieldHint>}
        <Button type="submit" variant="primary" disabled={busy || !password} className="justify-center py-2">
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>
      </form>
    </AuthShell>
  )
}
