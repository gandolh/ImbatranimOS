import { useEffect, useMemo, type ReactNode } from 'react'
import { SystemProvider } from '@imbatranim/ui'
import { appInstanceOf, createSystemHandle } from './createSystemHandle'

/**
 * A system handle for app code mounted OUTSIDE a window — background services,
 * desktop layers, widgets. Scoped to the app (notifications carry
 * the right id, `system.http`/`schedule` work) with the null-object window:
 * there is nothing to retitle or close, and shared code that tries gets a dev
 * warning instead of a crash.
 *
 * Each mount is a running copy of the app with its own token, ended when the
 * mount goes (a widget removed, a service disabled, sign-out).
 */
export function WindowlessSystemProvider({
  appId,
  children,
}: {
  appId: string
  children: ReactNode
}) {
  const system = useMemo(() => createSystemHandle(appId, null), [appId])
  useEffect(() => {
    const instance = appInstanceOf(system)
    instance?.open()
    return () => instance?.close()
  }, [system])
  return <SystemProvider system={system}>{children}</SystemProvider>
}
