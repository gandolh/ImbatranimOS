import type { DbService } from '../../db/db.service';
import { recordedBuild } from '../marketplace/recorded-build';
import { SYSTEM_GROUP } from './app-identity.types';

/**
 * The install group of an app: the id of the installed descriptor holding it,
 * so a suite's apps share one, or null when no installed descriptor holds it
 * (a built-in app). Read from `marketplace_apps` as the live builds record
 * their apps; a row whose record is damaged holds none.
 */
export function installGroupOf(dbs: DbService, appId: string): string | null {
  const rows = dbs.db
    .prepare('SELECT id, entry, entries FROM marketplace_apps ORDER BY id')
    .all() as { id: string; entry: string; entries: string | null }[];
  for (const row of rows) {
    if (recordedBuild(row)?.entries.has(appId)) return row.id;
  }
  return null;
}

/**
 * An app's groups: its own private group, then its install group, or
 * {@link SYSTEM_GROUP} for a built-in. An installed app never gets
 * `system`, even one whose id or descriptor is called that.
 */
export function groupsOf(dbs: DbService, appId: string): string[] {
  const install = installGroupOf(dbs, appId);
  if (install === null) return [...new Set([appId, SYSTEM_GROUP])];
  return [...new Set([appId, install])].filter((g) => g !== SYSTEM_GROUP);
}
