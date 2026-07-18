import { Button, Input, Select, cn } from '@imbatranim/core'
import { Plus, Save, Send, Trash2 } from 'lucide-react'
import type { HeaderRow, HttpMethod } from '../types'
import { METHOD_OPTIONS, emptyHeaderRow } from '../lib/ui'

type BuilderTab = 'headers' | 'body'

interface RequestBuilderProps {
  method: HttpMethod
  url: string
  headers: HeaderRow[]
  body: string
  tab: BuilderTab
  loading: boolean
  onMethodChange: (m: HttpMethod) => void
  onUrlChange: (u: string) => void
  onHeadersChange: (h: HeaderRow[]) => void
  onBodyChange: (b: string) => void
  onTabChange: (t: BuilderTab) => void
  onSend: () => void
  onSave: () => void
}

export function RequestBuilder({
  method,
  url,
  headers,
  body,
  tab,
  loading,
  onMethodChange,
  onUrlChange,
  onHeadersChange,
  onBodyChange,
  onTabChange,
  onSend,
  onSave,
}: RequestBuilderProps) {
  const bodyDisabled = method === 'GET' || method === 'HEAD'

  const updateRow = (id: string, patch: Partial<HeaderRow>) =>
    onHeadersChange(headers.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const removeRow = (id: string) => onHeadersChange(headers.filter((r) => r.id !== id))
  const addRow = () => onHeadersChange([...headers, emptyHeaderRow()])

  const enabledCount = headers.filter((h) => h.enabled && h.name.trim()).length

  return (
    <div className="border-outline-variant flex flex-col gap-2 border-b p-2">
      {/* Method + URL + actions */}
      <form
        className="flex items-stretch gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onSend()
        }}
      >
        <Select
          options={METHOD_OPTIONS}
          value={method}
          onValueChange={(v) => onMethodChange(v as HttpMethod)}
          className="min-w-[7rem]"
        />
        <Input
          className="flex-1"
          placeholder="https://api.example.com/endpoint"
          value={url}
          spellCheck={false}
          onChange={(e) => onUrlChange(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={loading || !url.trim()}>
          <Send size={13} />
          {loading ? 'Sending…' : 'Send'}
        </Button>
        <Button type="button" variant="ghost" onClick={onSave} title="Save to collection">
          <Save size={13} />
        </Button>
      </form>

      {/* Tabs */}
      <div className="border-outline-variant flex gap-0 border-b">
        <TabButton active={tab === 'headers'} onClick={() => onTabChange('headers')}>
          Headers{enabledCount > 0 ? ` (${enabledCount})` : ''}
        </TabButton>
        <TabButton active={tab === 'body'} onClick={() => onTabChange('body')}>
          Body
        </TabButton>
      </div>

      {tab === 'headers' && (
        <div className="flex flex-col gap-1">
          {headers.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => updateRow(row.id, { enabled: e.target.checked })}
                className="accent-primary"
                aria-label="Enable header"
              />
              <Input
                className="flex-1"
                placeholder="Header"
                value={row.name}
                spellCheck={false}
                onChange={(e) => updateRow(row.id, { name: e.target.value })}
              />
              <Input
                className="flex-1"
                placeholder="Value"
                value={row.value}
                spellCheck={false}
                onChange={(e) => updateRow(row.id, { value: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(row.id)}
                title="Remove header"
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={addRow}>
            <Plus size={13} /> Add header
          </Button>
        </div>
      )}

      {tab === 'body' && (
        <textarea
          className={cn(
            'border-outline-variant bg-surface-container-lowest min-h-[7rem] w-full resize-y border px-2.5 py-1.5',
            'text-on-surface font-mono text-[12px] outline-none',
            'placeholder:text-on-surface-variant',
            'focus:border-primary disabled:cursor-not-allowed disabled:opacity-50'
          )}
          placeholder={bodyDisabled ? `${method} requests have no body` : '{ "key": "value" }'}
          value={body}
          spellCheck={false}
          disabled={bodyDisabled}
          onChange={(e) => onBodyChange(e.target.value)}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'font-ui cursor-pointer px-3 py-1.5 text-[12px] outline-none',
        '-mb-px border-b-2',
        active
          ? 'border-primary text-primary'
          : 'text-on-surface-variant hover:text-on-surface border-transparent'
      )}
    >
      {children}
    </button>
  )
}
