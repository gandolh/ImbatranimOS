import { type ComponentType, type LazyExoticComponent } from 'react'
import type { SystemHandle } from '@imbatranim/ui'
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
  // The compositor injects the per-window `system` capability handle (brief 48)
  // alongside `windowId`. Apps not yet migrated are typed `{ windowId: string }`
  // and stay assignable here by parameter contravariance (they ignore `system`).
  component:
    | ComponentType<{ windowId: string; system: SystemHandle }>
    | LazyExoticComponent<ComponentType<{ windowId: string; system: SystemHandle }>>
  multiInstance: boolean
  defaultSize: { width: number; height: number }
  minSize: { width: number; height: number }
}

export type AddonManifest = AppConfig & {
  /** Optional command-palette sources this app contributes. */
  commandSources?: CommandSource[]
}
