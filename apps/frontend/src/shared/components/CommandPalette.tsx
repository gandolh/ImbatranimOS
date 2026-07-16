import { useEffect, useRef, useState, useCallback } from 'react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  searchAllSources,
  activateItem,
  type CommandItem,
} from '../commands/CommandSourcesRegistry'
import { appsSource } from '../commands/appsSource'
import { recentFilesSource } from '../commands/recentFilesSource'
import { bookmarksSource } from '../commands/bookmarksSource'
import { registerCommandSource, COMMAND_SOURCES } from '../commands/CommandSourcesRegistry'

// Register sources once (guard against HMR double-registration)
if (!COMMAND_SOURCES.find((s) => s.group === appsSource.group)) {
  registerCommandSource(appsSource)
}
if (!COMMAND_SOURCES.find((s) => s.group === recentFilesSource.group)) {
  registerCommandSource(recentFilesSource)
}
if (!COMMAND_SOURCES.find((s) => s.group === bookmarksSource.group)) {
  registerCommandSource(bookmarksSource)
}

type Props = {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<CommandItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when palette opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      // small delay so the Dialog portal has painted
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  // Search whenever query changes
  useEffect(() => {
    if (!open) return

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await searchAllSources(query)
        setItems(results)
        setSelectedIndex(0)
      } finally {
        setLoading(false)
      }
    }, 80)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[selectedIndex]) {
          activateItem(items[selectedIndex])
          onClose()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [items, selectedIndex, onClose],
  )

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Group items by group label
  const grouped = items.reduce<Record<string, CommandItem[]>>((acc, item) => {
    ;(acc[item.group] ??= []).push(item)
    return acc
  }, {})

  return (
    <BaseDialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[900] bg-inverse-surface/20" />
        <BaseDialog.Popup
          className={cn(
            'fixed left-1/2 top-[20%] z-[901] -translate-x-1/2',
            'w-[600px] max-w-[calc(100vw-32px)]',
            'border-2 border-outline bg-surface-container-lowest',
            'outline-none',
            'font-[Space_Grotesk,sans-serif]',
          )}
          onKeyDown={handleKeyDown}
        >
          {/* Search input row */}
          <div className="flex items-center gap-2 border-b-2 border-outline-variant bg-surface-container-low px-3 py-2">
            <Search size={14} className="shrink-0 text-on-surface-variant" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps, files, bookmarks…"
              className={cn(
                'flex-1 bg-transparent outline-none',
                'font-[Space_Grotesk,sans-serif] text-[13px] text-on-surface',
                'placeholder:text-on-surface-variant',
              )}
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="border border-outline-variant bg-surface-container px-1 py-0.5 font-[Space_Grotesk,sans-serif] text-[11px] text-on-surface-variant">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading && items.length === 0 && (
              <div className="px-3 py-4 text-center font-[Space_Grotesk,sans-serif] text-[12px] text-on-surface-variant">
                Searching…
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="px-3 py-4 text-center font-[Space_Grotesk,sans-serif] text-[12px] text-on-surface-variant">
                {query ? 'No results.' : 'Type to search.'}
              </div>
            )}

            {items.length > 0 && (
              <ul ref={listRef} role="listbox" aria-label="Command palette results">
                {Object.entries(grouped).map(([group, groupItems]) => {
                  const groupStartIndex = items.indexOf(groupItems[0])
                  return (
                    <li key={group} role="presentation">
                      {/* Group header */}
                      <div className="border-b border-outline-variant bg-surface-container px-3 py-1 font-[Space_Grotesk,sans-serif] text-[10px] font-semibold tracking-widest text-on-surface-variant uppercase">
                        {group}
                      </div>
                      {/* Group items */}
                      {groupItems.map((item, localIdx) => {
                        const globalIdx = groupStartIndex + localIdx
                        const isSelected = globalIdx === selectedIndex
                        return (
                          <div
                            key={item.id}
                            role="option"
                            aria-selected={isSelected}
                            className={cn(
                              'flex cursor-pointer flex-col gap-0.5 px-3 py-2',
                              'border-b border-outline-variant/40',
                              isSelected
                                ? 'bg-primary text-on-primary'
                                : 'text-on-surface hover:bg-surface-container-low',
                            )}
                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                            onClick={() => {
                              activateItem(item)
                              onClose()
                            }}
                          >
                            <span className="font-[Space_Grotesk,sans-serif] text-[13px] font-medium leading-none">
                              {item.label}
                            </span>
                            {item.subtitle && (
                              <span
                                className={cn(
                                  'font-[Space_Grotesk,sans-serif] text-[11px] leading-none',
                                  isSelected ? 'text-on-primary/70' : 'text-on-surface-variant',
                                )}
                              >
                                {item.subtitle}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
