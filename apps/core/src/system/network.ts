/**
 * The page's network primitives, as they were when core's entry started.
 *
 * Every app runs in the desktop's page, so any app may replace `fetch`,
 * `XMLHttpRequest`, `WebSocket` or `Headers` on the global object, and see
 * whatever goes through the replacement afterwards. Core keeps its own
 * references from before the first app module loads (this module is the first
 * import of core's entry), and sends every call that carries an app's token
 * through them only. An app that patches the globals then sees its own calls,
 * never another app's token.
 *
 * What this does not stop, as far as one page goes:
 * - a call with no token, which is the user's: any app can make one with the
 *   global `fetch` and the session cookie, and act as the user;
 * - an app reaching another app's `system` handle (through the DOM and
 *   React's internals) and calling it, so acting as that app without ever
 *   reading its token;
 * - an app rewriting the language's own built-ins (`Function.prototype`,
 *   `Object`, `Promise`, `JSON`) to watch values in flight inside the HTTP
 *   client, a token among them;
 * - anything that runs before core's entry (nothing does: the page loads
 *   core's bundle first).
 * The catalog's review and the trust prompt guard the rest.
 *
 * `XMLHttpRequest` and `WebSocket` are kept for the system calls that will
 * need them; the HTTP client uses `fetch` with `Request` and `Response`.
 */

const g = globalThis

export const network = Object.freeze({
  fetch: typeof g.fetch === 'function' ? g.fetch.bind(g) : undefined,
  Request: g.Request,
  Response: g.Response,
  Headers: g.Headers,
  XMLHttpRequest: g.XMLHttpRequest as typeof XMLHttpRequest | undefined,
  WebSocket: g.WebSocket as typeof WebSocket | undefined,
  getRandomValues:
    typeof g.crypto?.getRandomValues === 'function'
      ? g.crypto.getRandomValues.bind(g.crypto)
      : undefined,
})

/**
 * What axios's fetch adapter reads instead of the globals. One frozen object
 * for the page: axios caches its adapter per `fetch`/`Request`/`Response`
 * triple, so a new object per call would build a new adapter each time.
 */
export const NETWORK_ENV = Object.freeze({
  fetch: network.fetch,
  Request: network.Request,
  Response: network.Response,
})

const HEX = '0123456789abcdef'

/**
 * `bytes` random bytes as lowercase hex, from the captured generator. Built
 * with string indexing and `+` only, so no method an app could patch sees a
 * byte of it.
 */
export function randomHex(bytes: number): string {
  const getRandomValues = network.getRandomValues
  if (!getRandomValues) throw new Error('This browser has no crypto.getRandomValues')
  const buf = new Uint8Array(bytes)
  getRandomValues(buf)
  let out = ''
  for (let i = 0; i < bytes; i++) {
    const b = buf[i]
    out = out + HEX[b >> 4] + HEX[b & 15]
  }
  return out
}
