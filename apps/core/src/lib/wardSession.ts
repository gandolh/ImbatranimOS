/**
 * Keeping the Ward session alive (brief 144).
 *
 * Ward's access token and its `ward_session` cookie live 15 minutes. Renewal is
 * `POST /ward-api/refresh`, authenticated by the `ward_refresh` cookie, which is
 * scoped to that exact path and rotated on every use. Ward expects clients to
 * refresh; before this module nothing here did, so every 15 minutes the desktop
 * dropped behind the sign-in cover and the way back was a full page load that
 * cost every terminal, unsaved buffer and window.
 *
 * Two things use it: the axios interceptor (`axios.ts`) refreshes on a 401 and
 * retries once, and a timer refreshes about a minute before expiry, so a user
 * rarely meets a 401 at all and long-lived connections (the Terminal's
 * WebSocket, brief 145) keep a live cookie.
 */

/** Origin-absolute on purpose: Ward is mounted beside the app, not under `VITE_API_URL`. */
const REFRESH_PATH = '/ward-api/refresh'
/** Refresh this long before the access token expires. */
const LEAD_MS = 60_000
/**
 * The access token's lifetime when nothing better is known. A page load cannot
 * read the HttpOnly cookie's expiry; a refresh response says it outright.
 */
const ASSUMED_TTL_MS = 15 * 60_000
/** After a refresh that could not reach Ward, try again this soon. */
const RETRY_MS = 30_000

/** Dispatched on `window` after every successful refresh. */
export const WARD_REFRESHED_EVENT = 'auth:refreshed'

let inFlight: Promise<boolean> | null = null
let dueAt: number | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let running = false

/**
 * Renew the session. Single-flight: concurrent callers (ten requests that all
 * met the same expired cookie) share one request, which matters because each
 * refresh rotates the token.
 *
 * Resolves `true` when Ward issued fresh cookies and `false` when the refresh
 * family is dead (401/403) or there is no Ward at this origin to ask (404).
 * Throws on a network error or a 5xx: an unreachable Ward is not a sign-out,
 * and must not be reported as one.
 */
export function refreshWardSession(): Promise<boolean> {
  inFlight ??= doRefresh().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function doRefresh(): Promise<boolean> {
  const res = await fetch(REFRESH_PATH, { method: 'POST', credentials: 'include' })
  if (res.ok) {
    let expiresAt: number | undefined
    try {
      const body = (await res.json()) as { accessTokenExpiresAt?: unknown }
      if (typeof body.accessTokenExpiresAt === 'string') {
        expiresAt = Date.parse(body.accessTokenExpiresAt)
      }
    } catch {
      // The cookies are what matter; the expiry only tunes the timer.
    }
    noteSessionFresh(expiresAt)
    window.dispatchEvent(new CustomEvent(WARD_REFRESHED_EVENT))
    return true
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) return false
  throw new Error(`Ward's refresh answered ${res.status}`)
}

/**
 * Record that the session was just confirmed (a sign-in probe or a refresh),
 * and schedule the next proactive refresh from it.
 */
export function noteSessionFresh(expiresAt?: number): void {
  dueAt =
    expiresAt !== undefined && Number.isFinite(expiresAt)
      ? expiresAt - LEAD_MS
      : Date.now() + ASSUMED_TTL_MS - LEAD_MS
  schedule()
}

function schedule(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  if (!running || dueAt === null) return
  timer = setTimeout(proactive, Math.max(0, dueAt - Date.now()))
}

function proactive(): void {
  // A hidden tab's timers are throttled anyway; it catches up when shown.
  if (document.visibilityState === 'hidden') return
  refreshWardSession().catch(() => {
    // Ward unreachable: no verdict. Try again soon; a 401 meanwhile is still
    // handled by the interceptor.
    dueAt = Date.now() + RETRY_MS
    schedule()
  })
  // A `false` needs nothing here: the session ends at its own expiry, and the
  // next request's 401 covers the desktop then, not a minute early.
}

function onVisible(): void {
  if (document.visibilityState !== 'visible') return
  if (dueAt !== null && Date.now() >= dueAt) proactive()
}

/** Start the proactive refresh for this tab. Returns its stop function. */
export function startProactiveRefresh(): () => void {
  running = true
  document.addEventListener('visibilitychange', onVisible)
  schedule()
  return () => {
    running = false
    document.removeEventListener('visibilitychange', onVisible)
    schedule()
  }
}

/** Test seam: forget every in-flight request and timer. */
export function resetWardSessionForTest(): void {
  inFlight = null
  dueAt = null
  running = false
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  document.removeEventListener('visibilitychange', onVisible)
}
