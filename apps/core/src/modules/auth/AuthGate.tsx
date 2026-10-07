import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from './store/authStore'
import { flushPrefs, flushPrefsKeepalive, hydratePrefs } from '../../lib/prefs'
import { rehydrateDotfileStores } from '../../shared/store/dotfiles'
import { AuthShell } from './AuthShell'
import { ScreenCover, SignedOutScreen } from './SessionScreens'

/**
 * Gates the entire desktop, in two regimes (brief 101):
 *
 * **Before this tab's first sign-in** only the start-up, setup and sign-in
 * screens exist; nothing desktop-shaped mounts or fetches.
 *
 * **After** (`everAuthenticated`), locking and session loss become an OPAQUE
 * OVERLAY over the still-mounted desktop instead of a teardown. That is the
 * whole point: unmounting closed the Terminal's socket (the backend kills the
 * pty on close), discarded every dirty editor buffer, and reset every window's
 * state — fifteen idle minutes cost real work. The tree beneath the overlay is
 * `visibility:hidden` + `inert` + `aria-hidden`, so nothing paints, nothing
 * focuses, and a screen reader cannot walk it; the keyboard chokepoints gate on
 * `isShellSuspended()` besides. Explicit sign-out still tears everything down —
 * walking away on purpose means the screen owes you nothing.
 *
 * It is also where the dotfiles are hydrated (brief 49): `/api/prefs` is behind
 * the session guard, so the transition into `authenticated` is the one moment
 * hydration is both necessary and possible.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const ready = useAuthStore((s) => s.ready)
  const authenticated = useAuthStore((s) => s.authenticated)
  const locked = useAuthStore((s) => s.locked)
  const everAuthenticated = useAuthStore((s) => s.everAuthenticated)
  const refresh = useAuthStore((s) => s.refresh)
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated)
  const unlock = useAuthStore((s) => s.unlock)

  const [prefsReady, setPrefsReady] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Hydrate the dotfiles the moment there is a session to read them with, and
  // hold the desktop for that one round trip. The alternative is a visible flip
  // from the default wallpaper and accent to the real ones on every load.
  useEffect(() => {
    if (!authenticated) return
    let cancelled = false
    // Re-flush FIRST (brief 109): a write held back by a 401 is still queued in
    // module state, and re-authenticating is exactly when it can land. Safe
    // before hydration because `hydratePrefs` latches on `hydrated`, so a
    // re-auth inside a tab cannot clobber the pending value with the server's
    // stale copy.
    flushPrefs()
    void hydratePrefs()
      .then(() => rehydrateDotfileStores())
      .then(() => {
        if (!cancelled) setPrefsReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [authenticated])

  // A change made just before the tab closes should still reach the server —
  // over keepalive, because an ordinary XHR is routinely aborted on unload
  // (brief 109). `pagehide` rather than `beforeunload`: it also covers bfcache
  // navigations, which `beforeunload` misses entirely.
  useEffect(() => {
    const flush = () => flushPrefsKeepalive()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // A 401 from a guarded route (signed out elsewhere, expired, or a password
  // change ended this session) suspends the UI.
  // With `everAuthenticated` latched this means "overlay", not "unmount" —
  // buffers survive; the shell process honestly does not (the pty revoke sweep
  // reaps invalid sessions server-side, which is a security behaviour).
  useEffect(() => {
    const onUnauthorized = () => setAuthenticated(false)
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [setAuthenticated])

  if (!ready) {
    return (
      <AuthShell title="Starting up…" subtitle="Waking the machine.">
        {null}
      </AuthShell>
    )
  }
  // Pre-desktop: this tab has never been signed in, so there is nothing to
  // keep alive. The setup or sign-in form is the only thing that exists.
  if (!authenticated && !everAuthenticated) {
    return <SignedOutScreen />
  }
  if (!prefsReady) {
    return (
      <AuthShell title="Starting up…" subtitle="Reading your settings.">
        {null}
      </AuthShell>
    )
  }

  const suspended = locked || !authenticated

  return (
    <>
      {/* visibility:hidden (not display:none) keeps layout untouched, so xterm,
          Monaco and canvases wake with correct geometry; inert + aria-hidden
          make the hidden tree unfocusable and invisible to assistive tech. */}
      <div
        className="h-full w-full"
        style={suspended ? { visibility: 'hidden' } : undefined}
        inert={suspended || undefined}
        aria-hidden={suspended || undefined}
      >
        {children}
      </div>
      {suspended && (
        <div className="fixed inset-0 z-[9999]">
          {authenticated ? (
            <ScreenCover
              onDismiss={() => {
                // The session is still live; this only uncovers the screen.
                // `refresh` re-syncs in case it died while the cover was up.
                unlock()
                void refresh()
              }}
            />
          ) : (
            /*
             * The session ended while the desktop was mounted. Uncovering
             * cannot help, so this offers the sign-in form instead. The
             * desktop stays mounted behind it, so signing back in returns to a
             * live window set rather than a fresh boot, which is the whole
             * point of the overlay model.
             */
            <SignedOutScreen />
          )}
        </div>
      )}
    </>
  )
}
