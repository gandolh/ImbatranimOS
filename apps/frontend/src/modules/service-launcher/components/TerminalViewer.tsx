import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useServiceLogs } from '../queries/servicesQueries'

interface TerminalViewerProps {
  id: string
  onClose: () => void
}

export function TerminalViewer({ id, onClose }: TerminalViewerProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  
  const { data: logData } = useServiceLogs(id, true)
  const lastLogsRef = useRef('')

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0f172a', // slate-900
        foreground: '#cbd5e1', // slate-300
      },
      fontSize: 12,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
      cursorBlink: true,
      convertEol: true,
      rows: 30,
      cols: 80,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    term.open(terminalRef.current)
    
    // Slight delay to ensure dimensions are calculated
    setTimeout(() => {
      try {
        fitAddon.fit()
      } catch (e) {
        console.warn('Xterm fit failed', e)
      }
    }, 10)

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    const handleResize = () => {
      try {
        fitAddon.fit()
      } catch (e) {
        // Ignore resize errors if element is detached
      }
    }
    
    const resizeObserver = new ResizeObserver(() => handleResize())
    resizeObserver.observe(terminalRef.current)

    // Initial write of logs if already available
    if (logData?.logs) {
      term.write(logData.logs)
      lastLogsRef.current = logData.logs
    }

    return () => {
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [id])

  useEffect(() => {
    if (logData?.logs && xtermRef.current) {
      const logs = logData.logs
      if (logs !== lastLogsRef.current) {
        // If the new logs start with the old logs, just append the difference
        if (logs.startsWith(lastLogsRef.current)) {
          const newLogs = logs.substring(lastLogsRef.current.length)
          xtermRef.current.write(newLogs)
        } else {
          // If the buffer changed completely (e.g. rotated or restarted), clear and rewrite
          xtermRef.current.clear()
          xtermRef.current.write(logs)
        }
        lastLogsRef.current = logs
      }
    }
  }, [logData])

  return (
    <div className="flex flex-col h-full bg-[#0f172a]">
       <div className="flex h-9 items-center justify-between px-3 border-b border-white/10 bg-white/5">
          <span className="text-[11px] font-mono font-bold uppercase text-slate-400">Terminal Output</span>
          <button onClick={onClose} className="text-[11px] text-slate-400 hover:text-white px-2">Close</button>
       </div>
       <div ref={terminalRef} className="flex-1 overflow-hidden p-2" />
    </div>
  )
}
