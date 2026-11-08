import { Injectable } from '@nestjs/common';

import { DbService } from '../../db/db.service';
import type { AppIdentity } from './app-identity.types';
import {
  ancestorsOf,
  modeKey,
  ModeStore,
  type ModeOp,
} from './mode-store.service';

/**
 * What a grant covers: one file (`file`, which may not exist yet: a Save as),
 * or a folder and everything under it (`folder`).
 */
export type GrantKind = 'file' | 'folder';

/** One grant: a running copy of an app may act as the user on `path`. */
export interface FileGrant {
  readonly instanceId: string;
  readonly appId: string;
  /** The absolute path, as the mode store keys it. */
  readonly path: string;
  readonly kind: GrantKind;
  readonly createdAt: number;
}

/**
 * A grant older than this is dropped as the next one is made. No session
 * outlives it (a session lasts 30 days), so no window that could still use
 * one is left holding it.
 */
export const GRANT_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

/** The most one running copy holds; past it the oldest goes. */
export const MAX_GRANTS_PER_INSTANCE = 256;

interface Row {
  instance_id: string;
  app_id: string;
  path: string;
  kind: GrantKind;
  created_at: number;
}

/**
 * The files and folders each running copy of an app was given, in the
 * `file_grants` table: the scoped-storage rule of Android, Flatpak's document
 * portal and the macOS sandbox.
 *
 * An app sees its own folders through its modes; anything else of the user's
 * it sees only when the OS gave it: a file opened with it (from Files, Start's
 * recent files, Open With) or one picked in the OS's dialog. A grant lets that
 * copy act as the user on what was given, so modes don't narrow it, and it
 * names the copy (the window), so a second window of the same app holds
 * nothing until it is given something too.
 *
 * - **A file grant** covers reading and writing that one path, and making it
 *   when it isn't there (Save as). Not deleting, renaming or listing.
 * - **A folder grant** covers the folder and everything under it, making and
 *   deleting included, except the folder's own entry in its parent, and
 *   except anything another app owns: a picked folder doesn't reach into
 *   another app's data folder below it. A file given by itself does, since
 *   the owner chose that file.
 * - **Grants are kept in the database** so an open window keeps its file
 *   across a backend restart: core mints the window a new token for the same
 *   instance id, and the grants still match it. They end when the window
 *   closes (core drops them, and ending the copy's token does too), and any
 *   left behind by a page that went away are swept by age.
 */
@Injectable()
export class FileGrants {
  constructor(
    private readonly dbs: DbService,
    private readonly modes: ModeStore,
  ) {}

  /** Give a running copy a file or a folder. Giving the same path again replaces the grant. */
  grant(
    target: { instanceId: string; appId: string },
    path: string,
    kind: GrantKind,
    now = Date.now(),
  ): void {
    const key = modeKey(path);
    const db = this.dbs.db;
    db.transaction(() => {
      db.prepare('DELETE FROM file_grants WHERE created_at < ?').run(
        now - GRANT_MAX_AGE_MS,
      );
      db.prepare(
        `INSERT INTO file_grants (instance_id, app_id, path, kind, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(instance_id, path) DO UPDATE SET app_id = excluded.app_id,
           kind = excluded.kind, created_at = excluded.created_at`,
      ).run(target.instanceId, target.appId, key, kind, now);
      db.prepare(
        `DELETE FROM file_grants WHERE instance_id = ? AND rowid NOT IN (
           SELECT rowid FROM file_grants WHERE instance_id = ?
           ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
      ).run(target.instanceId, target.instanceId, MAX_GRANTS_PER_INSTANCE);
    })();
  }

  /** What one running copy holds. A grant made for another app under the same id holds nothing. */
  held(instanceId: string, appId: string): FileGrant[] {
    const rows = this.dbs.db
      .prepare(
        `SELECT instance_id, app_id, path, kind, created_at FROM file_grants
         WHERE instance_id = ? AND app_id = ?`,
      )
      .all(instanceId, appId) as Row[];
    return rows.map((r) => ({
      instanceId: r.instance_id,
      appId: r.app_id,
      path: r.path,
      kind: r.kind,
      createdAt: r.created_at,
    }));
  }

  /** End every grant of every copy of one app: it was uninstalled. */
  revokeApp(appId: string): void {
    this.dbs.db.prepare('DELETE FROM file_grants WHERE app_id = ?').run(appId);
  }

  /** End every grant of a running copy: its window closed. */
  revokeInstance(instanceId: string): void {
    this.dbs.db
      .prepare('DELETE FROM file_grants WHERE instance_id = ?')
      .run(instanceId);
  }

  /** Does something this copy was given let it do `op` to `path`? */
  covers(identity: AppIdentity, op: ModeOp, path: string): boolean {
    const key = modeKey(path);
    for (const grant of this.held(identity.instanceId, identity.appId)) {
      if (grant.kind === 'file') {
        if (key === grant.path && FILE_OPS.has(op)) return true;
        continue;
      }
      if (!within(grant.path, key) || op === 'chmod') continue;
      // Making or deleting an entry is an act on its parent; the picked
      // folder's own entry is in a parent that wasn't given.
      if ((op === 'create' || op === 'delete') && key === grant.path) continue;
      if (this.crossesAnotherApp(identity.appId, grant.path, key)) continue;
      return true;
    }
    return false;
  }

  /**
   * True when something between a granted folder (not included) and `key`
   * (included) is owned by an app other than `appId`: another app's data
   * folder, or a file in it.
   */
  private crossesAnotherApp(appId: string, top: string, key: string): boolean {
    if (key === top) return false;
    const below = [...ancestorsOf(key), key].filter(
      (p) => p !== top && within(top, p),
    );
    for (const entry of this.modes.rows(below).values()) {
      if (entry.owner !== null && entry.owner !== appId) return true;
    }
    return false;
  }
}

/** What a file grant lets its holder do to that one path. */
const FILE_OPS: ReadonlySet<ModeOp> = new Set(['read', 'write', 'create']);

/** True when `key` is `top` or under it. */
function within(top: string, key: string): boolean {
  if (key === top) return true;
  return key.startsWith(top === '/' ? '/' : `${top}/`);
}
