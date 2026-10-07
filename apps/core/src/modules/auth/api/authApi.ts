import { api } from '../../../lib/axios'

/**
 * Who is signed in.
 *
 * The machine has one sign-in of its own (brief 152, the only one since
 * brief 157): a single owner, a password chosen on first run, and a session
 * cookie. `GET /identity` says whether the machine is claimed yet; `GET /me`
 * is the session probe.
 */

export interface Session {
  /** Stable for the owner. */
  subject: string
  username: string
}

export interface AuthStatus {
  authenticated: boolean
  session: Session | null
}

/** Probe the session through the backend's own guarded surface. */
export async function getStatus(): Promise<AuthStatus> {
  try {
    const res = await api.get<{ user: Session }>('/me')
    return { authenticated: true, session: res.data.user }
  } catch {
    return { authenticated: false, session: null }
  }
}

/** Whether an owner exists, and whether claiming needs the operator's token. */
export interface Identity {
  setUp: boolean
  setupTokenRequired: boolean
}

/** Public: asked before anybody is signed in. */
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
