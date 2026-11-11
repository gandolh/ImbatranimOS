import { posix } from "path";
import { z } from "zod";

import { appEntrySchema, MAX_APP_STYLES, sharedKitSchema, styleSchema } from "./catalog";
import type { InstalledRow } from "./marketplace.service";

/*
 * Reading what an installed row records, apart from the marketplace service
 * so app identity can ask which descriptor holds an app without importing
 * the service (and, through it, the data folders that ask app identity).
 */

export function isAppId(id: string): boolean {
  return /^[a-z][a-z0-9-]{1,39}$/.test(id);
}

/** One app of an installed build, as its row records it. */
export interface RecordedApp {
  /** Its module, inside the build's output. */
  entry: string;
  /** A kit app's stylesheets, inside the output. Empty for a mount app. */
  styles: string[];
  /** The shared kit version a kit app was built against. Null for a mount app. */
  sharedKit: number | null;
  /** The build declared a background service. False for a mount app. */
  background: boolean;
  /** The build declared command sources. False for a mount app. */
  commandSources: boolean;
}

/** A kit app's value in `entries`. A hook it did not declare is left out. */
export const recordedKitApp = z.strictObject({
  entry: appEntrySchema,
  styles: z.array(styleSchema).max(MAX_APP_STYLES),
  sharedKit: sharedKitSchema,
  background: z.literal(true).optional(),
  commandSources: z.literal(true).optional(),
});

/**
 * What an installed row says its live build holds: the served directory
 * (relative to the row's `root`) and each app inside it. A row with no
 * `entries` names one module, for the app whose id is the row's. In
 * `entries` a mount app's value is its module's path, a kit app's an object
 * (see `InstalledRow`). Null when `entries` is damaged: every app of the row
 * then lists as missing, and a reinstall writes it again.
 */
export function recordedBuild(
  row: Pick<InstalledRow, "id" | "entry" | "entries">,
): { output: string; entries: ReadonlyMap<string, RecordedApp> } | null {
  if (row.entries == null) {
    return {
      output: posix.dirname(row.entry),
      entries: new Map([
        [
          row.id,
          {
            entry: posix.basename(row.entry),
            styles: [],
            sharedKit: null,
            background: false,
            commandSources: false,
          },
        ],
      ]),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.entries);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const entries = new Map<string, RecordedApp>();
  for (const [id, value] of Object.entries(parsed)) {
    if (!isAppId(id)) return null;
    if (typeof value === "string") {
      if (!appEntrySchema.safeParse(value).success) return null;
      entries.set(id, {
        entry: posix.normalize(value),
        styles: [],
        sharedKit: null,
        background: false,
        commandSources: false,
      });
      continue;
    }
    const kit = recordedKitApp.safeParse(value);
    if (!kit.success) return null;
    entries.set(id, {
      entry: posix.normalize(kit.data.entry),
      styles: kit.data.styles.map((p) => posix.normalize(p)),
      sharedKit: kit.data.sharedKit,
      background: kit.data.background === true,
      commandSources: kit.data.commandSources === true,
    });
  }
  return { output: row.entry, entries };
}
