import type { HeaderRow, HttpMethod } from '../types'

/** Method options for the builder's Select. */
export const METHOD_OPTIONS: { value: HttpMethod; label: HttpMethod }[] = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'HEAD', label: 'HEAD' },
  { value: 'OPTIONS', label: 'OPTIONS' },
]

/** Short id for rows / saved requests / history. */
export function newId(): string {
  return crypto.randomUUID()
}

/** A blank enabled header row. */
export function emptyHeaderRow(): HeaderRow {
  return { id: newId(), name: '', value: '', enabled: true }
}

/** Token class for an HTTP status: 2xx ok, 3xx redirect, 4xx/5xx error. */
export function statusToken(status: number): string {
  if (status >= 200 && status < 300) return 'text-primary'
  if (status >= 300 && status < 400) return 'text-secondary'
  return 'text-error'
}

/** Collapse enabled header rows into the record the proxy expects. */
export function headersToRecord(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const name = row.name.trim()
    if (row.enabled && name) out[name] = row.value
  }
  return out
}
