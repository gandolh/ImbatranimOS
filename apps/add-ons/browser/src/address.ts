/**
 * What the address bar typed means (brief 50): a URL to open, or a search.
 *
 * Only `http:` and `https:` ever leave here. A `javascript:`, `data:` or
 * `file:` address is a search for those words, never a navigation: the proxy
 * frame shares an origin with every proxied page, and the Browser has no
 * business opening local files.
 */
export const SEARCH_URL = 'https://www.google.com/search?q='

/** A bare host the user meant as an address: a dotted name, optionally a port and path, no spaces. */
const HOSTLIKE = /^[^\s/?#]+\.[^\s/?#]+(?::\d+)?(?:[/?#]\S*)?$/

export function toAddress(input: string): string | null {
  const text = input.trim()
  if (text === '') return null
  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).href
    } catch {
      return SEARCH_URL + encodeURIComponent(text)
    }
  }
  if (!/\s/.test(text) && !/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text) && HOSTLIKE.test(text)) {
    try {
      return new URL(`https://${text}`).href
    } catch {
      // fall through to a search
    }
  }
  return SEARCH_URL + encodeURIComponent(text)
}

/** True for a URL the Browser may be asked to open from elsewhere (an intent). */
export function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
