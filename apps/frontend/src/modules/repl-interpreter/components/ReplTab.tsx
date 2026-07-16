import { useEffect, useRef, useState, useCallback } from 'react'
import { cn } from '../../../lib/cn'
import { ScrollArea } from '../../../shared/components/ui/ScrollArea'
import { sendInput } from '../api/replApi'
import type { ReplConfig, ReplEntry } from '../types'

interface ReplTabProps {
  sessionId: string
  config: ReplConfig
  history: ReplEntry[]
  isPending: boolean
  onHistoryChange: (history: ReplEntry[]) => void
  onPendingChange: (pending: boolean) => void
}

export function ReplTab({
  sessionId,
  config,
  history,
  isPending,
  onHistoryChange,
  onPendingChange,
}: ReplTabProps) {
  const [inputValue, setInputValue] = useState('')
  const [sessionDead, setSessionDead] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const historyRef = useRef(history)

  useEffect(() => {
    historyRef.current = history
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  useEffect(() => {
    if (!isPending) {
      inputRef.current?.focus()
    }
  }, [isPending])

  const handleSubmit = useCallback(async () => {
    const command = inputValue.trim()
    if (!command || isPending || sessionDead) return

    setInputValue('')
    onPendingChange(true)

    // Show command immediately in history
    onHistoryChange([...historyRef.current, { command, output: '', isError: false }])

    try {
      const { output } = await sendInput(sessionId, command)
      const isError =
        output.includes('[session timed out]') ||
        output.includes('[process exited unexpectedly]') ||
        output.includes('[session not found]')
      // Replace the placeholder (last entry) with the real result
      const current = historyRef.current
      onHistoryChange([...current.slice(0, -1), { command, output, isError }])
      if (isError) setSessionDead(true)
    } catch {
      const current = historyRef.current
      onHistoryChange([
        ...current.slice(0, -1),
        { command, output: '[session not found]', isError: true },
      ])
      setSessionDead(true)
    } finally {
      onPendingChange(false)
    }
  }, [inputValue, isPending, sessionDead, sessionId, onHistoryChange, onPendingChange])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-outline-variant bg-surface-container-low shrink-0">
        <span className="inline-flex items-center px-2 py-0.5 border border-outline-variant bg-primary-container text-on-primary-container font-ui text-[11px] font-semibold">
          {config.prompt_prefix}
        </span>
        <span className="font-ui text-[13px] font-medium text-on-surface">{config.name}</span>
        {sessionDead && (
          <span className="ml-auto font-ui text-[11px] text-error">session ended</span>
        )}
      </div>

      {/* History */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {history.length === 0 && !isPending && (
            <div className="font-ui text-[12px] text-on-surface-variant opacity-50 py-4 text-center">
              Session started. Type a command below.
            </div>
          )}
          {history.map((entry, i) => (
            <div key={i} className="space-y-0.5">
              {/* Command line */}
              <div className="font-ui text-[13px] font-medium text-primary">
                {config.prompt_prefix} {entry.command}
              </div>
              {/* Output */}
              {entry.output && (
                <pre
                  className={cn(
                    'text-[13px] font-content whitespace-pre-wrap break-words leading-snug',
                    entry.isError ? 'text-error' : 'text-on-surface-variant',
                  )}
                >
                  {entry.output}
                </pre>
              )}
            </div>
          ))}
          {isPending && (
            <div className="font-ui text-[11px] text-on-surface-variant opacity-50">
              waiting...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input bar */}
      <div className="border-t border-outline-variant bg-surface-container flex items-center px-3 py-2 gap-2">
        <span className="font-ui text-[13px] font-medium text-on-surface-variant shrink-0">
          {config.prompt_prefix}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending || sessionDead}
          placeholder={sessionDead ? 'Session ended' : isPending ? '' : 'Enter command...'}
          className={cn(
            'flex-1 bg-transparent border-none outline-none font-ui text-[13px] text-on-surface',
            'placeholder:text-on-surface-variant/40',
            (isPending || sessionDead) && 'cursor-not-allowed',
          )}
          autoFocus
        />
      </div>
    </div>
  )
}
