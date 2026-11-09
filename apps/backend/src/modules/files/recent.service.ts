import { Injectable } from '@nestjs/common';
import { DbService } from '../../db/db.service';

/** The list is a glance, not an archive — pruned to this on every write. */
const MAX_RECENTS = 50;

/** A file, or a folder an app works in (Git GUI's repositories). */
export type RecentKind = 'file' | 'folder';

export interface RecentFile {
  id: number;
  root: string;
  path: string;
  appId: string;
  kind: RecentKind;
  lastOpened: string;
}

interface RecentRow {
  id: number;
  root: string;
  path: string;
  app_id: string;
  kind: RecentKind;
  last_opened: string;
}

/**
 * OS-wide recent files. Promoted from Notepad's private recents:
 * every opener records `(root, path, appId)` through one core helper, and the
 * Start menu, the file picker and the palette read it back. A row may be a
 * folder (Git GUI's repositories), which the picker leaves out and Start
 * opens in its app like a file.
 *
 * Rows are hints, not truth: a path may have been deleted since. Consumers
 * self-heal by removing an entry that 404s when reopened — the same contract
 * sticky-notes proved for stale caches.
 */
@Injectable()
export class RecentService {
  constructor(private readonly db: DbService) {}

  list(): RecentFile[] {
    const rows = this.db.db
      .prepare(
        `SELECT id, root, path, app_id, kind, last_opened FROM recent_files
         ORDER BY last_opened DESC, id DESC LIMIT ?`,
      )
      .all(MAX_RECENTS) as RecentRow[];
    return rows.map((r) => ({
      id: r.id,
      root: r.root,
      path: r.path,
      appId: r.app_id,
      kind: r.kind,
      lastOpened: r.last_opened,
    }));
  }

  /**
   * Record an open. `writable` says whether whoever recorded it could write
   * the file (the user always could): an app reopening its own recent gets
   * no more than that. Undefined only moves an app's own entry up, keeping
   * what it said. The same app recording it again writable makes it so; it
   * never narrows it. `kind` is what is at the path now.
   */
  record(
    root: string,
    path: string,
    appId: string,
    writable: boolean | undefined = true,
    kind: RecentKind = 'file',
  ): void {
    const w = writable === undefined ? null : writable ? 1 : 0;
    const tx = this.db.db.transaction(() => {
      this.db.db
        .prepare(
          `INSERT INTO recent_files (root, path, app_id, writable, kind, last_opened)
           VALUES (@root, @path, @appId, COALESCE(@w, 0), @kind, CURRENT_TIMESTAMP)
           ON CONFLICT(root, path) DO UPDATE
             SET writable = CASE
                   WHEN @w IS NULL THEN recent_files.writable
                   WHEN recent_files.app_id = @appId
                     THEN MAX(recent_files.writable, @w)
                   ELSE @w
                 END,
                 app_id = @appId, kind = @kind,
                 last_opened = CURRENT_TIMESTAMP`,
        )
        .run({ root, path, appId, w, kind });
      // Prune on the write path so the table cannot grow unbounded. The id
      // tiebreak matters: CURRENT_TIMESTAMP has second precision, so a burst
      // of opens inside one second would otherwise prune arbitrarily.
      this.db.db
        .prepare(
          `DELETE FROM recent_files WHERE id NOT IN (
             SELECT id FROM recent_files
             ORDER BY last_opened DESC, id DESC LIMIT ?
           )`,
        )
        .run(MAX_RECENTS);
    });
    tx();
  }

  /** True when `(root, path)` is among `appId`'s own recent files. */
  isRecentOf(root: string, path: string, appId: string): boolean {
    return this.ownRecent(root, path, appId) !== null;
  }

  /**
   * `appId`'s own recent at `(root, path)`: whether it could write it then,
   * and whether it was a file or a folder; null for none.
   */
  ownRecent(
    root: string,
    path: string,
    appId: string,
  ): { writable: boolean; kind: RecentKind } | null {
    const row = this.db.db
      .prepare(
        `SELECT writable, kind FROM recent_files WHERE root = ? AND path = ? AND app_id = ?`,
      )
      .get(root, path, appId) as
      | { writable: number; kind: RecentKind }
      | undefined;
    return row === undefined
      ? null
      : { writable: row.writable === 1, kind: row.kind };
  }

  /**
   * Remove one entry (self-heal after a 404 reopen). With `appId`, only if
   * that app recorded it: an app tidies its own entries, not another's.
   */
  remove(root: string, path: string, appId?: string): void {
    if (appId === undefined) {
      this.db.db
        .prepare(`DELETE FROM recent_files WHERE root = ? AND path = ?`)
        .run(root, path);
      return;
    }
    this.db.db
      .prepare(
        `DELETE FROM recent_files WHERE root = ? AND path = ? AND app_id = ?`,
      )
      .run(root, path, appId);
  }

  /** The privacy affordance: wipe the list. */
  clear(): void {
    this.db.db.prepare(`DELETE FROM recent_files`).run();
  }
}
