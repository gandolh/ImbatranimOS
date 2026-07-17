import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWindowStore } from '../../store/windowStore'
import { Window } from './Window'
import { APP_REGISTRY } from '../../registry/registry'

export function WindowContainer() {
  const windows = useWindowStore(
    useShallow((s) =>
      s.windows.map((w) => ({
        id: w.id,
        appId: w.appId,
        zIndex: w.zIndex,
        isVisible: w.isVisible,
      }))
    )
  )

  const orderedWindows = useMemo(() => [...windows].sort((a, b) => a.zIndex - b.zIndex), [windows])
  const maxZIndex = windows.length > 0 ? Math.max(...windows.map((w) => w.zIndex)) : 0

  return (
    <>
      {orderedWindows.map((w) => {
        const app = APP_REGISTRY.find((a) => a.id === w.appId)
        const AppComponent = app?.component
        const minSize = app?.minSize ?? { width: 240, height: 180 }

        return (
          <Window
            key={w.id}
            windowId={w.id}
            minSize={minSize}
            isFocused={w.zIndex === maxZIndex && w.isVisible}
          >
            {AppComponent ? (
              <AppComponent windowId={w.id} />
            ) : (
              <div className="text-on-surface-variant p-3 text-sm">Unknown app: {w.appId}</div>
            )}
          </Window>
        )
      })}
    </>
  )
}
