import type { CommandItem, CommandSource, CommandSourceContext, SystemHttp } from '@imbatranim/ui'
import { api } from '../../lib/axios'

/**
 * CommandSourcesRegistry
 *
 * Each source contributes a group of results to the command palette and
 * Start's search. Core's own sources register in `coreSources.ts`, built-in
 * add-ons' from their manifests (`src/manifest.ts`), and an installed kit
 * app's when its module loads (`coreSources.ts`'s `registerAppSources`).
 *
 * The types live in the kit, since a kit app's module exports sources too;
 * they are re-exported here for the shell and the add-on contract.
 */
export type { CommandItem, CommandSource, CommandSourceContext }

const COMMAND_SOURCES: CommandSource[] = []

export function registerCommandSource(source: CommandSource): void {
  COMMAND_SOURCES.push(source)
}

/** Take a registered source out of the palette and Start. Nothing when it is not there. */
export function unregisterCommandSource(source: CommandSource): void {
  const i = COMMAND_SOURCES.indexOf(source)
  if (i >= 0) COMMAND_SOURCES.splice(i, 1)
}

/**
 * Run all sources in parallel and return combined results.
 * Sources that error are silently skipped.
 */
export async function searchAllSources(query: string): Promise<CommandItem[]> {
  // The one context every source shares: the authed client, same object the
  // handle exposes as system.http. Built here, not imported by sources.
  const ctx: CommandSourceContext = { http: api as unknown as SystemHttp }
  // Async, so a source that throws before its promise is one is skipped too.
  const results = await Promise.allSettled(COMMAND_SOURCES.map(async (s) => s.search(query, ctx)))

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

/**
 * Find the source that owns a given item (by group) and call activate.
 */
export function activateItem(item: CommandItem): void {
  const source = COMMAND_SOURCES.find((s) => s.group === item.group)
  source?.activate(item)
}

export { COMMAND_SOURCES }
