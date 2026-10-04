import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Globe, LogOut, RotateCw } from 'lucide-react'
import { Button, Tooltip, useConfirm, useSystem } from '@imbatranim/ui'
import { isWebUrl, toAddress } from './address'
import { parseFromHost, type ToHost } from './hostProtocol'

/**
 * The Browser (brief 50): real websites, clickable, through the machine.
 *
 * Pages are fetched by the machine, not by the viewing browser: Scramjet
 * rewrites them and a Wisp relay on the backend carries the traffic. They run
 * in a frame on the **proxy origin**, never this desktop's origin, so a page
 * that escapes the rewriter still holds neither the session nor the terminal.
 * This window is only the chrome around that frame; the frame's host page does
 * the proxying (`apps/backend/src/modules/browser/static/host.js`).
 *
 * Nothing proxy-related exists until this window opens: no service worker, no
 * WebAssembly, no relay. The desktop's own origin never gets any of them.
 */

type Config = { origin: string | null }

/** Wait this long after the last cookie change before saving the jar. */
const SAVE_DELAY_MS = 2000

export function Browser() {
  const system = useSystem()
  const [config, setConfig] = useState<Config | 'loading' | 'failed'>('loading')

  useEffect(() => {
    let live = true
    system.http
      .get<Config>('/browser/config')
      .then((res) => live && setConfig(res.data))
      .catch(() => live && setConfig('failed'))
    return () => {
      live = false
    }
  }, [system])

  if (config === 'loading') return <Notice>Starting…</Notice>
  if (config === 'failed') return <Notice>The Browser could not reach this machine.</Notice>
  if (!config.origin) {
    return (
      <Notice title="The Browser is not set up on this machine">
        It needs a second port for the pages it shows, kept apart from the desktop. Whoever runs
        this machine sets <code>BROWSER_PROXY_PORT</code> (see the infrastructure README).
      </Notice>
    )
  }
  return <BrowserFrame origin={config.origin} />
}

function BrowserFrame({ origin }: { origin: string }) {
  const system = useSystem()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [address, setAddress] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  /** A URL asked for before the host page was ready (an intent at launch). */
  const pendingUrl = useRef<string | null>(null)
  const readyRef = useRef(false)
  const started = useRef(false)
  const jarPromise = useRef<Promise<string | null> | null>(null)
  const unsavedJar = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const post = useCallback(
    (message: ToHost) => frameRef.current?.contentWindow?.postMessage(message, origin),
    [origin]
  )

  const go = useCallback(
    (url: string) => {
      setAddress(url)
      if (readyRef.current) post({ imb: 'go', url })
      else pendingUrl.current = url
    },
    [post]
  )

  const fetchJar = useCallback(
    () =>
      system.http
        .get<{ jar: string | null }>('/browser/profile')
        .then((res) => res.data.jar)
        .catch(() => null),
    [system]
  )

  // The profile is fetched as soon as the window opens, while the frame loads.
  useEffect(() => {
    jarPromise.current ??= fetchJar()
  }, [fetchJar])

  const saveJar = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    const jar = unsavedJar.current
    if (jar === null) return
    unsavedJar.current = null
    void system.http.put('/browser/profile', { jar }).catch(() => {
      // Kept for the next change; a failed save loses nothing yet.
      unsavedJar.current ??= jar
    })
  }, [system])

  // Bookmarks and other apps open a page with openApp('browser', { url }).
  useEffect(
    () =>
      system.intents.onIntent((payload) => {
        const url = (payload as { url?: unknown } | null)?.url
        if (isWebUrl(url)) go(url)
      }),
    [system, go]
  )

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Origin AND source: proxied pages share the host page's origin.
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return
      const message = parseFromHost(event.data)
      if (!message) return
      switch (message.imb) {
        case 'ready':
          readyRef.current = true
          setReady(true)
          setError(null)
          break
        case 'url':
          setAddress(message.url)
          break
        case 'title':
          system.window.setTitle(message.title ? `${message.title} — Browser` : 'Browser')
          break
        case 'jar':
          unsavedJar.current = message.jar
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(saveJar, SAVE_DELAY_MS)
          break
        case 'error':
          setError(message.message)
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin, saveJar, system])

  // Whatever changed in the last two seconds is saved on close.
  useEffect(() => saveJar, [saveJar])

  async function onFrameLoad() {
    if (started.current) return
    started.current = true
    const jar = await (jarPromise.current ??= fetchJar())
    post({ imb: 'start', url: pendingUrl.current ?? '', jar })
    pendingUrl.current = null
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const url = toAddress(address)
    if (url) go(url)
  }

  async function forgetSignIns() {
    const ok = await confirm({
      title: 'Sign out of every site?',
      message:
        'The Browser forgets the cookies of every site it has visited, on this machine and in this window.',
      confirmLabel: 'Sign out',
      destructive: true,
    })
    if (!ok) return
    unsavedJar.current = null
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await system.http.delete('/browser/profile').catch(() => undefined)
    post({ imb: 'jar-clear' })
  }

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col">
      <form
        className="border-outline-variant bg-surface-container-low flex items-center gap-1 border-b px-2 py-1"
        onSubmit={onSubmit}
      >
        <Tooltip content="Back">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 justify-center p-0"
            disabled={!ready}
            onClick={() => post({ imb: 'back' })}
            aria-label="Back"
          >
            <ArrowLeft size={14} />
          </Button>
        </Tooltip>
        <Tooltip content="Forward">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 justify-center p-0"
            disabled={!ready}
            onClick={() => post({ imb: 'forward' })}
            aria-label="Forward"
          >
            <ArrowRight size={14} />
          </Button>
        </Tooltip>
        <Tooltip content="Reload">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 justify-center p-0"
            disabled={!ready}
            onClick={() => post({ imb: 'reload' })}
            aria-label="Reload"
          >
            <RotateCw size={14} />
          </Button>
        </Tooltip>
        <input
          className="border-outline-variant bg-surface-container-lowest font-content text-on-surface focus:border-primary min-w-0 flex-1 border px-2 py-1 text-[12px] outline-none"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="Search, or type an address"
          aria-label="Address"
          spellCheck={false}
          autoComplete="off"
        />
        <Tooltip content="Sign out of every site">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 justify-center p-0"
            disabled={!ready}
            onClick={() => void forgetSignIns()}
            aria-label="Sign out of every site"
          >
            <LogOut size={14} />
          </Button>
        </Tooltip>
      </form>
      {error && (
        <p className="border-outline-variant bg-surface-container text-error font-ui border-b px-3 py-1.5 text-[12px]">
          {error}
        </p>
      )}
      <iframe
        ref={frameRef}
        title="Web page"
        src={`${origin}/host.html`}
        onLoad={() => void onFrameLoad()}
        className="min-h-0 w-full flex-1 border-0 bg-white"
        // Cross-origin already; the sandbox adds what that does not: the page
        // can never navigate the desktop itself away.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
        allow="autoplay; fullscreen"
        referrerPolicy="no-referrer"
      />
      {confirmDialog}
    </div>
  )
}

function Notice({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="bg-surface-container-lowest text-on-surface-variant flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Globe size={28} className="opacity-60" />
      {title && <p className="font-ui text-on-surface text-[13px] font-semibold">{title}</p>}
      <p className="font-content max-w-[420px] text-[12px]">{children}</p>
    </div>
  )
}
