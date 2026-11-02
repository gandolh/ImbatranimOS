import { useEffect, useRef } from 'react'
import { canvasFor, useLinuxWindowsStore } from './linuxWindowsStore'

/**
 * The inside of a Linux window: the toplevel's canvas, at the image's own
 * size in the top-left corner. Nothing is scaled: one image pixel is one CSS
 * pixel (the session's output has scale 1).
 */
export function LinuxWindowBody({ windowId }: { windowId: string }) {
  const toplevel = useLinuxWindowsStore((s) => s.byWindow[windowId]?.toplevel)
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = holder.current
    if (!el || toplevel === undefined) return
    const canvas = canvasFor(toplevel)
    canvas.style.display = 'block'
    el.appendChild(canvas)
    return () => {
      if (canvas.parentElement === el) el.removeChild(canvas)
    }
  }, [toplevel])

  return (
    <div
      ref={holder}
      className="h-full w-full overflow-hidden bg-black"
      data-linux-window=""
      aria-label="Linux app window"
    />
  )
}
