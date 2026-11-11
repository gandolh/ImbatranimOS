import { appsSource } from "./appsSource";
import { getEnabledApps } from "../registry/enabledApps";
import { filesSource } from "./filesSource";
import { recentFilesSource } from "./recentFilesSource";
import {
  registerCommandSource,
  unregisterCommandSource,
  COMMAND_SOURCES,
  type CommandSource,
} from "./CommandSourcesRegistry";

// The core-owned sources, registered once (guarded against HMR double
// registration). The command palette and Start's search both import this file,
// so the two read the same sources and never disagree. Built-in add-ons'
// sources come from their manifests and are registered by src/manifest.ts;
// an installed kit app's (Bookmarks') arrive with its module, through
// registerAppSources below.
for (const source of [appsSource, filesSource, recentFilesSource]) {
  if (!COMMAND_SOURCES.find((s) => s.group === source.group)) registerCommandSource(source);
}

/** The sources each installed app brought, by app id, as registered. */
const appSources = new Map<string, CommandSource[]>();

/**
 * Put an installed app's command sources in the palette and Start's search,
 * after every source already there, replacing any it had. Each is searched,
 * and its results activated, only while the app is enabled, so turning the
 * app off takes its results away at once. A source whose group another
 * source already has is left out: a result finds its source by its group.
 * Returns the groups left out.
 */
export function registerAppSources(appId: string, sources: readonly CommandSource[]): string[] {
  unregisterAppSources(appId);
  const enabled = () => getEnabledApps().some((a) => a.id === appId);
  const taken = new Set(COMMAND_SOURCES.map((s) => s.group));
  const added: CommandSource[] = [];
  const refused: string[] = [];
  for (const source of sources) {
    if (taken.has(source.group)) {
      refused.push(source.group);
      continue;
    }
    taken.add(source.group);
    const gated: CommandSource = {
      group: source.group,
      search: (query, ctx) => (enabled() ? source.search(query, ctx) : Promise.resolve([])),
      activate: (item) => {
        if (enabled()) source.activate(item);
      },
    };
    registerCommandSource(gated);
    added.push(gated);
  }
  appSources.set(appId, added);
  return refused;
}

/** Take an app's sources out of the palette and Start: it was uninstalled or rebuilt. */
export function unregisterAppSources(appId: string): void {
  for (const source of appSources.get(appId) ?? []) unregisterCommandSource(source);
  appSources.delete(appId);
}

const APP_LIMIT = 5;

/** Lower is better: 0 name prefix, 1 name word prefix, 2 name substring, 3 keyword, 4 description, 5 subsequence only. */
function appTier(q: string, name: string, description: string, meta: string[]): number {
  const n = name.toLowerCase();
  if (n.startsWith(q)) return 0;
  if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 1;
  if (n.includes(q)) return 2;
  if (meta.some((m) => m.toLowerCase().includes(q))) return 3;
  if (description.toLowerCase().includes(q)) return 4;
  return 5;
}

/**
 * Apps first, ranked by match quality and capped so files still show, then every
 * other group in source order. Pure subsequence matches are dropped when a better
 * one exists. Results that point at the same path (a file found by search and by
 * recents) appear once.
 */
export function rankApps<T extends { id: string; group: string; label?: string; subtitle?: string }>(
  items: T[],
  query = "",
  appLimit = APP_LIMIT,
): T[] {
  const q = query.trim().toLowerCase();
  let apps = items.filter((i) => i.group === "Apps");
  if (q) {
    const enabled = getEnabledApps();
    const scored = apps.map((item, order) => {
      const app = enabled.find((a) => `app:${a.id}` === item.id);
      const tier = appTier(q, item.label ?? app?.name ?? "", item.subtitle ?? "", app?.meta ?? []);
      return { item, tier, order };
    });
    const best = Math.min(...scored.map((s) => s.tier));
    apps = scored
      .filter((s) => best >= 5 || s.tier < 5)
      .sort((a, b) => a.tier - b.tier || a.order - b.order)
      .map((s) => s.item);
  }
  const seen = new Set<string>();
  const others = items
    .filter((i) => i.group !== "Apps")
    .filter((i) => {
      if (!i.subtitle) return true;
      if (seen.has(i.subtitle)) return false;
      seen.add(i.subtitle);
      return true;
    });
  return [...apps.slice(0, appLimit), ...others];
}
