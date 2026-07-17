import { useState, type FormEvent } from 'react'
import { AxiosError } from 'axios'
import { Button, Input } from '../../shared/components/ui'
import { Logo } from '../../shared/components/brand/Logo'
import { setupPassword } from './api/authApi'

const MIN_LENGTH = 10

/**
 * First-run: no user exists yet, so the very first visit sets the password.
 * There is no default password anywhere — the account does not exist until
 * this succeeds. Setup auto-issues a session, so onDone lands on the desktop.
 */
export function FirstRunWizard({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tooShort = password.length > 0 && password.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== password
  const canSubmit = password.length >= MIN_LENGTH && confirm === password && !busy

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await setupPassword(password)
      onDone()
    } catch (err) {
      const msg =
        err instanceof AxiosError ? (err.response?.data?.message ?? 'Setup failed') : 'Setup failed'
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Set up this computer"
      subtitle="Create the password that unlocks it. This is the only account."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="new-password"
          label="Password"
          type="password"
          autoFocus
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
        <p className="font-content text-on-surface-variant text-[11px]">
          Use at least {MIN_LENGTH} characters. Choose something strong — this computer can be
          reached from the internet.
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
          {busy ? 'Setting up…' : 'Create password'}
        </Button>
      </form>
    </AuthShell>
  )
}

// Branded ImbatranimOS lock/setup surface — B&W with the single accent.
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div
      className="bg-surface relative flex h-screen w-screen items-center justify-center"
      style={{
        backgroundImage: 'radial-gradient(var(--k-outline-variant) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      {/* subtle vignette so the card reads as a lit panel */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.35)_100%)]" />

      <div className="border-outline-variant bg-surface-container-low relative w-[360px] border shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
        {/* accent top edge */}
        <div className="bg-primary h-[3px] w-full" />

        <div className="border-outline-variant bg-surface-container flex flex-col items-center gap-2 border-b px-6 py-6">
          <Logo size={44} className="text-on-surface" />
          <div className="text-on-surface text-[17px] font-bold tracking-tight">
            Imbatranim<span className="text-primary">OS</span>
          </div>
        </div>

        <div className="p-6">
          <header className="mb-5">
            <h1 className="font-ui text-on-surface text-base font-bold tracking-tight">{title}</h1>
            <p className="font-content text-on-surface-variant mt-1 text-[12px]">{subtitle}</p>
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="font-content text-error text-[11px]">{children}</p>
}
