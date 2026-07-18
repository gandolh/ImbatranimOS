/** The HTTP verbs the request builder offers (mirrors the backend enum). */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/** One editable header row in the builder. Disabled rows are not sent. */
export interface HeaderRow {
  id: string
  name: string
  value: string
  enabled: boolean
}

/** Response shape returned by the backend proxy (POST /api/http/request). */
export interface ProxyResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  bodyBase64: string
  truncated: boolean
  elapsedMs: number
}

/** A request saved into a collection. */
export interface SavedRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: HeaderRow[]
  body: string
}

/** A bounded record of a past send. */
export interface HistoryEntry {
  id: string
  method: HttpMethod
  url: string
  status: number
  ts: number
}

/** The full persisted document (home FS: .config/rest-client/collections.json). */
export interface RestClientData {
  collections: SavedRequest[]
  history: HistoryEntry[]
}
