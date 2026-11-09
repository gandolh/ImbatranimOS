import { createElement, useState, type FormEvent, type JSX } from 'react'
import { cn } from '@imbatranim/ui'
import { api } from '../../lib/axios'
import { Button, Input } from '../../shared/components/ui'
import { marketplaceIcon } from '../../shared/registry/marketplace'
import { apiMessage, capabilityText, publisher, sourceLine, type Inspection } from './urlApps'

/** A small all-caps label beside a name: Verified, Not verified. */
export function SourceBadge({ children, warn = false }: { children: string; warn?: boolean }) {
  return (
    <span
      className={cn(
        'ml-2 text-[9px] font-semibold tracking-widest uppercase',
        warn ? 'text-error' : 'text-primary'
      )}
    >
      {children}
    </span>
  )
}

function Capabilities({ capabilities }: { capabilities: string[] }) {
  return (
    <div className="mt-2 text-[11px]">
      {capabilities.length === 0 ? (
        <p className="text-on-surface">It asks for nothing beyond its own window.</p>
      ) : (
        <>
          <p className="text-on-surface-variant mb-1 font-semibold">It asks to</p>
          <ul className="text-on-surface list-disc pl-5">
            {capabilities.map((c) => (
              <li key={c}>{capabilityText(c)}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/**
 * The consent card: what would be installed, and what it may do, before
 * anything is. Three kinds: a prebuilt app that runs sandboxed; a verified
 * app built from source, which installs at once; and an unverified one built
 * from source, which first shows a warning and installs only on "Trust and
 * install", behind "More info", the way Windows SmartScreen does.
 */
export function ConsentCard({
  inspection,
  onInstalled,
  onCancel,
}: {
  inspection: Inspection
  onInstalled: () => void
  onCancel: () => void
}) {
  const { manifest, source, current } = inspection
  const native = inspection.runtime === 'native'
  const unverified = native && !inspection.verified
  const same = current?.commit === source.commit
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moreInfo, setMoreInfo] = useState(false)

  const install = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.post(
        '/marketplace/url/install',
        unverified ? { pending: inspection.pending, trust: true } : { pending: inspection.pending }
      )
      onInstalled()
    } catch (err) {
      setError(apiMessage(err, 'The install failed.'))
      setBusy(false)
    }
  }

  const cancel = () => {
    void Promise.resolve(api.delete(`/marketplace/url/pending/${inspection.pending}`)).catch(
      () => {}
    )
    onCancel()
  }

  const replaces = current && (
    <p className="text-on-surface mt-2 text-[11px]">
      {same
        ? 'Already installed at this commit.'
        : `Installed at ${current.commit.slice(0, 7)}. This replaces it.`}
    </p>
  )
  const apps = inspection.apps && inspection.apps.length > 1 && (
    <p className="text-on-surface-variant mt-2 text-[11px]">
      Its apps: {inspection.apps.map((a) => a.name).join(', ')}
    </p>
  )
  const footer = (primary: JSX.Element) => (
    <>
      {error && <p className="text-error mt-2 text-[12px]">{error}</p>}
      <div className="mt-3 flex gap-1.5">
        {primary}
        <Button size="sm" variant="ghost" disabled={busy} onClick={cancel}>
          Cancel
        </Button>
      </div>
    </>
  )

  if (unverified) {
    return (
      <section
        aria-label={`${manifest.name} is not verified`}
        className="rounded-control border-error bg-surface-container-low mt-3 border px-3 py-3"
      >
        <p className="font-ui text-on-surface text-[13px] font-semibold">
          This app isn&apos;t verified
        </p>
        <p className="text-on-surface-variant mt-1 text-[11px]">
          Nobody has reviewed {manifest.name} at this commit. Install it only if you trust where it
          comes from.
        </p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          <dt className="text-on-surface-variant">App</dt>
          <dd className="text-on-surface min-w-0 truncate">{manifest.name}</dd>
          <dt className="text-on-surface-variant">Publisher</dt>
          <dd className="text-on-surface min-w-0 truncate">{publisher(source)}</dd>
          <dt className="text-on-surface-variant">Commit</dt>
          <dd className="text-on-surface font-mono">{source.commit.slice(0, 7)}</dd>
        </dl>
        <Capabilities capabilities={manifest.capabilities} />
        <p
          role="note"
          className="border-error text-on-surface bg-surface-container-lowest mt-3 border-l-2 px-2.5 py-2 text-[11px]"
        >
          A trusted app runs as you. It can do anything you can, the Terminal included.
        </p>
        {moreInfo && (
          <div className="mt-2 text-[11px]">
            {manifest.description && (
              <p className="text-on-surface-variant">{manifest.description}</p>
            )}
            {apps}
            <p className="text-on-surface-variant mt-2">{sourceLine(source)}</p>
            <p className="text-on-surface mt-2">
              It is built from source on this machine and runs like the other apps. Trust covers
              this commit only: each update asks again.
            </p>
            {replaces}
          </div>
        )}
        {footer(
          moreInfo ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy || same}
              onClick={() => void install()}
            >
              {busy ? 'Installing…' : 'Trust and install'}
            </Button>
          ) : (
            <Button size="sm" variant="default" onClick={() => setMoreInfo(true)}>
              More info
            </Button>
          )
        )}
      </section>
    )
  }

  return (
    <div className="rounded-control border-outline-variant bg-surface-container-low mt-3 border px-3 py-3">
      <div className="flex items-center gap-3">
        <span className="rounded-control border-outline-variant bg-surface-container-lowest text-on-surface flex h-7 w-7 shrink-0 items-center justify-center border">
          {createElement(marketplaceIcon(manifest.icon), { size: 15, strokeWidth: 1.75 })}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-ui text-on-surface block truncate text-[13px] font-medium">
            {manifest.name}
            {native && <SourceBadge>Verified</SourceBadge>}
          </span>
          <span className="text-on-surface-variant block truncate text-[11px]">
            {sourceLine(source)}
          </span>
        </span>
      </div>
      {manifest.description && (
        <p className="text-on-surface-variant mt-2 text-[11px]">{manifest.description}</p>
      )}
      {apps}
      {replaces}
      <Capabilities capabilities={manifest.capabilities} />
      <p
        role="note"
        className={cn(
          'text-on-surface bg-surface-container-lowest mt-3 border-l-2 px-2.5 py-2 text-[11px]',
          native ? 'border-primary' : 'border-error'
        )}
      >
        {native ? (
          <>
            This commit is verified. It is built from source on this machine and runs like the other
            apps, as you.
          </>
        ) : (
          <>
            Nobody has reviewed this app. It runs in a sandbox: it can&apos;t read your files, use
            your session, or reach the internet, and it can only use what&apos;s listed above.
          </>
        )}
      </p>
      {footer(
        <Button size="sm" variant="primary" disabled={busy || same} onClick={() => void install()}>
          {busy ? 'Installing…' : 'Install'}
        </Button>
      )}
    </div>
  )
}

/** Settings → Marketplace → "Install from a URL". */
export function InstallFromUrl({ onInstalled }: { onInstalled: () => void }) {
  const [url, setUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [done, setDone] = useState(false)

  const check = async (e?: FormEvent) => {
    e?.preventDefault()
    const value = url.trim()
    if (!value || checking) return
    setChecking(true)
    setError(null)
    setDone(false)
    try {
      const { data } = await api.post<Inspection>('/marketplace/url/inspect', { url: value })
      setInspection(data)
    } catch (err) {
      setInspection(null)
      setError(apiMessage(err, "Couldn't reach that repository."))
    } finally {
      setChecking(false)
    }
  }

  return (
    <section className="mb-6">
      <h3 className="font-ui text-on-surface mb-1 text-[12px] font-semibold">Install from a URL</h3>
      <p className="text-on-surface-variant mb-3 text-[12px]">
        Paste a GitHub link to an app that ships an <code>imbatranim.json</code>. A verified app
        installs straight away; any other asks for your trust first.
      </p>
      <form onSubmit={(e) => void check(e)} className="flex items-start gap-2">
        <div className="max-w-[420px] flex-1">
          <Input
            aria-label="GitHub URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" size="md" disabled={checking || !url.trim()}>
          {checking ? 'Checking…' : 'Check'}
        </Button>
      </form>
      {error && <p className="text-error mt-2 text-[12px]">{error}</p>}
      {done && (
        <p className="text-on-surface mt-2 text-[12px]" role="status">
          Installed.
        </p>
      )}
      {inspection && (
        <ConsentCard
          key={inspection.pending}
          inspection={inspection}
          onCancel={() => {
            setInspection(null)
            setUrl('')
          }}
          onInstalled={() => {
            setInspection(null)
            setUrl('')
            setDone(true)
            onInstalled()
          }}
        />
      )}
    </section>
  )
}
