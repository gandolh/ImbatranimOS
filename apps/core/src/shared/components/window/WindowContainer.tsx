import { Suspense, useMemo } from 'react'
import { SystemProvider } from '@imbatranim/ui'
import { useWindowStore } from '../../store/windowStore'
import { Window } from './Window'
import { APP_REGISTRY } from '../../registry/registry'
import { createSystemHandle } from '../../../system/createSystemHandle'

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
      {orderedWindows.map((w) => (
        <WindowSlot
          key={w.id}
          windowId={w.id}
          appId={w.appId}
          isFocused={w.zIndex === maxZIndex && w.isVisible}
        />
      ))}
    </>
  )
}

type WindowSlotProps = {
  windowId: string
  appId: string
  isFocused: boolean
}

/**
 * One window + its app. Mints the per-window {@link createSystemHandle} handle
 * once (memoized by windowId), passes it to the app both as the `system` prop
 * and via `SystemProvider` — the provider sits INSIDE the window's error
 * boundary (rendered as `children`, which `Window` wraps in `AppErrorBoundary`),
 * so a crashed app's provider unmounts with it while app-side hooks still see
 * the handle.
 */
function WindowSlot({ windowId, appId, isFocused }: WindowSlotProps) {
  const app = APP_REGISTRY.find((a) => a.id === appId)
  const AppComponent = app?.component
  const minSize = app?.minSize ?? { width: 240, height: 180 }
  const system = useMemo(() => createSystemHandle(windowId), [windowId])

  return (
    <Window windowId={windowId} minSize={minSize} isFocused={isFocused}>
      {AppComponent ? (
        <SystemProvider system={system}>
          <Suspense
            fallback={
              <div className="text-on-surface-variant flex h-full items-center justify-center p-3 text-sm">
                Loading…
              </div>
            }
          >
            <AppComponent windowId={windowId} system={system} />
          </Suspense>
        </SystemProvider>
      ) : (
        <div className="text-on-surface-variant p-3 text-sm">Unknown app: {appId}</div>
      )}
    </Window>
  )
}
