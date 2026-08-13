import { Button } from '@imbatranim/ui'

type AppErrorFallbackProps = {
  appName: string
  error: Error
  onReload: () => void
  onClose: () => void
}

/** Compact in-chrome panel shown when a window's app content has crashed. */
export function AppErrorFallback({ appName, error, onReload, onClose }: AppErrorFallbackProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="font-ui text-on-surface text-[13px] font-semibold">{appName} crashed</p>
      <p className="text-on-surface-variant max-w-[280px] text-[12px] break-words">
        {error.message}
      </p>
      <details className="text-on-surface-variant w-full max-w-[280px] text-left text-[11px]">
        <summary className="cursor-pointer select-none">Details</summary>
        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap">
          {error.stack ?? error.message}
        </pre>
      </details>
      <div className="mt-1 flex gap-2">
        <Button variant="primary" size="sm" onClick={onReload}>
          Reload
        </Button>
        <Button variant="destructive" size="sm" onClick={onClose}>
          Close window
        </Button>
      </div>
    </div>
  )
}
