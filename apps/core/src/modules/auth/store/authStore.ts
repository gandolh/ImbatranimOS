import { create } from 'zustand'
import { getStatus, type Session } from '../api/authApi'

/**
 * Who is signed in, and whether the screen is covered.
 *
 * ## `locked` is a privacy screen now, not a lock — and the rename matters
 *
 * Before Ward, locking covered the desktop and unlocking re-proved the local
 * password. That was a genuine lock, and its value was that it ended **nothing**:
 * the desktop stayed mounted, PTY sockets stayed open, dirty editor buffers
 * survived (brief 101).
 *
 * There is no local password any more. The only credential is Ward's, and
 * re-proving it means navigating to Ward — which tears down the whole desktop
 * and so destroys the exact property the lock existed to protect.
 *
 * So the cover is kept and the claim is dropped: **`locked` obscures the
 * screen, and dismissing it requires only that the Ward session is still live.**
 * That is a screensaver, not a lock. It is worth keeping — walking away from a
 * shared room and coming back to a live terminal is the real use — but it must
 * not be described as security, and `SecurityScreen`'s copy says so plainly. If
 * a real lock is ever wanted, it needs something Ward does not offer today: a
 * re-authentication that does not leave the page.
 */
interface AuthState {
  /** True once the initial probe has completed (avoids a flash of the cover). */
  ready: boolean
  authenticated: boolean
  /** The signed-in person, for the shell to render. Null when nobody is. */
  session: Session | null
  /** True when the backend could not reach Ward — see `AuthStatus.unavailable`. */
  unavailable: boolean
  /** Signed in to Ward, but no grant for this app — see `AuthStatus.forbidden`. */
  forbidden: boolean
  /**
   * The screen is covered. Distinct from `!authenticated` on purpose: covering
   * must not end anything — the desktop stays mounted, PTY sockets stay open,
   * dirty buffers survive.
   */
  locked: boolean
  /**
   * True once THIS TAB has shown the desktop. It is what lets a later 401 be an
   * overlay over still-mounted windows instead of a full teardown — and it
   * leaks nothing, because everything beneath the overlay was already on this
   * screen before the session ended.
   */
  everAuthenticated: boolean
  /** Re-probe the backend (the source of truth). */
  refresh: () => Promise<void>
  /** Optimistically flip authentication (e.g. on a 401 => cover the screen). */
  setAuthenticated: (value: boolean) => void
  lock: () => void
  unlock: () => void
  /** Explicit sign-out: back to the full pre-desktop experience. */
  resetToLoggedOut: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  authenticated: false,
  session: null,
  unavailable: false,
  forbidden: false,
  locked: false,
  everAuthenticated: false,
  refresh: async () => {
    const status = await getStatus()
    set((prev) => ({
      ready: true,
      authenticated: status.authenticated,
      session: status.session,
      unavailable: status.unavailable,
      forbidden: status.forbidden,
      // Latches: once this tab has seen the desktop, it keeps the overlay model
      // until an explicit sign-out. `refresh` leaves `locked` alone — a status
      // poll must never uncover the screen.
      everAuthenticated: prev.everAuthenticated || status.authenticated,
    }))
  },
  setAuthenticated: (value) =>
    set((prev) => ({
      authenticated: value,
      everAuthenticated: prev.everAuthenticated || value,
    })),
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
  resetToLoggedOut: () =>
    set({
      authenticated: false,
      session: null,
      forbidden: false,
      locked: false,
      everAuthenticated: false,
    }),
}))

/**
 * True while the shell is visually suspended behind the cover — the one
 * question every keyboard chokepoint asks (brief 101). A hidden desktop must
 * eat no keys: a stray Delete may not remove a file nobody can see.
 */
export function isShellSuspended(): boolean {
  const s = useAuthStore.getState()
  return s.locked || (s.everAuthenticated && !s.authenticated)
}
