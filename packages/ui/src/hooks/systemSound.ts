import { useRef, useSyncExternalStore } from 'react'
import { useSystem } from '../systemContext'
import type { SystemSoundState } from '../system'

/** What an app plays at when the desktop has no OS volume (before kit 1.3.0). */
const FULL: SystemSoundState = { volume: 1, muted: false }

/**
 * The OS volume from the tray, live. An app that makes sound multiplies its
 * own volume by `volume` and is silent while `muted`.
 */
export function useSystemSound(): SystemSoundState {
  const system = useSystem()
  // Cached snapshot: useSyncExternalStore compares by identity, and `get()`
  // mints a fresh object per call, which would loop the render.
  const snapshot = useRef<SystemSoundState | null>(null)
  return useSyncExternalStore(
    (onChange) =>
      system.on('sound-changed', (next) => {
        snapshot.current = next
        onChange()
      }),
    () => {
      if (snapshot.current === null) snapshot.current = system.sound?.get() ?? FULL
      return snapshot.current
    }
  )
}
