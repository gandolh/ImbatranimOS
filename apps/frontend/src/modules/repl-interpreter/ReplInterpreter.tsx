import { useState, useCallback } from 'react'
import { cn } from '../../lib/cn'
import { deleteSession } from './api/replApi'
import { ConfigsTab } from './components/ConfigsTab'
import { ReplTab } from './components/ReplTab'
import type { ReplConfig, ReplEntry, ReplTabState } from './types'

export function ReplInterpreter({ windowId: _windowId }: { windowId: string }) {
  const [tabs, setTabs] = useState<ReplTabState[]>([])
  const [activeTabId, setActiveTabId] = useState<string | 'configs'>('configs')

  function handleStartSession(config: ReplConfig, sessionId: string) {
    const id = crypto.randomUUID()
    const newTab: ReplTabState = {
      id,
      sessionId,
      config,
      history: [],
      isPending: false,
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
  }

  async function handleCloseTab(tab: ReplTabState) {
    await deleteSession(tab.sessionId).catch(() => {})
    setTabs((prev) => prev.filter((t) => t.id !== tab.id))
    if (activeTabId === tab.id) {
      setActiveTabId('configs')
    }
  }

  const handleHistoryChange = useCallback(
    (tabId: string, history: ReplEntry[]) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, history } : t)),
      )
    },
    [],
  )

  const handlePendingChange = useCallback(
    (tabId: string, isPending: boolean) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, isPending } : t)),
      )
    },
    [],
  )

  const activeReplTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-end border-b border-outline-variant bg-surface-container-low shrink-0 overflow-x-auto">
        {/* Configs tab */}
        <button
          onClick={() => setActiveTabId('configs')}
          className={cn(
            'flex items-center px-4 py-2 font-ui text-[12px] font-medium shrink-0 border-r border-outline-variant transition-colors',
            activeTabId === 'configs'
              ? 'bg-surface-container-lowest text-on-surface border-t-2 border-t-primary'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
          )}
        >
          Configs
        </button>

        {/* REPL tabs */}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-r border-outline-variant shrink-0 transition-colors',
              activeTabId === tab.id
                ? 'bg-surface-container-lowest text-on-surface border-t-2 border-t-primary'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
            )}
          >
            <button
              onClick={() => setActiveTabId(tab.id)}
              className="font-ui text-[12px] font-medium"
            >
              {tab.config.name}
            </button>
            <button
              onClick={() => handleCloseTab(tab)}
              className="text-on-surface-variant hover:text-error transition-colors leading-none ml-1"
              title="Close session"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTabId === 'configs' || !activeReplTab ? (
          <ConfigsTab onStartSession={handleStartSession} />
        ) : (
          <ReplTab
            key={activeReplTab.id}
            sessionId={activeReplTab.sessionId}
            config={activeReplTab.config}
            history={activeReplTab.history}
            isPending={activeReplTab.isPending}
            onHistoryChange={(h) => handleHistoryChange(activeReplTab.id, h)}
            onPendingChange={(p) => handlePendingChange(activeReplTab.id, p)}
          />
        )}
      </div>
    </div>
  )
}
