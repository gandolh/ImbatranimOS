import { createContext, useContext, type ReactNode } from 'react'
import type { SystemHandle } from './protocol'

const SystemContext = createContext<SystemHandle | null>(null)

/**
 * Provides the per-window {@link SystemHandle} to everything rendered inside an
 * app window. The compositor mounts one of these per window (inside the app's
 * error boundary, so a crashed app's provider dies with it). App code reads the
 * handle with {@link useSystem}.
 */
export function SystemProvider({
  system,
  children,
}: {
  system: SystemHandle
  children: ReactNode
}) {
  return <SystemContext.Provider value={system}>{children}</SystemContext.Provider>
}

/**
 * Read the current window's {@link SystemHandle}. Throws when called outside a
 * {@link SystemProvider} — i.e. from code not running inside an app window.
 */
// The provider + its reader hook belong together; the hook is not a Fast
// Refresh boundary, so co-locating it with <SystemProvider> is safe.
// eslint-disable-next-line react-refresh/only-export-components
export function useSystem(): SystemHandle {
  const system = useContext(SystemContext)
  if (!system) {
    throw new Error(
      'useSystem() must be called inside a <SystemProvider>. App components render ' +
        'inside one automatically (the compositor wraps each window); this error means ' +
        'the calling code is outside an app window.'
    )
  }
  return system
}
