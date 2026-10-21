import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, SHARED_KIT_VERSION, useConfirm } from '@imbatranim/ui'
import { api } from '../../lib/axios'
import { openApp } from '../../shared/intents/openApp'
import { useWindowStore } from '../../shared/store/windowStore'
import {
  descriptorIdOf,
  loadMarketplace,
  marketplaceIcon,
  useBuiltInClashes,
  type MarketplaceApp,
} from '../../shared/registry/marketplace'
import { ConsentCard, InstallFromUrl } from './InstallFromUrl'
import { apiMessage, sourceLine, type Inspection } from './urlApps'

/** Brief 158 adds these to the registry's type; narrowed here so this compiles either way. */

const JOB_LABEL: Record<NonNullable<MarketplaceApp['job']>['state'], string> = {
  queued: 'Waiting for another install…',
  fetching: 'Downloading the source…',
  building: 'Building…',
  failed: 'Install failed',
}

function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { message?: unknown } } }).response?.data
  return typeof data?.message === 'string' ? data.message : 'The request failed'
}

/**
 * One row of the pane: a URL app, or a catalog descriptor with its apps
 * (brief 162). The apps of one descriptor share its install, job, server and
 * log, so the row reads them from the first.
 */
type Row = {
  descriptorId: string
  /** The row's heading: the descriptor's name. */
  name: string
  apps: MarketplaceApp[]
  /** More than the one app a version 1 descriptor is: the apps are listed under the heading. */
  suite: boolean
}

function rowsOf(apps: MarketplaceApp[]): Row[] {
  const rows: Row[] = []
  const byDescriptor = new Map<string, Row>()
  for (const app of apps) {
    const descriptorId = descriptorIdOf(app)
    // A URL app is its own row, always: it is never part of a descriptor.
    const existing = app.runtime === 'sandboxed' ? undefined : byDescriptor.get(descriptorId)
    if (existing) {
      existing.apps.push(app)
      existing.suite = true
      continue
    }
    const row: Row = {
      descriptorId,
      name: app.descriptorName ?? app.name,
      apps: [app],
      suite: app.id !== descriptorId,
    }
    rows.push(row)
    if (app.runtime !== 'sandboxed') byDescriptor.set(descriptorId, row)
  }
  return rows
}

/**
 * Settings → Marketplace (brief 120): the apps the OS repo's catalog
 * describes, and installing, updating and removing them. Installing clones
 * the app's repository at the commit the catalog pins and builds it here, so
 * it takes a while; the list polls until it is done.
 *
 * One row per descriptor (brief 162): a suite's apps are installed, updated
 * and removed together, so its row carries those buttons once and lists its
 * apps under the heading, each with its own Open. Enabling and disabling an
 * app stays per app, in Settings → Apps.
 */
export function MarketplaceSettings() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['marketplace'],
    // Also syncs the desktop's registry, so a finished install shows in Start.
    queryFn: loadMarketplace,
    refetchInterval: (q) =>
      q.state.data?.apps.some((a) => a.job && a.job.state !== 'failed') ? 2000 : false,
  })
  const listing = query.data ?? null
  const [actionError, setActionError] = useState<string | null>(null)
  const error = actionError ?? (query.error ? errorMessage(query.error) : null)
  const [log, setLog] = useState<{ id: string; text: string } | null>(null)
  const { confirm, confirmDialog } = useConfirm()
  const clashes = useBuiltInClashes()

  const [update, setUpdate] = useState<{ id: string; inspection: Inspection } | null>(null)
  /** The URL app whose stored URL now resolves to a different app. */
  const [moved, setMoved] = useState<string | null>(null)
  const [rowNote, setRowNote] = useState<{ id: string; text: string } | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const note = (id: string, text: string) => {
    setRowNote({ id, text })
    clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => setRowNote(null), 4000)
  }

  const checkForUpdate = async (app: MarketplaceApp) => {
    if (!app.source) return
    setError(null)
    setMoved((id) => (id === app.id ? null : id))
    note(app.id, 'Checking…')
    try {
      const { data } = await api.post<Inspection>('/marketplace/url/inspect', {
        url: app.source.url,
      })
      const discard = () =>
        void Promise.resolve(api.delete(`/marketplace/url/pending/${data.pending}`)).catch(() => {})
      if (data.id !== app.id) {
        // The stored URL now resolves to another folder or app (its id is
        // derived from the source). A consent card in this row would read as
        // an update to this app while installing something else beside it.
        discard()
        setRowNote(null)
        setMoved(app.id)
      } else if (data.source.commit === app.source.commit) {
        discard()
        note(app.id, 'Up to date.')
      } else {
        setRowNote(null)
        setUpdate({ id: app.id, inspection: data })
      }
    } catch (err) {
      setRowNote(null)
      setError(apiMessage(err, "Couldn't reach that repository."))
    }
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['marketplace'] })
  const setError = setActionError

  const install = async (row: Row) => {
    try {
      await api.post(`/marketplace/apps/${row.descriptorId}/install`)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
    await refresh()
  }

  const uninstall = async (row: Row) => {
    const names = row.apps.map((a) => a.name).join(', ')
    const ok = await confirm({
      title: `Uninstall ${row.name}?`,
      message:
        row.apps[0].runtime === 'sandboxed'
          ? 'Its files are deleted and its window closes.'
          : row.suite
            ? `Its apps (${names}) go with it: the downloaded source and build are deleted, and their windows close. Anything they saved through the file system stays.`
            : 'Its downloaded source and build are deleted, and its window closes. Anything it saved through the file system stays.',
      confirmLabel: 'Uninstall',
      destructive: true,
    })
    if (!ok) return
    const ids = new Set(row.apps.map((a) => a.id))
    const { windows, closeWindow } = useWindowStore.getState()
    for (const w of windows) if (ids.has(w.appId)) closeWindow(w.id)
    try {
      await api.delete(`/marketplace/apps/${row.descriptorId}`)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
    if (log?.id === row.descriptorId) setLog(null)
    await refresh()
  }

  // An installed app whose stored record is damaged is not in the list, only
  // in `problems`; uninstalling it is the way out (the backend's own advice).
  const uninstallBroken = async (appId: string) => {
    const ok = await confirm({
      title: 'Uninstall this app?',
      message:
        'Its record on this machine is damaged. Its files are deleted and its windows close.',
      confirmLabel: 'Uninstall',
      destructive: true,
    })
    if (!ok) return
    const { windows, closeWindow } = useWindowStore.getState()
    for (const w of windows) if (w.appId === appId) closeWindow(w.id)
    try {
      await api.delete(`/marketplace/apps/${appId}`)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
    await refresh()
  }

  const showLog = async (descriptorId: string) => {
    if (log?.id === descriptorId) return setLog(null)
    try {
      const { data } = await api.get<string>(`/marketplace/apps/${descriptorId}/log`, {
        responseType: 'text',
      })
      setLog({ id: descriptorId, text: data || 'Nothing logged yet.' })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!listing) {
    return <p className="text-on-surface-variant text-[12px]">{error ?? 'Loading the catalog…'}</p>
  }

  const brokenApps = listing.problems.filter((p) => p.appId)
  const catalogProblems = listing.problems.filter((p) => !p.appId)

  return (
    <div>
      <InstallFromUrl onInstalled={() => void refresh()} />
      <p className="text-on-surface-variant mb-5 text-[12px]">
        Apps from other repositories, built on this machine from the exact commit the catalog names.
        An install downloads the source and runs its build, which can take minutes.
      </p>
      {error && <p className="text-error mb-3 text-[12px]">{error}</p>}
      {listing.apps.length === 0 && (
        <p className="text-on-surface-variant text-[12px]">
          The catalog is empty. Apps are added to it in the OS repository, under{' '}
          <code>marketplace/</code>.
        </p>
      )}
      <div className="grid gap-2">
        {rowsOf(listing.apps).map((row) => {
          // The apps of a descriptor share its install, job and server.
          const app = row.apps[0]
          const sandboxed = app.runtime === 'sandboxed' && !!app.source
          const Icon = marketplaceIcon(row.suite ? 'package' : app.icon)
          const installed = app.installed
          const missing = row.apps.some((a) => a.installed?.missing)
          const working = app.job && app.job.state !== 'failed'
          const outdated = installed && installed.ref !== app.ref
          // A kit app built for another shared kit will not open here (brief 163).
          const kitMismatch = row.apps.find(
            (a) => typeof a.sharedKit === 'number' && a.sharedKit !== SHARED_KIT_VERSION
          )?.sharedKit
          const clashing = (a: MarketplaceApp) => clashes.includes(a.id)
          const canOpen = (a: MarketplaceApp) =>
            !!a.installed && !a.installed.missing && !working && !clashing(a)
          let state: string
          if (working) state = JOB_LABEL[app.job!.state]
          else if (app.job?.state === 'failed')
            state = `${JOB_LABEL.failed}: ${app.job.reason ?? ''}`
          else if (kitMismatch !== undefined)
            state = `Needs an update: built for shared kit ${kitMismatch}, this desktop has ${SHARED_KIT_VERSION}`
          else if (!installed) state = 'Not installed'
          else if (missing) state = 'Its build is missing (restored from a backup?)'
          else if (outdated) state = 'An update is available'
          else state = `Installed · ${installed.ref.slice(0, 7)}`
          if (sandboxed) state = `Installed · ${app.source!.commit.slice(0, 7)} · sandboxed`
          else if (app.server.state === 'crashed') state = `Server stopped: ${app.server.reason}`
          return (
            <div
              key={row.descriptorId}
              // min-w-0: a grid item is as wide as its content by default, and
              // a long job reason would widen every row past the window.
              className="border-outline-variant bg-surface-container-low min-w-0 border px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span className="border-outline-variant bg-surface-container-lowest text-on-surface flex h-7 w-7 shrink-0 items-center justify-center border">
                  <Icon size={15} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-ui text-on-surface block truncate text-[13px] font-medium">
                    {row.name}
                    {sandboxed && (
                      <span className="text-on-surface-variant ml-2 text-[9px] font-semibold tracking-widest uppercase">
                        From a URL
                      </span>
                    )}
                    {row.suite && (
                      <span className="text-on-surface-variant ml-2 text-[9px] font-semibold tracking-widest uppercase">
                        {row.apps.length === 1 ? '1 app' : `${row.apps.length} apps`}
                      </span>
                    )}
                    {!sandboxed && app.type === 'service' && (
                      <span className="text-on-surface-variant ml-2 text-[9px] font-semibold tracking-widest uppercase">
                        With server
                      </span>
                    )}
                  </span>
                  <span
                    className="text-on-surface-variant block truncate text-[11px]"
                    title={state}
                    aria-live="polite"
                  >
                    {rowNote?.id === app.id ? rowNote.text : state}
                  </span>
                  {sandboxed && (
                    <span className="text-on-surface-variant/80 block truncate text-[10px]">
                      {sourceLine(app.source!)}
                    </span>
                  )}
                </span>
                {sandboxed ? (
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="primary" onClick={() => openApp(app.id)}>
                      Open
                    </Button>
                    <Button size="sm" onClick={() => void checkForUpdate(app)}>
                      Check for update
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void uninstall(row)}>
                      Uninstall
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 gap-1.5">
                    {!row.suite && canOpen(app) && (
                      <Button size="sm" variant="primary" onClick={() => openApp(app.id)}>
                        Open
                      </Button>
                    )}
                    {!working && (!installed || missing || outdated) && (
                      <Button
                        size="sm"
                        variant={installed ? 'default' : 'primary'}
                        onClick={() => void install(row)}
                      >
                        {!installed ? 'Install' : missing ? 'Reinstall' : 'Update'}
                      </Button>
                    )}
                    {(installed || app.job?.state === 'failed') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void showLog(row.descriptorId)}
                      >
                        Log
                      </Button>
                    )}
                    {(installed || app.job?.state === 'failed') && !working && (
                      <Button size="sm" variant="ghost" onClick={() => void uninstall(row)}>
                        {installed ? 'Uninstall' : 'Clear'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {moved === app.id && (
                <p className="text-on-surface mt-2 text-[11px]" role="status">
                  This URL now points to a different app. Install it from the field above if you
                  want it.
                </p>
              )}
              {update?.id === app.id && (
                <ConsentCard
                  inspection={update.inspection}
                  onCancel={() => setUpdate(null)}
                  onInstalled={() => {
                    setUpdate(null)
                    note(app.id, 'Updated.')
                    void refresh()
                  }}
                />
              )}
              {row.suite ? (
                <ul
                  className="border-outline-variant mt-2 grid border-t pt-1"
                  aria-label={`${row.name}'s apps`}
                >
                  {row.apps.map((a) => {
                    const AppIcon = marketplaceIcon(a.icon)
                    return (
                      <li key={a.id} className="flex min-h-7 min-w-0 items-center gap-2 py-0.5">
                        <AppIcon
                          size={12}
                          strokeWidth={1.75}
                          className="text-on-surface-variant shrink-0"
                        />
                        <span className="font-ui text-on-surface shrink-0 text-[12px] font-medium">
                          {a.name}
                        </span>
                        <span
                          className="text-on-surface-variant min-w-0 flex-1 truncate text-[11px]"
                          role={clashing(a) ? 'status' : undefined}
                        >
                          {clashing(a)
                            ? `A built-in app already has the id ${a.id}, so the built-in opens instead.`
                            : a.description}
                        </span>
                        {canOpen(a) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Open ${a.name}`}
                            onClick={() => openApp(a.id)}
                          >
                            Open
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <>
                  {!sandboxed && clashing(app) && (
                    <p className="text-on-surface mt-2 text-[11px]" role="status">
                      A built-in app already has the id <code>{app.id}</code>, so the built-in opens
                      instead.
                    </p>
                  )}
                  {app.description && (
                    <p className="text-on-surface-variant mt-2 text-[11px]">{app.description}</p>
                  )}
                </>
              )}
              {log?.id === row.descriptorId && (
                <pre className="border-outline-variant bg-surface-container-lowest text-on-surface custom-scrollbar mt-2 max-h-60 overflow-auto border p-2 text-[10px] whitespace-pre-wrap select-text">
                  {log.text}
                </pre>
              )}
            </div>
          )
        })}
      </div>
      {brokenApps.length > 0 && (
        <div className="mt-4">
          <p className="text-on-surface-variant mb-1 text-[11px] font-semibold">
            Installed apps that could not be read
          </p>
          <ul className="grid gap-1 text-[11px]">
            {brokenApps.map((p) => (
              <li key={p.file} className="text-on-surface-variant flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <code>{p.file}</code>: {p.problem}
                </span>
                <Button size="sm" variant="ghost" onClick={() => void uninstallBroken(p.appId!)}>
                  Uninstall
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {catalogProblems.length > 0 && (
        <div className="mt-4">
          <p className="text-on-surface-variant mb-1 text-[11px] font-semibold">
            Catalog entries that could not be read
          </p>
          <ul className="text-on-surface-variant list-disc pl-5 text-[11px]">
            {catalogProblems.map((p) => (
              <li key={p.file}>
                <code>{p.file}</code>: {p.problem}
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirmDialog}
    </div>
  )
}
