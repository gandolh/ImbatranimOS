import { useState } from 'react'
import { AxiosError } from 'axios'
import { ShieldCheck, LockKeyhole, LogOut } from 'lucide-react'
import { Button, Input } from '../../shared/components/ui'
import { useAuthStore } from './store/authStore'
import { disableTotp, enableTotp, enrollTotp, logout, type TotpEnrollment } from './api/authApi'

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const m = err.response?.data?.message
    return Array.isArray(m) ? m.join(', ') : (m ?? fallback)
  }
  return fallback
}

/**
 * Security section for the Settings app: two-factor (TOTP) enrollment via QR
 * and a lock/sign-out control. Mounted inside the existing Settings module.
 */
export function SecuritySettings() {
  const totpEnabled = useAuthStore((s) => s.totpEnabled)
  const refresh = useAuthStore((s) => s.refresh)

  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function startEnroll() {
    setBusy(true)
    setError(null)
    try {
      setEnrollment(await enrollTotp())
    } catch (err) {
      setError(errMessage(err, 'Could not start enrollment'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnroll() {
    setBusy(true)
    setError(null)
    try {
      await enableTotp(code)
      setEnrollment(null)
      setCode('')
      await refresh()
    } catch (err) {
      setError(errMessage(err, 'Invalid code'))
    } finally {
      setBusy(false)
    }
  }

  async function doDisable() {
    setBusy(true)
    setError(null)
    try {
      await disableTotp(password)
      setPassword('')
      await refresh()
    } catch (err) {
      setError(errMessage(err, 'Could not disable'))
    } finally {
      setBusy(false)
    }
  }

  async function doLogout() {
    await logout()
    await refresh()
  }

  return (
    <section className="border-outline-variant mb-10 border-t pt-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="bg-secondary/10 text-secondary p-2">
          <ShieldCheck size={20} />
        </div>
        <h2 className="font-ui text-on-surface text-xl font-semibold">Security</h2>
      </div>

      <div className="space-y-6">
        {/* Two-factor authentication */}
        <div className="border-outline-variant bg-surface-container-low border p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-on-surface text-sm font-medium">Two-factor authentication</p>
              <p className="font-content text-on-surface-variant mt-0.5 text-[11px]">
                {totpEnabled
                  ? 'Enabled — a code from your authenticator app is required at login.'
                  : 'Add a time-based code (TOTP) required at every unlock.'}
              </p>
            </div>
            <span
              className={`font-ui px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                totpEnabled
                  ? 'bg-secondary/15 text-secondary'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {totpEnabled ? 'On' : 'Off'}
            </span>
          </div>

          {!totpEnabled && !enrollment && (
            <Button variant="primary" onClick={startEnroll} disabled={busy}>
              <LockKeyhole size={14} /> Enable two-factor
            </Button>
          )}

          {!totpEnabled && enrollment && (
            <div className="space-y-3">
              <p className="font-content text-on-surface-variant text-[12px]">
                Scan this with your authenticator app, then enter the 6-digit code to confirm.
              </p>
              <img
                src={enrollment.qrDataUrl}
                alt="TOTP QR code"
                className="border-outline-variant border"
                width={160}
                height={160}
              />
              <p className="font-content text-on-surface-variant text-[11px] break-all">
                Or enter this secret manually:{' '}
                <span className="font-mono">{enrollment.secret}</span>
              </p>
              <Input
                id="totp-confirm"
                label="Code from app"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="primary" onClick={confirmEnroll} disabled={busy || !code}>
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEnrollment(null)
                    setCode('')
                    setError(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {totpEnabled && (
            <div className="space-y-3">
              <Input
                id="disable-totp-password"
                label="Confirm password to disable"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button variant="destructive" onClick={doDisable} disabled={busy || !password}>
                Disable two-factor
              </Button>
            </div>
          )}

          {error && <p className="font-content text-error mt-2 text-[11px]">{error}</p>}
        </div>

        {/* Session */}
        <div className="border-outline-variant bg-surface-container-low flex items-center justify-between border p-4">
          <div>
            <p className="text-on-surface text-sm font-medium">Lock this computer</p>
            <p className="font-content text-on-surface-variant mt-0.5 text-[11px]">
              End your session and return to the lock screen.
            </p>
          </div>
          <Button variant="default" onClick={doLogout}>
            <LogOut size={14} /> Lock
          </Button>
        </div>
      </div>
    </section>
  )
}
