import { Suspense, useMemo } from 'react'
import { useWindowStore } from '../../store/windowStore'
import { Window } from './Window'
import { APP_REGISTRY } from '../../registry/registry'

export function WindowContainer() {
  // Subscribe to the raw windows array — a reference that only changes when the
  // store actually updates. We must NOT project into a fresh array of objects
  // inside the selector: `useShallow` compares only one level deep, so an array
  // of freshly-built objects is never seen as equal. That makes the
  // useSyncExternalStore snapshot change on every call ("getSnapshot should be
  // cached" → infinite render loop the moment a window is open). The projection
  // is done below in useMemo instead, keyed off the stable array reference.
  const windows = useWindowStore((s) => s.windows)

  const orderedWindows = useMemo(
    () =>
      windows
        .map((w) => ({
          id: w.id,
          appId: w.appId,
          zIndex: w.zIndex,
          isVisible: w.isVisible,
        }))
        .sort((a, b) => a.zIndex - b.zIndex),
    [windows]
  )
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
              <Suspense
                fallback={
                  <div className="text-on-surface-variant flex h-full items-center justify-center p-3 text-sm">
                    Loading…
                  </div>
                }
              >
                <AppComponent windowId={w.id} />
              </Suspense>
            ) : (
              <div className="text-on-surface-variant p-3 text-sm">Unknown app: {w.appId}</div>
            )}
          </Window>
        )
      })}
    </>
  )
}
