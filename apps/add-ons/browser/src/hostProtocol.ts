/**
 * The messages between this window and the proxy origin's host page (brief 50).
 * The host's side is `apps/backend/src/modules/browser/static/host.js`; the two
 * must agree.
 *
 * The desktop checks every message's origin AND source before reading it:
 * proxied pages share the host page's origin, so the origin alone proves
 * nothing.
 */
export type ToHost =
  | { imb: 'start'; url: string; jar: string | null }
  | { imb: 'go'; url: string }
  | { imb: 'back' }
  | { imb: 'forward' }
  | { imb: 'reload' }
  | { imb: 'jar-clear' }

export type FromHost =
  | { imb: 'ready' }
  | { imb: 'url'; url: string }
  | { imb: 'title'; title: string }
  | { imb: 'jar'; jar: string }
  | { imb: 'error'; message: string }

export function parseFromHost(data: unknown): FromHost | null {
  if (!data || typeof data !== 'object') return null
  const m = data as Record<string, unknown>
  switch (m.imb) {
    case 'ready':
      return { imb: 'ready' }
    case 'url':
      return typeof m.url === 'string' ? { imb: 'url', url: m.url } : null
    case 'title':
      return typeof m.title === 'string' ? { imb: 'title', title: m.title } : null
    case 'jar':
      return typeof m.jar === 'string' ? { imb: 'jar', jar: m.jar } : null
    case 'error':
      return typeof m.message === 'string' ? { imb: 'error', message: m.message } : null
    default:
      return null
  }
}
