import { api } from '../../../lib/axios'

/**
 * Who is signed in, and where to send somebody who is not.
 *
 * ## imbatranimOS authenticates nobody now
 *
 * There is no `login`, `setupPassword`, `logout`, `changePassword` or TOTP
 * enrolment here. All of it is Ward's, at one login page for the estate. The
 * first-run wizard is gone with them: a machine is not claimed by whoever
 * reaches it first any more — an account gets an `imbatranimos` **grant** from
 * Ward's console, which is a deliberate act by an operator rather than a race.
 *
 * What is left is one read and two URLs.
 */

/** The estate's root for this app. Where Ward returns people to. */
const APP_ROOT = '/os/'

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
}

/**
 * Probe the session through the backend's own guarded surface.
 *
 * `GET /me` rather than a call to Ward: Ward answers with the whole estate's
 * grant map, and this browser has no business receiving somebody's atrium roles
 * to render a username. The backend translates and answers narrowly.
 */
export async function getStatus(): Promise<AuthStatus> {
  try {
    const res = await api.get<{ user: Session }>('/me')
    return { authenticated: true, session: res.data.user, unavailable: false }
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    // 503 is the guard failing closed on an unreachable Ward. 401 and 403 are
    // both "you cannot use this app"; the 403 case is a live session with no
    // grant, and it is the backend's log — not this screen — that distinguishes
    // them, because the person can do nothing different about either.
    if (status === 503) return { authenticated: false, session: null, unavailable: true }
    return { authenticated: false, session: null, unavailable: false }
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
