import { APP_REGISTRY } from './registry'
import type { AppConfig } from './registry'
import { useAddonStore } from '../store/addonStore'

/**
 * Core apps that can never be disabled — hiding them would lock the user out of
 * the shell (settings), their files (file-manager), or a terminal. Their toggles
 * are shown-but-locked in Settings, and both the launcher filter and openApp
 * honor this set.
 */
export const NON_DISABLEABLE = new Set(['settings', 'file-manager', 'terminal'])

function filterEnabled(disabled: string[]): AppConfig[] {
  return APP_REGISTRY.filter((app) => !disabled.includes(app.id) || NON_DISABLEABLE.has(app.id))
}

/** Reactive: APP_REGISTRY minus disabled ids (non-disableable always kept). */
export function useEnabledApps(): AppConfig[] {
  const disabled = useAddonStore((s) => s.disabled)
  return filterEnabled(disabled)
}

/** Non-reactive read for imperative callers (command sources, intents). */
export function getEnabledApps(): AppConfig[] {
  return filterEnabled(useAddonStore.getState().disabled)
}
