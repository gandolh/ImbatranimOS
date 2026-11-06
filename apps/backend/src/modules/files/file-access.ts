import { ForbiddenException, Injectable } from '@nestjs/common';

import type { AppIdentity } from '../app-identity/app-identity.types';
import { FileGrants } from '../app-identity/file-grants.service';
import { ModeStore, type ModeOp } from '../app-identity/mode-store.service';
import type { EntryKind } from '../app-identity/modes';

/** The `code` in a 403's body when an app asks for a path it was not given. */
export const FILE_NOT_GRANTED = 'FILE_NOT_GRANTED';

/**
 * Why a call may go ahead: it is the user's, the app's own modes allow it (its
 * folders), or the app was given the path (a grant).
 */
export type Access = 'user' | 'mode' | 'grant';

/** A path as the caller named it, for a refusal to say which. */
export type Shown = { root: string; path: string };

/**
 * Who may do what to a path in the files API: the user anything; an app what
 * its modes allow (its own folders) and what its running copy was given.
 *
 * Refusals fail closed and name the path as the app gave it (`home:Documents/
 * a.txt`), never the host path behind it.
 */
@Injectable()
export class FileAccess {
  constructor(
    private readonly modes: ModeStore,
    private readonly grants: FileGrants,
  ) {}

  /** Why `app` may do `op` to `key` (an absolute path), or null when it may not. */
  how(app: AppIdentity | null, op: ModeOp, key: string): Access | null {
    if (app === null) return 'user';
    if (this.modes.may(app, op, key)) return 'mode';
    if (this.grants.covers(app, op, key)) return 'grant';
    return null;
  }

  /** {@link how}, refusing with a 403 that carries {@link FILE_NOT_GRANTED}. */
  assert(
    app: AppIdentity | null,
    op: ModeOp,
    key: string,
    shown: Shown,
  ): Access {
    const access = this.how(app, op, key);
    if (access !== null) return access;
    throw refusal(app!, op, shown);
  }

  /**
   * Record what a call just made at `key`. An app making something where its
   * own modes let it (its folders) owns it; one making something it was given
   * (a Save as into the user's Documents) leaves it the user's, as the
   * document portal does. The user's needs no row outside a setgid folder.
   */
  made(
    app: AppIdentity | null,
    access: Access,
    key: string,
    kind: EntryKind,
  ): void {
    this.modes.create(access === 'mode' ? app : null, key, kind);
  }

  /** Carry the modes of a path and what is under it along a rename. */
  moved(from: string, to: string): void {
    this.modes.move(from, to);
  }

  /** Forget the modes of a path and what is under it, as deleting it does. */
  removed(key: string): void {
    this.modes.remove(key);
  }
}

function refusal(app: AppIdentity, op: ModeOp, shown: Shown): Error {
  const where = `${shown.root}:${shown.path.replace(/^[/\\]+/, '')}`;
  return new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: FILE_NOT_GRANTED,
    message: `${app.appId} may not ${op} ${where}: it was not given it. Open it with the app, or pick it in the app's Open or Save dialog.`,
    root: shown.root,
    path: shown.path,
  });
}
