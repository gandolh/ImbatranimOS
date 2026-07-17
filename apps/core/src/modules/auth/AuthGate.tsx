import { useEffect, type ReactNode } from 'react'
import { useAuthStore } from './store/authStore'
import { LockScreen } from './LockScreen'
import { FirstRunWizard, AuthShell } from './FirstRunWizard'

/**
 * Gates the entire desktop. Unauthenticated visitors see only the first-run
 * wizard (no user yet) or the lock screen; the desktop mounts only after login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const ready = useAuthStore((s) => s.ready)
  const authenticated = useAuthStore((s) => s.authenticated)
  const needsSetup = useAuthStore((s) => s.needsSetup)
  const refresh = useAuthStore((s) => s.refresh)
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated)

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A 401 on any protected route (session expired/revoked) re-locks the UI.
  useEffect(() => {
    const onUnauthorized = () => setAuthenticated(false)
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [setAuthenticated])

  if (!ready) {
    return <AuthShell title="Starting up…" subtitle="Waking the machine.">{null}</AuthShell>
  }
  if (needsSetup) {
    return <FirstRunWizard onDone={() => void refresh()} />
  }
  if (!authenticated) {
    return <LockScreen onUnlock={() => void refresh()} />
  }
  return <>{children}</>
}
