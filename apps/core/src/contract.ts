import { type ComponentType, type LazyExoticComponent } from 'react'
import type { CommandSource } from './shared/commands/CommandSourcesRegistry'

/**
 * The add-on contract. An add-on package (`apps/add-ons/<app>`) exports a
 * single `manifest: AddonManifest` from its entry point; core's
 * `manifest.ts` — the ONE file allowed to import add-on packages —
 * aggregates them into APP_REGISTRY and registers their command sources.
 */
export type AppConfig = {
  id: string
  name: string
  description: string
  meta: string[]
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  component:
    | ComponentType<{ windowId: string }>
    | LazyExoticComponent<ComponentType<{ windowId: string }>>
  multiInstance: boolean
  defaultSize: { width: number; height: number }
  minSize: { width: number; height: number }
}

export type AddonManifest = AppConfig & {
  /** Optional command-palette sources this app contributes. */
  commandSources?: CommandSource[]
}
