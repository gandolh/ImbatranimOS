import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from './store/authStore'
import { flushPrefs, flushPrefsKeepalive, hydratePrefs, prefsWaitingForAuth } from '../../lib/prefs'
import {
  WARD_REFRESHED_EVENT,
  noteSessionFresh,
  refreshWardSession,
  startProactiveRefresh,
} from '../../lib/wardSession'
import { rehydrateDotfileStores } from '../../shared/store/dotfiles'
import { AuthShell } from './AuthShell'
import {
  IdentityUnavailableScreen,
  NoAccessScreen,
  ScreenCover,
  SignedOutScreen,
} from './SessionScreens'

/**
 * Gates the entire desktop, in two regimes (brief 101):
 *
 * **Before this tab's first sign-in** only the start-up, sign-in hand-off,
 * no-access and Ward-unavailable screens exist; nothing desktop-shaped mounts
 * or fetches.
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
  const unavailable = useAuthStore((s) => s.unavailable)
  const forbidden = useAuthStore((s) => s.forbidden)
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

  // Keep the Ward session alive while signed in (brief 144): refresh about a
  // minute before the access token expires instead of meeting a 401 every 15
  // minutes. The probe that just succeeded is the freshest fact there is; the
  // cookie's real expiry is HttpOnly, so the first schedule is an estimate and
  // every refresh after it uses Ward's own answer.
  useEffect(() => {
    if (!authenticated) return
    // Refresh once now rather than guess: the cookie's real expiry is HttpOnly,
    // and a guess made at page load runs late by however old the token already
    // was. Late is what closed terminals (brief 145): between the old token
    // expiring and the next request carrying the new one, the backend's sweep
    // only had the expired cookie to check. A failed refresh falls back to the
    // estimate; the interceptor still covers any 401.
    noteSessionFresh()
    refreshWardSession().catch(() => undefined)
    return startProactiveRefresh()
  }, [authenticated])

  // A refresh that succeeds after something gave up: prefs held back by a 401
  // (brief 109) go now, and a desktop already behind the sign-in cover comes
  // back without a page load. Re-probing rather than flipping `authenticated`
  // keeps `/me` the one source of truth.
  useEffect(() => {
    const onRefreshed = () => {
      if (prefsWaitingForAuth()) flushPrefs()
      // Always re-probe, not only when covered: the probe is also what tells
      // the backend about the new cookie, which an open Terminal's revocation
      // sweep checks against (brief 145). A hidden tab makes no other request.
      void refresh()
    }
    window.addEventListener(WARD_REFRESHED_EVENT, onRefreshed)
    return () => window.removeEventListener(WARD_REFRESHED_EVENT, onRefreshed)
  }, [refresh])

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

  // A 401 the interceptor could not refresh away (session revoked, refresh
  // family dead) suspends the UI.
  // With `everAuthenticated` latched this now means "overlay", not "unmount" —
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
  /*
   * Ward is unreachable, so this machine cannot tell who anybody is. Checked
   * BEFORE the signed-out branch: offering "sign in" here would send somebody
   * to a page served by the service that is not answering.
   */
  if (unavailable && !everAuthenticated) {
    return <IdentityUnavailableScreen onRetry={() => void refresh()} />
  }
  /*
   * Signed in, but without a grant for this system (brief 137). Also checked
   * before the signed-out branch: the hand-off to Ward would return straight
   * here, a loop that reads as a rejected password.
   */
  if (forbidden && !everAuthenticated) {
    return <NoAccessScreen />
  }
  // Pre-desktop: this tab has never been signed in, so there is nothing to
  // keep alive — the sign-in hand-off is the only thing that exists.
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
          ) : /*
           * The session ended while the desktop was mounted. Uncovering
           * cannot help — there is nothing to uncover *to* — so this offers
           * the hand-off to Ward instead. The desktop stays mounted behind
           * it, so signing back in returns to a live terminal rather than a
           * fresh boot, which is the whole point of the overlay model. A grant
           * withdrawn meanwhile is the no-access screen instead, for the same
           * no-loop reason as before the desktop.
           */
          forbidden ? (
            <NoAccessScreen />
          ) : (
            <SignedOutScreen />
          )}
        </div>
      )}
    </>
  )
}
