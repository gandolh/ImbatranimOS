import { notify } from '@imbatranim/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RequestBuilder } from './components/RequestBuilder'
import { ResponseViewer } from './components/ResponseViewer'
import { Sidebar } from './components/Sidebar'
import { sendProxyRequest } from './api/httpProxyApi'
import { loadData, saveData } from './api/collectionsApi'
import type {
  HeaderRow,
  HistoryEntry,
  HttpMethod,
  ProxyResponse,
  RestClientData,
  SavedRequest,
} from './types'
import { emptyHeaderRow, headersToRecord, newId } from './lib/ui'

type BuilderTab = 'headers' | 'body'

/** Pull a readable message out of an axios-style error without importing axios. */
function extractError(err: unknown): string {
  const e = err as { response?: { data?: { message?: unknown } }; message?: string }
  const apiMsg = e?.response?.data?.message
  if (typeof apiMsg === 'string') return apiMsg
  if (Array.isArray(apiMsg)) return apiMsg.join(', ')
  return e?.message ?? 'Request failed'
}

export function RestApiClient(_props: { windowId: string }) {
  const [method, setMethod] = useState<HttpMethod>('GET')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<HeaderRow[]>([emptyHeaderRow()])
  const [body, setBody] = useState('')
  const [builderTab, setBuilderTab] = useState<BuilderTab>('headers')

  const [response, setResponse] = useState<ProxyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [data, setData] = useState<RestClientData>({ collections: [], history: [] })
  // Latest data ref so callbacks read the current snapshot without re-binding.
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Load persisted collections/history from the home FS on mount.
  useEffect(() => {
    let alive = true
    void loadData().then((loaded) => {
      if (alive) setData(loaded)
    })
    return () => {
      alive = false
    }
  }, [])

  const persist = useCallback((next: RestClientData) => {
    setData(next)
    void saveData(next).catch((err) =>
      notify({ level: 'error', title: 'Save failed', body: extractError(err) })
    )
  }, [])

  // Prepend a bounded history entry (persistence flows through `persist`).
  const recordHistory = useCallback(
    (status: number) => {
      const entry: HistoryEntry = { id: newId(), method, url: url.trim(), status, ts: Date.now() }
      persist({
        collections: dataRef.current.collections,
        history: [entry, ...dataRef.current.history].slice(0, 50),
      })
    },
    [method, url, persist]
  )

  const handleSend = useCallback(async () => {
    if (!url.trim() || loading) return
    setLoading(true)
    setError(null)
    setResponse(null)
    try {
      const res = await sendProxyRequest({
        method,
        url: url.trim(),
        headers: headersToRecord(headers),
        body: method === 'GET' || method === 'HEAD' ? undefined : body || undefined,
      })
      setResponse(res)
      recordHistory(res.status)
    } catch (err) {
      setError(extractError(err))
      recordHistory(0)
    } finally {
      setLoading(false)
    }
  }, [method, url, headers, body, loading, recordHistory])

  const handleSave = useCallback(() => {
    if (!url.trim()) return
    const saved: SavedRequest = {
      id: newId(),
      name: url.trim(),
      method,
      url: url.trim(),
      headers,
      body,
    }
    persist({
      collections: [...dataRef.current.collections, saved],
      history: dataRef.current.history,
    })
    notify({ level: 'success', title: 'Saved to collection' })
  }, [method, url, headers, body, persist])

  const openSaved = useCallback((req: SavedRequest) => {
    setMethod(req.method)
    setUrl(req.url)
    setHeaders(req.headers.length ? req.headers : [emptyHeaderRow()])
    setBody(req.body)
    setResponse(null)
    setError(null)
  }, [])

  const deleteSaved = useCallback(
    (id: string) => {
      persist({
        collections: dataRef.current.collections.filter((c) => c.id !== id),
        history: dataRef.current.history,
      })
    },
    [persist]
  )

  const openHistory = useCallback((entry: HistoryEntry) => {
    setMethod(entry.method)
    setUrl(entry.url)
    setResponse(null)
    setError(null)
  }, [])

  return (
    <div className="bg-surface text-on-surface font-content flex h-full min-h-0 w-full">
      <Sidebar
        data={data}
        onOpenSaved={openSaved}
        onDeleteSaved={deleteSaved}
        onOpenHistory={openHistory}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <RequestBuilder
          method={method}
          url={url}
          headers={headers}
          body={body}
          tab={builderTab}
          loading={loading}
          onMethodChange={setMethod}
          onUrlChange={setUrl}
          onHeadersChange={setHeaders}
          onBodyChange={setBody}
          onTabChange={setBuilderTab}
          onSend={handleSend}
          onSave={handleSave}
        />
        <ResponseViewer response={response} error={error} loading={loading} />
      </div>
    </div>
  )
}
