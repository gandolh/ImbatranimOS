import { useState, type FormEvent } from 'react'
import { Button, Input } from '../../shared/components/ui'
import { AuthShell, FieldHint } from './AuthShell'
import { errorMessage, localChangePassword, localSetup, localSignIn } from './api/authApi'
import { useAuthStore } from './store/authStore'

/**
 * The machine's own sign-in, for when Ward is not configured (brief 152,
 * option C): claiming an unclaimed machine, and signing its owner in. Both
 * end in `refresh()`, so `/me` stays the one source of truth for who is in.
 */

/** Matches the backend's `MIN_PASSWORD_LENGTH`. The backend is what enforces it. */
const MIN_LENGTH = 10

export function LocalSetupScreen({ tokenRequired }: { tokenRequired: boolean }) {
  const refresh = useAuthStore((s) => s.refresh)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = password.length > 0 && password.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== password
  const canSubmit =
    !busy &&
    username.trim().length > 0 &&
    password.length >= MIN_LENGTH &&
    confirm === password &&
    (!tokenRequired || token.length > 0)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await localSetup({
        username: username.trim(),
        password,
        setupToken: tokenRequired ? token : undefined,
      })
      await localSignIn(password)
      await refresh()
    } catch (err) {
      setError(errorMessage(err, 'This machine could not be set up.'))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Set up this machine"
      subtitle="Choose the name and password you will sign in with. There is one owner per machine."
    >
      <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <Input
          id="owner-name"
          label="Your name"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          id="new-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          id="confirm-password"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {tokenRequired && (
          <Input
            id="setup-token"
            label="Setup token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        )}
        <p className="font-content text-on-surface-variant text-[11px]">
          Use at least {MIN_LENGTH} characters.
          {tokenRequired && ' The setup token is the one whoever installed this machine was given.'}
        </p>
        {tooShort && <FieldHint>Password must be at least {MIN_LENGTH} characters.</FieldHint>}
        {mismatch && <FieldHint>Passwords do not match.</FieldHint>}
        {error && <FieldHint>{error}</FieldHint>}
        <Button
          type="submit"
          variant="primary"
          disabled={!canSubmit}
          className="justify-center py-2"
        >
          {busy ? 'Setting up…' : 'Set up and sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}

export function LocalSignInScreen() {
  const refresh = useAuthStore((s) => s.refresh)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError(null)
    try {
      await localSignIn(password)
      setPassword('')
      await refresh()
    } catch (err) {
      setError(errorMessage(err, 'That did not work. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Enter this machine's password.">
      <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
        <Input
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <FieldHint>{error}</FieldHint>}
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !password}
          className="justify-center py-2"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}

/**
 * Settings → Security, in local mode: change the owner's password. Other
 * sessions end; this one carries on.
 */
export function LocalPasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      await localChangePassword(current, next)
      setCurrent('')
      setNext('')
      setMessage({ ok: true, text: 'Password changed. Other sessions were signed out.' })
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err, 'The password was not changed.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="flex max-w-[320px] flex-col gap-3" onSubmit={(e) => void submit(e)}>
      <Input
        id="current-password"
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <Input
        id="next-password"
        label={`New password (at least ${MIN_LENGTH} characters)`}
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      {message &&
        (message.ok ? (
          <p className="font-content text-on-surface-variant text-[11px]">{message.text}</p>
        ) : (
          <FieldHint>{message.text}</FieldHint>
        ))}
      <Button type="submit" disabled={busy || !current || next.length < MIN_LENGTH}>
        {busy ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  )
}
