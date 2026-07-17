import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { buildPtyUrl } from './ptyUrl'

/** Cap scrollback so a long-running flood can't grow xterm's buffer unbounded. */
const SCROLLBACK = 5000

/**
 * A real login shell in a window, over an authenticated WebSocket to the PTY
 * gateway (`/api/pty`). Each mounted instance is its own xterm + its own
 * socket + its own shell process — open two windows, get two shells. Closing
 * the window unmounts this component, which closes the socket, which reaps the
 * pty server-side.
 */
export function Terminal({ windowId }: { windowId: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Pull the live accent so the cursor matches the OS identity; the terminal
    // stays on the near-black / off-white B&W surface in both themes.
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c0263a'

    const term = new XTerm({
      scrollback: SCROLLBACK,
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Code", "Roboto Mono", monospace',
      theme: {
        background: '#0d0d0e',
        foreground: '#f2f2ef',
        cursor: accent,
        cursorAccent: '#0d0d0e',
        selectionBackground: 'rgba(255,255,255,0.18)',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)

    // Fit once so term.cols/rows are correct before we open the socket and
    // send the initial geometry in the URL.
    try {
      fit.fit()
    } catch {
      /* container may not be laid out yet on first paint */
    }

    const ws = new WebSocket(buildPtyUrl(term.cols, term.rows))

    // Buffer keystrokes typed before the socket is open, flush on connect.
    let open = false
    const pending: string[] = []
    const sendInput = (data: string) => {
      const frame = JSON.stringify({ type: 'input', data })
      if (open && ws.readyState === WebSocket.OPEN) ws.send(frame)
      else pending.push(frame)
    }
    const sendResize = () => {
      if (open && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    }

    ws.onopen = () => {
      open = true
      for (const frame of pending) ws.send(frame)
      pending.length = 0
      sendResize()
    }
    ws.onmessage = (ev) => {
      // Server sends terminal output as text frames; write verbatim.
      term.write(typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data as ArrayBuffer))
    }
    ws.onclose = () => {
      open = false
      term.write('\r\n\x1b[2m[disconnected]\x1b[0m\r\n')
    }
    ws.onerror = () => {
      term.write('\r\n\x1b[31m[connection error]\x1b[0m\r\n')
    }

    const inputSub = term.onData(sendInput)

    // Re-fit + notify the pty (SIGWINCH) whenever the window/container resizes.
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* ignore transient zero-size during layout */
      }
      sendResize()
    })
    ro.observe(host)

    return () => {
      ro.disconnect()
      inputSub.dispose()
      // Closing the socket triggers the server to kill the pty (reap on close).
      try {
        ws.close()
      } catch {
        /* noop */
      }
      term.dispose()
    }
    // windowId is stable for the life of the window; mount once per window.
  }, [windowId])

  return (
    <div className="h-full w-full overflow-hidden bg-[#0d0d0e] p-1">
      <div ref={hostRef} className="h-full w-full" />
    </div>
  )
}
