import { create } from 'zustand'
import { getIdentity, getStatus, type Identity, type Session } from '../api/authApi'

/**
 * Who is signed in, and whether the screen is covered.
 *
 * ## `locked` is a privacy screen, not a lock
 *
 * Covering the desktop ends **nothing**: it stays mounted, PTY sockets stay
 * open, dirty editor buffers survive (brief 101). Dismissing the cover asks
 * only that the session is still live. That is a screensaver, not a lock. It
 * is worth keeping (walking away from a shared room and coming back to a live
 * terminal is the real use), but it must not be described as security, and
 * the cover's copy says so plainly. A real lock would re-prove the password
 * without leaving the page; nothing asks for that yet.
 */
interface AuthState {
  /** True once the initial probe has completed (avoids a flash of the cover). */
  ready: boolean
  authenticated: boolean
  /** The signed-in person, for the shell to render. Null when nobody is. */
  session: Session | null
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
  /** Whether the machine is claimed yet (brief 152). Null until the first probe answers. */
  identity: Identity | null
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
  locked: false,
  everAuthenticated: false,
  identity: null,
  refresh: async () => {
    // Both at once: a signed-out person sees the setup or the sign-in form.
    const [status, identity] = await Promise.all([getStatus(), getIdentity().catch(() => null)])
    set((prev) => ({
      identity: identity ?? prev.identity,
      ready: true,
      authenticated: status.authenticated,
      session: status.session,
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
