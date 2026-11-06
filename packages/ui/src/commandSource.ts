import type { SystemHttp } from './system'

/**
 * A command source: one group of results in the command palette and Start's
 * search. A built-in add-on lists its sources in its manifest; a kit app
 * exports them as `commandSources` and declares `commandSources: true` in its
 * descriptor (since kit 1.5.0).
 *
 * Pure types: a source runs with no mount, so it never calls `useSystem()`;
 * what it may use arrives as {@link CommandSourceContext}.
 */

export type CommandItem = {
  /** Unique within its source and stable across searches. */
  id: string
  /** What the result says. */
  label: string
  /** Optional secondary text (a path, a URL). */
  subtitle?: string
  /** The source's `group`: the section the result is listed under. */
  group: string
}

/**
 * What a source may use while searching. Grown deliberately: it is protocol
 * surface like everything apps touch. A kit app's `http` is its own, carrying
 * its identity, and only there when its descriptor asks for `http`; reading
 * it otherwise throws a sentence naming the capability.
 */
export type CommandSourceContext = { http: SystemHttp }

export type CommandSource = {
  /** The section header, unique among the sources the desktop has. */
  group: string
  /**
   * The results for `query`. A source that needs nothing from `ctx` declares
   * `search(query)`. A kit app's source catches its own failures and answers
   * `[]`: one that throws or rejects is hidden with one notification.
   */
  search(query: string, ctx: CommandSourceContext): Promise<CommandItem[]>
  /** The owner picked `item`, one of this source's results. */
  activate(item: CommandItem): void
}
