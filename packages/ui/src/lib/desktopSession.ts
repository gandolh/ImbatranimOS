/**
 * The desktop session id: one random id per browser tab, kept in
 * `sessionStorage` so a reload keeps it and a new tab gets its own.
 *
 * It names the tab's Linux windows socket (`wayland-<id>` in the container).
 * The desktop's Linux windows connection opens that display under it, and the
 * Terminal sends it with its socket so a Linux app started in a shell shows
 * its windows in the tab that shell belongs to.
 */

const KEY = 'imbatranim:desktop-session'
const VALID = /^[A-Za-z0-9_-]{16,64}$/

/** Where the id lives when `sessionStorage` throws (some private modes). */
let fallback: string | null = null

function store(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function randomId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** This tab's id, made on first use. */
export function desktopSessionId(): string {
  try {
    const saved = store()?.getItem(KEY)
    if (saved && VALID.test(saved)) return saved
  } catch {
    /* fall through to the in-memory id */
  }
  if (fallback) return fallback
  return renewDesktopSessionId()
}

/**
 * Give this tab a new id. A duplicated tab starts with a copy of the
 * original's `sessionStorage`, so the server refuses its second use of the
 * id and the tab calls this.
 */
export function renewDesktopSessionId(): string {
  const id = randomId()
  fallback = id
  try {
    store()?.setItem(KEY, id)
  } catch {
    /* the in-memory id serves this page */
  }
  return id
}
