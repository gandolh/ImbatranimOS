import { ForbiddenException, Injectable } from '@nestjs/common';
import { posix } from 'path';

import { DbService } from '../../db/db.service';
import type { AppIdentity } from './app-identity.types';
import {
  assertMode,
  impliedEntry,
  newEntry,
  permits,
  R,
  S_ISVTX,
  W,
  X,
  type EntryKind,
  type ModeEntry,
} from './modes';

/**
 * What a caller may want to do to a path:
 * - `read` / `write`: a file's bytes (`r` / `w` on it);
 * - `list`: a folder's names (`r` and `x` on it);
 * - `traverse`: pass through a folder (`x` on it);
 * - `create` / `delete`: an entry in its parent (`w` and `x` on the parent;
 *   in a sticky parent, deleting also needs the entry or the parent to be the
 *   caller's);
 * - `chmod`: change its mode or group (its owner only).
 *
 * Every one also needs `x` on each folder above.
 */
export type ModeOp =
  | 'read'
  | 'write'
  | 'list'
  | 'traverse'
  | 'create'
  | 'delete'
  | 'chmod';

/** The `code` in a 403's body when a mode check refuses. */
export const MODE_REFUSED = 'MODE_REFUSED';

interface Row {
  path: string;
  owner: string | null;
  group_name: string;
  mode: number;
}

/**
 * The owner, group and mode of paths in the apps' data area, keyed by
 * absolute path in the `file_modes` table, and the checks on them.
 *
 * A path with no row is the user's (see `IMPLIED_DIRECTORY` and
 * `IMPLIED_FILE`), so the table holds only what apps made or what was
 * changed. The writes here don't check anything: a file route asks
 * {@link may} or {@link assert} first, then does the work, then records it.
 */
@Injectable()
export class ModeStore {
  constructor(private readonly dbs: DbService) {}

  /** The row for a path, or null when it has none (it is the user's). */
  stat(path: string): ModeEntry | null {
    const row = this.dbs.db
      .prepare(
        'SELECT path, owner, group_name, mode FROM file_modes WHERE path = ?',
      )
      .get(modeKey(path)) as Row | undefined;
    return row ? toEntry(row) : null;
  }

  /** The row for a path, or the implied entry for its kind. */
  effective(path: string, kind: EntryKind): ModeEntry {
    return this.stat(path) ?? impliedEntry(kind);
  }

  set(path: string, entry: ModeEntry): void {
    assertMode(entry.mode);
    this.dbs.db
      .prepare(
        `INSERT INTO file_modes (path, owner, group_name, mode, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET owner = excluded.owner,
           group_name = excluded.group_name, mode = excluded.mode,
           updated_at = excluded.updated_at`,
      )
      .run(modeKey(path), entry.owner, entry.group, entry.mode, Date.now());
  }

  /**
   * Record something the caller just made at `path`: its owner, its group
   * (the parent's when the parent is setgid) and `mode`, private by default.
   * Returns the entry the path now has.
   */
  create(
    identity: AppIdentity | null,
    path: string,
    kind: EntryKind,
    mode?: number,
  ): ModeEntry {
    const key = modeKey(path);
    const parent = this.effective(posix.dirname(key), 'directory');
    const entry = newEntry(identity, parent, kind, mode);
    if (entry === null) {
      this.dbs.db.prepare('DELETE FROM file_modes WHERE path = ?').run(key);
      return impliedEntry(kind);
    }
    this.set(key, entry);
    return entry;
  }

  /** A new mode, owner and group kept. */
  chmod(path: string, kind: EntryKind, mode: number): ModeEntry {
    const entry = { ...this.effective(path, kind), mode };
    this.set(path, entry);
    return entry;
  }

  /** A new owner and group, mode kept. */
  chown(
    path: string,
    kind: EntryKind,
    owner: string | null,
    group: string,
  ): ModeEntry {
    const entry = { ...this.effective(path, kind), owner, group };
    this.set(path, entry);
    return entry;
  }

  /** Forget a path and everything under it, as deleting it does. */
  remove(path: string): void {
    const key = modeKey(path);
    const under = key === '/' ? '/' : `${key}/`;
    this.dbs.db
      .prepare(
        'DELETE FROM file_modes WHERE path = ? OR substr(path, 1, ?) = ?',
      )
      .run(key, under.length, under);
  }

  /**
   * Carry a path's rows, and those under it, to a new path, as renaming it
   * does. Whatever the destination had is replaced.
   */
  move(from: string, to: string): void {
    const src = modeKey(from);
    const dst = modeKey(to);
    if (src === dst) return;
    if (dst.startsWith(src === '/' ? '/' : `${src}/`)) {
      throw new Error(`Cannot move ${src} inside itself`);
    }
    const under = `${src}/`;
    this.dbs.db.transaction(() => {
      this.remove(dst);
      this.dbs.db
        .prepare(
          `UPDATE file_modes SET path = ? || substr(path, ?), updated_at = ?
           WHERE path = ? OR substr(path, 1, ?) = ?`,
        )
        .run(dst, src.length + 1, Date.now(), src, under.length, under);
    })();
  }

  /** May this caller do `op` to `path`? The user always may. */
  may(identity: AppIdentity | null, op: ModeOp, path: string): boolean {
    if (identity === null) return true;
    const key = modeKey(path);
    const target = op === 'create' || op === 'delete' ? parentOf(key) : key;
    if (target === null) return false;
    const rows = this.rowsFor([...ancestorsOf(target), target, key]);
    const at = (p: string, kind: EntryKind) =>
      rows.get(p) ?? impliedEntry(kind);

    for (const folder of ancestorsOf(target)) {
      if (!permits(identity, at(folder, 'directory'), X)) return false;
    }
    switch (op) {
      case 'read':
        return permits(identity, at(key, 'file'), R);
      case 'write':
        return permits(identity, at(key, 'file'), W);
      case 'list':
        return permits(identity, at(key, 'directory'), R | X);
      case 'traverse':
        return permits(identity, at(key, 'directory'), X);
      case 'chmod':
        return rows.get(key)?.owner === identity.appId;
      case 'create':
        return permits(identity, at(target, 'directory'), W | X);
      case 'delete': {
        const parent = at(target, 'directory');
        if (!permits(identity, parent, W | X)) return false;
        if ((parent.mode & S_ISVTX) === 0) return true;
        return (
          rows.get(key)?.owner === identity.appId ||
          parent.owner === identity.appId
        );
      }
    }
  }

  /** {@link may}, refusing with a 403 that carries {@link MODE_REFUSED}. */
  assert(identity: AppIdentity | null, op: ModeOp, path: string): void {
    if (this.may(identity, op, path)) return;
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: MODE_REFUSED,
      message: `${identity?.appId ?? 'The user'} may not ${op} ${modeKey(path)}`,
    });
  }

  private rowsFor(paths: string[]): Map<string, ModeEntry> {
    const unique = [...new Set(paths)];
    const rows = this.dbs.db
      .prepare(
        `SELECT path, owner, group_name, mode FROM file_modes
         WHERE path IN (${unique.map(() => '?').join(', ')})`,
      )
      .all(...unique) as Row[];
    return new Map(rows.map((r) => [r.path, toEntry(r)]));
  }
}

/**
 * The key a path is stored under: absolute, normalised, no trailing slash.
 * A relative path, or one with a NUL, is a caller's bug, so it throws.
 */
export function modeKey(path: string): string {
  if (!posix.isAbsolute(path) || path.includes('\0')) {
    throw new Error(`A mode is kept for an absolute path, not ${path}`);
  }
  const normal = posix.normalize(path);
  return normal.length > 1 && normal.endsWith('/')
    ? normal.slice(0, -1)
    : normal;
}

/** The folders above a key, outermost first: `/a/b` → `/`, `/a`. */
export function ancestorsOf(key: string): string[] {
  if (key === '/') return [];
  const parts = key.split('/').slice(1, -1);
  const out = ['/'];
  let at = '';
  for (const part of parts) {
    at += `/${part}`;
    out.push(at);
  }
  return out;
}

function parentOf(key: string): string | null {
  return key === '/' ? null : posix.dirname(key);
}

function toEntry(row: Row): ModeEntry {
  return { owner: row.owner, group: row.group_name, mode: row.mode };
}
