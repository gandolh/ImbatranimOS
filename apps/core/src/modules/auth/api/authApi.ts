import { api } from '../../../lib/axios'

/**
 * Who is signed in, and where to send somebody who is not.
 *
 * ## Two identities, one probe
 *
 * Inside the estate, identity is Ward's: sign-in, password and sign-out live
 * at one login page for every app, and an account gets an `imbatranim-os`
 * grant from Ward's console. Without Ward (a standalone run, a friend's
 * install, the server ISO), the backend runs its own single-owner sign-in
 * (brief 152, option C): a password chosen on first run and a session cookie.
 *
 * `GET /identity` says which. `GET /me` is the session probe in both modes,
 * because the backend's guard answers it the same way either way.
 */

/**
 * Where Ward returns people to: this app's root, from the build.
 *
 * `BASE_URL` is Vite's `base` — `/imbatranim-os/` in the deploy, and in local
 * dev when `VITE_BASE` says so. It used to be the literal `/os/`, which is not an
 * estate root, so Ward dropped it and landed people on `/` (brief 137). Ward's
 * `?next=` allowlist matches whole first segments, so this has to be the path the
 * app is really served under.
 */
const APP_ROOT = import.meta.env.BASE_URL

export interface Session {
  /** Ward's opaque subject — stable, never recycled. */
  subject: string
  username: string
}

export interface AuthStatus {
  authenticated: boolean
  session: Session | null
  /**
   * True when the backend could not reach Ward.
   *
   * **Deliberately distinct from `authenticated: false`.** Not knowing who
   * somebody is, is not the same as knowing they are nobody — and the
   * difference decides what the screen offers them. Sending somebody to a login
   * page served by the service that is currently down is a loop that reads as a
   * rejected password.
   */
  unavailable: boolean
  /**
   * True for a live Ward session holding no `imbatranim-os` grant: the guard's
   * 403. **Not "signed out"** — the person is signed in, and sending them back
   * through Ward's login only returns them here, which reads as a rejected
   * password. Only an operator issuing a grant resolves it.
   */
  forbidden: boolean
}

/**
 * Probe the session through the backend's own guarded surface.
 *
 * `GET /me` rather than a call to Ward: Ward answers with the whole estate's
 * grant map, and this browser has no business receiving somebody's atrium roles
 * to render a username. The backend translates and answers narrowly.
 */
export async function getStatus(): Promise<AuthStatus> {
  const outcome = { authenticated: false, session: null, unavailable: false, forbidden: false }
  try {
    const res = await api.get<{ user: Session }>('/me')
    return { ...outcome, authenticated: true, session: res.data.user }
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    // The guard's three refusals are three different things to tell somebody:
    // 503 is Ward not answering (retry), 403 is a live session without a grant
    // (ask for access, or switch account), and anything else is signed out.
    if (status === 503) return { ...outcome, unavailable: true }
    if (status === 403) return { ...outcome, forbidden: true }
    return outcome
  }
}

/**
 * Ward's login page, returning here afterwards.
 *
 * `next` is a **path**, never an absolute URL: Ward validates it against the
 * estate's own path roots and refuses anything absolute, including the estate's
 * own origin spelled out in full.
 */
export function wardLoginUrl(next: string = APP_ROOT): string {
  return `/ward/login?next=${encodeURIComponent(next)}`
}

/**
 * Ward's account page — where the password, TOTP and sign-out now live.
 *
 * This app must not offer a sign-out of its own: the session belongs to the
 * estate, so ending it here while atrium and prm still honoured it would be a
 * lie the cookie contradicts on the next request.
 */
export function wardAccountUrl(): string {
  return '/ward/account'
}

// ── The machine's own sign-in (brief 152) ─────────────────────────────────

export type IdentityMode = 'ward' | 'local'

export interface Identity {
  mode: IdentityMode
  /** Local mode only: whether an owner exists, and whether claiming needs the operator's token. */
  local?: { setUp: boolean; setupTokenRequired: boolean }
}

/** Which sign-in this machine uses. Public: asked before anybody is signed in. */
export async function getIdentity(): Promise<Identity> {
  const res = await api.get<Identity>('/identity')
  return res.data
}

/** The message the backend gave, for showing under a form. */
export function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: unknown } } }).response?.data
  const message = Array.isArray(data?.message) ? data.message[0] : data?.message
  return typeof message === 'string' && message ? message : fallback
}

/** Claim an unclaimed machine: the owner's name, password and, if required, the setup token. */
export async function localSetup(input: {
  username: string
  password: string
  setupToken?: string
}): Promise<void> {
  await api.post('/identity/local/setup', input)
}

export async function localSignIn(password: string): Promise<void> {
  await api.post('/identity/local/sign-in', { password })
}

export async function localSignOut(): Promise<void> {
  await api.post('/identity/local/sign-out')
}

export async function localChangePassword(current: string, next: string): Promise<void> {
  await api.post('/identity/local/password', { current, next })
}
