import { useMemo } from 'react'
import { useWindowStore } from '../../store/windowStore'
import { Window } from './Window'
import { APP_REGISTRY } from '../../registry/registry'

export function WindowContainer() {
  const windows = useWindowStore((s) => s.windows)
  const orderedWindows = useMemo(
    () => [...windows].sort((a, b) => a.zIndex - b.zIndex),
    [windows],
  )
  const maxZIndex = windows.length > 0 ? Math.max(...windows.map((w) => w.zIndex)) : 0

  return (
    <>
      {orderedWindows.map((instance) => {
        const app = APP_REGISTRY.find((a) => a.id === instance.appId)
        const AppComponent = app?.component
        const minSize = app?.minSize ?? { width: 240, height: 180 }

        return (
          <Window
            key={instance.id}
            instance={instance}
            minSize={minSize}
            isFocused={instance.zIndex === maxZIndex && instance.isVisible}
          >
            {AppComponent ? (
              <AppComponent windowId={instance.id} />
            ) : (
              <div className="p-3 text-sm text-on-surface-variant">
                Unknown app: {instance.appId}
              </div>
            )}
          </Window>
        )
      })}
    </>
  )
}
