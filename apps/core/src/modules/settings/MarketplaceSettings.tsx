import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, useConfirm } from '@imbatranim/ui'
import { api } from '../../lib/axios'
import { openApp } from '../../shared/intents/openApp'
import { useWindowStore } from '../../shared/store/windowStore'
import {
  loadMarketplace,
  marketplaceIcon,
  type MarketplaceApp,
} from '../../shared/registry/marketplace'

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
 * Settings → Marketplace (brief 120): the apps the OS repo's catalog
 * describes, and installing, updating and removing them. Installing clones
 * the app's repository at the commit the catalog pins and builds it here, so
 * it takes a while; the list polls until it is done.
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['marketplace'] })
  const setError = setActionError

  const install = async (app: MarketplaceApp) => {
    try {
      await api.post(`/marketplace/apps/${app.id}/install`)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
    await refresh()
  }

  const uninstall = async (app: MarketplaceApp) => {
    const ok = await confirm({
      title: `Uninstall ${app.name}?`,
      message:
        'Its downloaded source and build are deleted, and its window closes. Anything it saved through the file system stays.',
      confirmLabel: 'Uninstall',
      destructive: true,
    })
    if (!ok) return
    const { windows, closeWindow } = useWindowStore.getState()
    for (const w of windows) if (w.appId === app.id) closeWindow(w.id)
    try {
      await api.delete(`/marketplace/apps/${app.id}`)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
    if (log?.id === app.id) setLog(null)
    await refresh()
  }

  const showLog = async (app: MarketplaceApp) => {
    if (log?.id === app.id) return setLog(null)
    try {
      const { data } = await api.get<string>(`/marketplace/apps/${app.id}/log`, {
        responseType: 'text',
      })
      setLog({ id: app.id, text: data || 'Nothing logged yet.' })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!listing) {
    return <p className="text-on-surface-variant text-[12px]">{error ?? 'Loading the catalog…'}</p>
  }

  return (
    <div>
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
        {listing.apps.map((app) => {
          const Icon = marketplaceIcon(app.icon)
          const installed = app.installed
          const working = app.job && app.job.state !== 'failed'
          const outdated = installed && installed.ref !== app.ref
          let state: string
          if (working) state = JOB_LABEL[app.job!.state]
          else if (app.job?.state === 'failed')
            state = `${JOB_LABEL.failed}: ${app.job.reason ?? ''}`
          else if (!installed) state = 'Not installed'
          else if (installed.missing) state = 'Its build is missing (restored from a backup?)'
          else if (outdated) state = 'An update is available'
          else state = `Installed · ${installed.ref.slice(0, 7)}`
          if (app.server.state === 'crashed') state = `Server stopped: ${app.server.reason}`
          return (
            <div
              key={app.id}
              className="border-outline-variant bg-surface-container-low border px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span className="border-outline-variant bg-surface-container-lowest text-on-surface flex h-7 w-7 shrink-0 items-center justify-center border">
                  <Icon size={15} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-ui text-on-surface block truncate text-[13px] font-medium">
                    {app.name}
                    {app.type === 'service' && (
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
                    {state}
                  </span>
                </span>
                <div className="flex shrink-0 gap-1.5">
                  {installed && !installed.missing && !working && (
                    <Button size="sm" variant="primary" onClick={() => openApp(app.id)}>
                      Open
                    </Button>
                  )}
                  {!working && (!installed || installed.missing || outdated) && (
                    <Button
                      size="sm"
                      variant={installed ? 'default' : 'primary'}
                      onClick={() => void install(app)}
                    >
                      {!installed ? 'Install' : installed.missing ? 'Reinstall' : 'Update'}
                    </Button>
                  )}
                  {(installed || app.job?.state === 'failed') && (
                    <Button size="sm" variant="ghost" onClick={() => void showLog(app)}>
                      Log
                    </Button>
                  )}
                  {(installed || app.job?.state === 'failed') && !working && (
                    <Button size="sm" variant="ghost" onClick={() => void uninstall(app)}>
                      {installed ? 'Uninstall' : 'Clear'}
                    </Button>
                  )}
                </div>
              </div>
              {app.description && (
                <p className="text-on-surface-variant mt-2 text-[11px]">{app.description}</p>
              )}
              {log?.id === app.id && (
                <pre className="border-outline-variant bg-surface-container-lowest text-on-surface custom-scrollbar mt-2 max-h-60 overflow-auto border p-2 text-[10px] whitespace-pre-wrap select-text">
                  {log.text}
                </pre>
              )}
            </div>
          )
        })}
      </div>
      {listing.problems.length > 0 && (
        <div className="mt-4">
          <p className="text-on-surface-variant mb-1 text-[11px] font-semibold">
            Catalog entries that could not be read
          </p>
          <ul className="text-on-surface-variant list-disc pl-5 text-[11px]">
            {listing.problems.map((p) => (
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
