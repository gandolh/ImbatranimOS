/**
 * Body/base64 helpers. These live in a `.ts` module (never a component file)
 * so eslint's react-refresh/only-export-components rule stays happy.
 */

/** Decode a base64 string to raw bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Decode a base64 body to UTF-8 text (best-effort; never throws). */
export function base64ToText(b64: string): string {
  if (!b64) return ''
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(base64ToBytes(b64))
  } catch {
    return ''
  }
}

/**
 * Pretty-print a decoded body when it is JSON; otherwise return it unchanged.
 * Used by the response viewer so JSON APIs render readably.
 */
export function prettyBody(text: string, contentType?: string): string {
  const looksJson = contentType?.includes('json') || /^\s*[[{]/.test(text)
  if (!looksJson) return text
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** Human-readable byte size for the response meta line. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}
