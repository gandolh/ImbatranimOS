import { useEffect, useMemo, useRef, useState } from 'react'
import { ContextMenu } from '@imbatranim/ui'
import { motion } from 'framer-motion'
import { History, Lock, LogOut, Power, Search, Trash2 } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useEnabledApps } from '../../registry/enabledApps'
import type { AppConfig } from '../../registry/registry'
import {
  activateItem,
  searchAllSources,
  type CommandItem,
} from '../../commands/CommandSourcesRegistry'
import { rankApps } from '../../commands/coreSources'
import { useStartPinsStore } from '../../store/startPinsStore'
import { Logo } from '../brand/Logo'
import { useAuthStore } from '../../../modules/auth/store/authStore'
import { clearLayout, useWindowStore } from '../../store/windowStore'
import { localSignOut } from '../../../modules/auth/api/authApi'
import { clearRecentFiles, useRecentFilesQuery } from '../../../lib/recentFiles'
import { openApp } from '../../intents/openApp'
import { launchLinuxApp, linuxLauncherActions } from '../../../modules/linux-windows/launchers'

const NAV = '[data-start-nav]'

/** A touch screen: Start must not raise the phone's keyboard on its own. */
function isTouchDevice(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

function letterOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

const entryClass = cn(
  'group rounded-item text-left outline-none',
  'hover:bg-primary-container hover:text-on-primary-container',
  'focus-visible:bg-primary-container focus-visible:text-on-primary-container'
)

type StartMenuProps = {
  onClose: () => void
  onOpenApp: (appId: string) => void
  anchorRef: React.RefObject<HTMLElement | null>
}

export function StartMenu({ onClose, onOpenApp, anchorRef }: StartMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const lock = useAuthStore((s) => s.lock)
  const resetToLoggedOut = useAuthStore((s) => s.resetToLoggedOut)
  const enabledApps = useEnabledApps()
  const pins = useStartPinsStore((s) => s.pins)
  const pinApp = useStartPinsStore((s) => s.pin)
  const unpinApp = useStartPinsStore((s) => s.unpin)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ for: string; items: CommandItem[] }>({
    for: '',
    items: [],
  })
  const searching = query.trim() !== ''
  const pinned = useMemo(
    () =>
      pins
        .map((id) => enabledApps.find((a) => a.id === id))
        .filter((a): a is AppConfig => a !== undefined),
    [pins, enabledApps]
  )
  const atoz = useMemo(() => {
    const sorted = [...enabledApps].sort((a, b) => a.name.localeCompare(b.name))
    const groups: { letter: string; apps: AppConfig[] }[] = []
    for (const app of sorted) {
      const letter = letterOf(app.name)
      const last = groups[groups.length - 1]
      if (last?.letter === letter) last.apps.push(app)
      else groups.push({ letter, apps: [app] })
    }
    // Names that start with a symbol or digit sit under # at the end.
    return [...groups.filter((g) => g.letter !== '#'), ...groups.filter((g) => g.letter === '#')]
  }, [enabledApps])
  // Entries for disabled apps are filtered at render (no app to show an icon
  // for, and openApp would refuse them anyway). Six is a glance, not a list.
  const { data: recentFiles } = useRecentFilesQuery()
  const recent = (recentFiles ?? []).slice(0, 6)
  // An entry's own menu: a Linux app's desktop actions (Firefox's New Window).
  const [entryMenu, setEntryMenu] = useState<{ appId: string; x: number; y: number } | null>(null)

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      // An entry's menu draws outside Start (in a portal) and handles its own
      // dismissal; a press in it must not close Start under it.
      if (entryMenu) return
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !entryMenu) onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, anchorRef, entryMenu])

  // Move focus into the menu on open and restore it to the trigger on close, so
  // the menu is operable and the keyboard user is not stranded when it dismisses.
  useEffect(() => {
    const trigger = anchorRef.current
    // A physical keyboard types straight into the search; a touch device waits
    // for a tap so the phone's keyboard does not cover Start.
    if (isTouchDevice())
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    else searchRef.current?.focus()
    return () => trigger?.focus()
  }, [anchorRef])

  // Search the palette's sources; a newer query supersedes an older answer.
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let stale = false
    const t = setTimeout(() => {
      void searchAllSources(q).then((items) => {
        if (!stale) setResults({ for: query, items: rankApps(items).slice(0, 12) })
      })
    }, 80)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [query])

  function openResult(item: CommandItem) {
    if (item.group === 'Apps') onOpenApp(item.id.replace(/^app:/, ''))
    else activateItem(item)
    onClose()
  }

  async function openTopResult() {
    const q = query.trim()
    if (!q) return
    const items =
      results.for === query ? results.items : rankApps(await searchAllSources(q)).slice(0, 12)
    if (items[0]) openResult(items[0])
  }

  // Roving focus across the search field and every entry, in the order they
  // are drawn (search, results, grid, list, recent, session). Arrow keys wrap;
  // Home/End jump, except inside the search field where they move the caret.
  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(NAV) ?? [])
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    const inSearch = document.activeElement === searchRef.current
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[current < 0 ? 0 : (current + 1) % items.length].focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length].focus()
    } else if (e.key === 'Home' && !inSearch) {
      e.preventDefault()
      items[0].focus()
    } else if (e.key === 'End' && !inSearch) {
      e.preventDefault()
      items[items.length - 1].focus()
    }
  }

  // Every entry has a menu: Open, pin or unpin, then a Linux app's own actions.
  function openEntryMenu(e: React.MouseEvent, appId: string) {
    e.preventDefault()
    setEntryMenu({ appId, x: e.clientX, y: e.clientY })
  }

  // Lock: cover the screen. The session stays valid and the desktop stays
  // mounted beneath the overlay — shells and buffers survive.
  function handleLock() {
    lock()
    onClose()
  }

  /**
   * End the session and come back to the sign-in screen.
   *
   * The local teardown happens first, and the order matters: whatever this tab
   * is holding (open windows, the saved layout) should not be waiting when
   * somebody signs back in. That is the deliberate contrast with the screen
   * cover.
   */
  function handleLogout() {
    onClose()
    useWindowStore.setState({ windows: [] })
    clearLayout()
    resetToLoggedOut()
    void localSignOut().finally(() => window.location.reload())
  }

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      role="menu"
      aria-label="Start menu"
      onKeyDown={handleMenuKeyDown}
      className={cn(
        'absolute bottom-full left-0 z-[9001] mb-1 flex w-[320px] max-w-[calc(100vw-16px)] flex-col',
        // Apricot's menu floats clear of the taskbar and the screen's edge.
        'apricot:left-2 apricot:mb-2 rounded-menu overflow-hidden',
        'border-outline-variant bg-surface-container-low border',
        'shadow-(--k-shadow-menu)'
      )}
    >
      {/* Brand header */}
      <div className="border-outline-variant bg-surface-container flex items-center gap-2.5 border-b px-4 py-3">
        <Logo size={26} className="text-on-surface" />
        <div className="leading-tight">
          <div className="text-on-surface text-[13px] font-bold tracking-tight">
            Imbatranim<span className="text-primary">OS</span>
          </div>
          <div className="text-on-surface-variant text-[10px]">Signed in</div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-2.5 pb-1.5">
        <label className="border-outline-variant bg-surface-container-lowest rounded-control focus-within:ring-primary flex items-center gap-2 border px-2.5 py-1.5 focus-within:ring-2">
          <Search size={13} strokeWidth={1.75} className="text-on-surface-variant shrink-0" />
          <input
            ref={searchRef}
            data-start-nav
            type="search"
            role="searchbox"
            aria-label="Search apps and files"
            placeholder="Search apps and files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void openTopResult()
              }
            }}
            className="text-on-surface placeholder:text-on-surface-variant min-w-0 flex-1 bg-transparent text-[12px] outline-none"
          />
        </label>
      </div>

      <div className="apricot:px-1.5 flex max-h-[52vh] flex-col overflow-y-auto py-1">
        {searching ? (
          <div role="group" aria-label="Search results">
            {results.for !== query ? null : results.items.length === 0 ? (
              <div className="text-on-surface-variant px-4 py-3 text-[11px]">Nothing found</div>
            ) : (
              results.items.map((item) => {
                const app =
                  item.group === 'Apps'
                    ? enabledApps.find((a) => a.id === item.id.replace(/^app:/, ''))
                    : undefined
                const Icon = app?.icon
                return (
                  <button
                    key={item.id}
                    role="menuitem"
                    data-start-nav
                    data-start-result={item.id}
                    onClick={() => openResult(item)}
                    className={cn(entryClass, 'flex w-full items-center gap-3 px-4 py-1.5')}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                      {Icon && <Icon size={15} strokeWidth={1.75} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium">{item.label}</span>
                      <span className="text-on-surface-variant group-hover:text-on-primary-container/80 block truncate text-[10px]">
                        {item.subtitle ?? item.group}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div role="group" aria-label="Pinned" className="px-2 pb-1">
                <div className="text-on-surface-variant px-2 pt-1 pb-1 text-[9px] font-semibold tracking-widest uppercase">
                  Pinned
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {pinned.map((app) => {
                    const Icon = app.icon
                    return (
                      <button
                        key={app.id}
                        role="menuitem"
                        data-start-nav
                        data-start-entry={app.id}
                        data-start-pinned=""
                        onClick={() => {
                          onOpenApp(app.id)
                          onClose()
                        }}
                        onContextMenu={(e) => openEntryMenu(e, app.id)}
                        className={cn(
                          entryClass,
                          'flex flex-col items-center gap-1 px-1 py-2 text-center'
                        )}
                      >
                        <span className="border-outline-variant bg-surface-container-lowest rounded-control flex h-8 w-8 items-center justify-center border group-hover:border-transparent group-hover:bg-white/15">
                          <Icon size={18} strokeWidth={1.75} />
                        </span>
                        <span className="w-full truncate text-[11px] font-medium">{app.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {atoz.map(({ letter, apps }) => (
              <div key={letter} role="group" aria-label={letter}>
                <div
                  aria-hidden
                  className="text-on-surface-variant px-4 pt-1.5 pb-0.5 text-[9px] font-semibold tracking-widest uppercase"
                >
                  {letter}
                </div>
                {apps.map((app) => {
                  const Icon = app.icon
                  return (
                    <button
                      key={app.id}
                      role="menuitem"
                      data-start-nav
                      data-start-entry={app.id}
                      data-start-list=""
                      onClick={() => {
                        onOpenApp(app.id)
                        onClose()
                      }}
                      onContextMenu={(e) => openEntryMenu(e, app.id)}
                      className={cn(entryClass, 'flex w-full items-center gap-3 px-4 py-1.5')}
                    >
                      <span className="border-outline-variant bg-surface-container-lowest rounded-control flex h-7 w-7 shrink-0 items-center justify-center border group-hover:border-transparent group-hover:bg-white/15">
                        <Icon size={16} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium">{app.name}</span>
                        <span className="text-on-surface-variant group-hover:text-on-primary-container/80 block truncate text-[10px]">
                          {app.description}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Recent files — hidden entirely while the list is empty */}
      {!searching && recent.length > 0 && (
        <div className="border-outline-variant apricot:px-1.5 border-t py-1">
          <div className="flex items-center justify-between px-4 pt-1 pb-0.5">
            <span className="text-on-surface-variant flex items-center gap-1.5 text-[9px] font-semibold tracking-widest uppercase">
              <History size={10} strokeWidth={2} />
              Recent
            </span>
            <button
              type="button"
              aria-label="Clear recent files"
              title="Clear recent files"
              onClick={() => void clearRecentFiles()}
              className="text-on-surface-variant hover:text-on-surface focus-visible:ring-primary outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              <Trash2 size={11} strokeWidth={1.75} />
            </button>
          </div>
          {recent.map((f) => {
            const app = enabledApps.find((a) => a.id === f.appId)
            if (!app) return null
            const Icon = app.icon
            return (
              <button
                key={`${f.root}:${f.path}`}
                role="menuitem"
                data-start-nav
                onClick={() => {
                  openApp(f.appId, { openPath: f.path, root: f.root })
                  onClose()
                }}
                className={cn(
                  'group rounded-item flex w-full items-center gap-3 px-4 py-1 text-left outline-none',
                  'hover:bg-primary-container hover:text-on-primary-container',
                  'focus-visible:bg-primary-container focus-visible:text-on-primary-container'
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <Icon size={13} strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px]">
                    {f.path.split('/').pop() ?? f.path}
                  </span>
                  <span className="text-on-surface-variant group-hover:text-on-primary-container/80 block truncate text-[9px]">
                    {f.path}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Session actions */}
      <div className="border-outline-variant bg-surface-container flex items-stretch border-t">
        <button
          role="menuitem"
          data-start-nav
          onClick={handleLock}
          className="text-on-surface hover:bg-surface-container-high focus-visible:ring-primary flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <Lock size={14} strokeWidth={1.75} />
          {/* "Cover", not "Lock": uncovering does not re-prove the password,
              so this hides the screen without protecting it. Calling it Lock
              would be a claim the app cannot honour (see `SessionScreens.tsx`). */}
          Cover screen
        </button>
        <div className="bg-outline-variant w-px" />
        <button
          role="menuitem"
          data-start-nav
          onClick={handleLogout}
          className="text-on-surface hover:bg-error hover:text-on-error focus-visible:ring-primary flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <LogOut size={14} strokeWidth={1.75} />
          Log off
        </button>
      </div>
      <div className="border-outline-variant text-on-surface-variant flex items-center justify-between border-t px-4 py-1.5 text-[9px] tracking-widest uppercase">
        <span>ImbatranimOS</span>
        <Power size={11} strokeWidth={1.75} className="opacity-60" />
      </div>
      {entryMenu && (
        <ContextMenu
          x={entryMenu.x}
          y={entryMenu.y}
          label={`Actions for ${enabledApps.find((a) => a.id === entryMenu.appId)?.name ?? 'app'}`}
          onClose={() => setEntryMenu(null)}
          items={[
            {
              label: 'Open',
              onSelect: () => {
                onOpenApp(entryMenu.appId)
                onClose()
              },
            },
            pins.includes(entryMenu.appId)
              ? { label: 'Unpin', onSelect: () => unpinApp(entryMenu.appId) }
              : { label: 'Pin to Start', onSelect: () => pinApp(entryMenu.appId) },
            ...(linuxLauncherActions(entryMenu.appId).length > 0
              ? [{ type: 'separator' as const }]
              : []),
            ...linuxLauncherActions(entryMenu.appId).map((a) => ({
              label: a.name,
              onSelect: () => {
                void launchLinuxApp(entryMenu.appId, a.id)
                onClose()
              },
            })),
          ]}
        />
      )}
    </motion.div>
  )
}
