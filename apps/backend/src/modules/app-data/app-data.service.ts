import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { Stats } from 'fs';
import * as fs from 'fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'path';

import type { AppIdentity } from '../app-identity/app-identity.types';
import { ModeStore } from '../app-identity/mode-store.service';
import {
  DATA_KINDS,
  folderOf,
  homeRoot,
  MAX_DATA_BYTES,
  normaliseDataPath,
  STAGED_NAME,
  type DataKind,
} from './app-data.paths';

/** A file read from an app's folder. */
export interface DataFile {
  /** Its path inside the folder, as normalised. */
  path: string;
  /** Its bytes as UTF-8 text. */
  content: string;
  /** {@link dataVersion} of its bytes. A write sends it back as `expected`. */
  version: string;
}

/** One entry of an app's folder. Links and other special files are left out. */
export interface DataEntry {
  name: string;
  /** Its path inside the folder. */
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

/**
 * A file's version: a hash of its bytes. The modification time and size would
 * miss two saves of the same length inside one millisecond, which two tabs
 * saving one small JSON file can do; the files are small enough to hash.
 */
export function dataVersion(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 32);
}

/**
 * `system.data`: each app's folders of its own, one per kind
 * (`app-data.paths.ts`), read and written as the app.
 *
 * - **The folder is the OS's to make.** Its name comes from the caller's
 *   identity, and the OS creates it on the first write and records it as the
 *   app's: owner the app, group the app's own, `rwx------`. An installed app
 *   could not create it itself, since `imbatranim/` above it is the user's.
 * - **Every path stays inside.** A path is checked lexically, then through
 *   the real paths of the folder and of the target (its nearest existing
 *   ancestor for a new one), so neither `../` nor a link leads out; the folder
 *   itself may not be a link.
 * - **Modes apply inside.** Every read, write, listing and removal asks the
 *   mode store first, and what a call makes is recorded as the app's,
 *   `rw-------` for a file and `rwx------` for a folder.
 * - **A write names the version it read.** One that doesn't match what is
 *   on disk now is refused with a 409 carrying the current one, so two tabs
 *   saving one file can't silently overwrite each other. Writes to one path
 *   take turns, so the check and the rename can't interleave.
 *
 * The methods take an identity rather than a request, so the OS itself can
 * write into an app's folder as that app (a one-time move of data an app kept
 * elsewhere) with the same checks and the same records.
 */
@Injectable()
export class AppDataService {
  private readonly logger = new Logger(AppDataService.name);
  private readonly turns = new Map<string, Promise<void>>();

  constructor(private readonly modes: ModeStore) {}

  /** An app's folder of one kind, in the current home. */
  folder(appId: string, kind: DataKind): string {
    return folderOf(appId, kind, homeRoot());
  }

  /** A file's text and version, or null when there is none. */
  async read(
    identity: AppIdentity,
    kind: DataKind,
    rawPath: string,
  ): Promise<DataFile | null> {
    const { folder, abs, path } = await this.resolve(identity, kind, rawPath);
    this.adoptFolder(identity, folder, await this.lstat(folder));
    const stat = await this.stat(abs);
    if (!stat) {
      // Saying "not there" needs only a way through the folder above it.
      this.modes.assert(identity, 'traverse', dirname(abs));
      return null;
    }
    if (stat.isDirectory()) {
      throw new BadRequestException(`${path} is a folder`);
    }
    this.modes.assert(identity, 'read', abs);
    if (stat.size > MAX_DATA_BYTES) {
      throw new PayloadTooLargeException(
        `${path} is larger than ${MAX_DATA_BYTES} bytes`,
      );
    }
    const bytes = await fs.readFile(abs);
    return {
      path,
      content: bytes.toString('utf8'),
      version: dataVersion(bytes),
    };
  }

  /**
   * Write a file, creating the folder and any folders on the way.
   *
   * `expected` is the version the caller read: a string when it read a file,
   * null when it read none (the file must still not exist), and absent to
   * write whatever is there now. A mismatch writes nothing and answers 409
   * with `current`, the version on disk (null when there is no file).
   */
  async write(
    identity: AppIdentity,
    kind: DataKind,
    rawPath: string,
    content: string,
    expected?: string | null,
  ): Promise<{ path: string; version: string }> {
    const bytes = Buffer.from(content, 'utf8');
    if (bytes.length > MAX_DATA_BYTES) {
      throw new PayloadTooLargeException(
        `A data file holds at most ${MAX_DATA_BYTES} bytes`,
      );
    }
    const { folder, abs, path } = await this.resolve(identity, kind, rawPath);
    return this.inTurn(abs, async () => {
      await this.ensureFolder(identity, folder);
      const existing = await this.lstat(abs);
      if (existing?.isDirectory()) {
        throw new BadRequestException(`${path} is a folder`);
      }
      if (existing) {
        this.modes.assert(identity, 'write', abs);
      } else {
        await this.ensureFolders(identity, folder, dirname(abs));
        this.modes.assert(identity, 'create', abs);
      }

      if (expected !== undefined) {
        const current = existing ? dataVersion(await fs.readFile(abs)) : null;
        if (current !== expected) {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: `${path} changed since it was read`,
            current,
          });
        }
      }

      await this.writeAtomically(abs, bytes);
      if (!existing) this.modes.create(identity, abs, 'file');
      return { path, version: dataVersion(bytes) };
    });
  }

  /** The entries of a folder inside the app's; none when it doesn't exist yet. */
  async list(
    identity: AppIdentity,
    kind: DataKind,
    rawPath = '',
  ): Promise<DataEntry[]> {
    const { folder, abs, path } = await this.resolve(
      identity,
      kind,
      rawPath,
      true,
    );
    this.adoptFolder(identity, folder, await this.lstat(folder));
    const stat = await this.stat(abs);
    if (!stat) return [];
    if (!stat.isDirectory()) {
      throw new BadRequestException(`${path} is not a folder`);
    }
    this.modes.assert(identity, 'list', abs);
    const out: DataEntry[] = [];
    for (const dirent of await fs.readdir(abs, { withFileTypes: true })) {
      if (STAGED_NAME.test(dirent.name)) {
        if (dirent.isFile()) await this.dropIfStale(join(abs, dirent.name));
        continue;
      }
      if (!dirent.isFile() && !dirent.isDirectory()) continue;
      const entry = await this.lstat(join(abs, dirent.name));
      if (!entry) continue; // gone since the listing
      out.push({
        name: dirent.name,
        path: path === '' ? dirent.name : `${path}/${dirent.name}`,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isDirectory() ? 0 : entry.size,
        modifiedAt: entry.mtime.toISOString(),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Remove a file or a folder (and what is in it). A link is removed itself,
   * never what it points at. True when there was something to remove.
   */
  async remove(
    identity: AppIdentity,
    kind: DataKind,
    rawPath: string,
  ): Promise<boolean> {
    const { folder, abs } = await this.resolve(identity, kind, rawPath, false, {
      followLeaf: false,
    });
    return this.inTurn(abs, async () => {
      this.adoptFolder(identity, folder, await this.lstat(folder));
      const stat = await this.lstat(abs);
      if (!stat) return false;
      this.modes.assert(identity, 'delete', abs);
      await fs.rm(abs, { recursive: true, force: true });
      this.modes.remove(abs);
      return true;
    });
  }

  /**
   * Remove apps' folders of the given kinds, with their modes: uninstalling
   * an app always takes its cache, and the rest when the owner asks.
   * A folder that is a link loses the link only.
   */
  async removeFolders(
    appIds: readonly string[],
    kinds: readonly DataKind[] = DATA_KINDS,
  ): Promise<void> {
    for (const appId of appIds) {
      for (const kind of kinds) {
        const folder = this.folder(appId, kind);
        await this.inTurn(folder, async () => {
          await fs.rm(folder, { recursive: true, force: true });
          this.modes.remove(folder);
        });
      }
    }
  }

  /**
   * {@link removeFolders} for the caches, logged rather than thrown: an
   * uninstall that got this far is done, and a cache left behind is only
   * space.
   */
  async removeCaches(appIds: readonly string[]): Promise<void> {
    try {
      await this.removeFolders(appIds, ['cache']);
    } catch (err) {
      this.logger.warn(
        `Could not remove the caches of ${appIds.join(', ')}: ${String(err)}`,
      );
    }
  }

  // ── paths ────────────────────────────────────────────────────────────────

  /**
   * The app's folder and the target inside it, checked lexically and through
   * real paths. `followLeaf: false` checks the target's parent instead of the
   * target, so a link can be removed as the link it is.
   */
  private async resolve(
    identity: AppIdentity,
    kind: DataKind,
    rawPath: string,
    allowRoot = false,
    { followLeaf = true }: { followLeaf?: boolean } = {},
  ): Promise<{ folder: string; abs: string; path: string }> {
    const home = homeRoot();
    const folder = folderOf(identity.appId, kind, home);
    const path = normaliseDataPath(rawPath, allowRoot);
    const abs = path === '' ? folder : resolve(folder, path);
    if (!within(folder, abs)) throw leaves();

    // The folder itself is a folder or nothing yet: a link there would hand
    // the app whatever it points at, another app's folder included.
    const own = await this.lstat(folder);
    if (own && !own.isDirectory()) {
      throw new BadRequestException(
        `${identity.appId}'s ${kind} folder is not a folder`,
      );
    }
    const realHome = await realpathAllowingMissing(home);
    const realFolder = await realpathAllowingMissing(folder);
    if (!within(realHome, realFolder) || realFolder === realHome) {
      throw leaves();
    }
    const checked = followLeaf || abs === folder ? abs : dirname(abs);
    const realTarget = await realpathAllowingMissing(checked);
    if (!within(realFolder, realTarget)) throw leaves();
    return { folder, abs, path };
  }

  // ── folders and their modes ──────────────────────────────────────────────

  /**
   * Make the app's folder if it is missing and record it as the app's. The
   * OS does this, not the app, so it is not a mode check.
   */
  private async ensureFolder(
    identity: AppIdentity,
    folder: string,
  ): Promise<void> {
    await diskFull(() => fs.mkdir(folder, { recursive: true }));
    this.adoptFolder(identity, folder, await this.lstat(folder));
  }

  /**
   * A folder that exists with no mode row (made before it had one, by hand,
   * or brought back by a restore) becomes the app's, as the OS would have
   * made it. A row already there is kept: the owner may have changed it.
   */
  private adoptFolder(
    identity: AppIdentity,
    folder: string,
    stat: Stats | null,
  ): void {
    if (!stat || this.modes.stat(folder) !== null) return;
    this.modes.create(identity, folder, 'directory');
  }

  /** Make the folders between the app's folder and `dir`, each the app's. */
  private async ensureFolders(
    identity: AppIdentity,
    folder: string,
    dir: string,
  ): Promise<void> {
    if (dir === folder) return;
    const parts = relative(folder, dir).split(sep);
    let at = folder;
    for (const part of parts) {
      at = join(at, part);
      const stat = await this.lstat(at);
      if (stat?.isDirectory()) continue;
      if (stat)
        throw new BadRequestException(`${part} is a file, not a folder`);
      this.modes.assert(identity, 'create', at);
      await diskFull(() => fs.mkdir(at));
      this.modes.create(identity, at, 'directory');
    }
  }

  // ── files ────────────────────────────────────────────────────────────────

  /**
   * Stage beside the file and rename over it, so a failure part-way leaves
   * the old bytes in place. The staged copy is private and never listed.
   * The bytes are flushed to disk before the rename, and the folder after
   * it: without that, a crash or power loss right after a save could leave
   * the file empty, and an app's data file may be the user's only copy.
   */
  private async writeAtomically(abs: string, bytes: Buffer): Promise<void> {
    const staged = join(
      dirname(abs),
      `.${basename(abs)}.imbatranim-${randomUUID()}.part`,
    );
    try {
      await diskFull(async () => {
        const file = await fs.open(staged, 'w', 0o600);
        try {
          await file.writeFile(bytes);
          await file.sync();
        } finally {
          await file.close();
        }
      });
      await diskFull(() => fs.rename(staged, abs));
      await syncFolder(dirname(abs));
    } catch (err) {
      await fs.rm(staged, { force: true });
      throw err;
    }
  }

  /**
   * A staged copy older than an hour is a leftover from a write that never
   * finished (a crash between staging and the rename); a listing clears it.
   * A fresh one may belong to a write in progress, so it stays. Best effort.
   */
  private async dropIfStale(staged: string): Promise<void> {
    const stat = await this.lstat(staged);
    if (!stat?.isFile()) return;
    if (Date.now() - stat.mtimeMs < STALE_STAGED_MS) return;
    await fs.rm(staged, { force: true }).catch(() => undefined);
  }

  /** Run `work` once every earlier call for the same path is done. */
  private async inTurn<T>(key: string, work: () => Promise<T>): Promise<T> {
    const before = this.turns.get(key) ?? Promise.resolve();
    let done!: () => void;
    const mine = new Promise<void>((r) => (done = r));
    const queued = before.then(() => mine);
    this.turns.set(key, queued);
    await before;
    try {
      return await work();
    } finally {
      done();
      if (this.turns.get(key) === queued) this.turns.delete(key);
    }
  }

  private async lstat(p: string): Promise<Stats | null> {
    try {
      return await fs.lstat(p);
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  private async stat(p: string): Promise<Stats | null> {
    try {
      return await fs.stat(p);
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }
}

function within(root: string, p: string): boolean {
  return p === root || p.startsWith(root + sep);
}

/**
 * Flush a folder's entries to disk, so a rename into it survives a crash.
 * Best effort: some file systems refuse to open a folder for syncing, and
 * the rename has already happened by then.
 */
/** How old a staged copy must be before a listing treats it as left over. */
const STALE_STAGED_MS = 60 * 60 * 1000;

async function syncFolder(path: string): Promise<void> {
  let dir: fs.FileHandle | undefined;
  try {
    dir = await fs.open(path, 'r');
    await dir.sync();
  } catch {
    // The data is written; only its durability across a crash is weaker.
  } finally {
    await dir?.close().catch(() => undefined);
  }
}

function leaves(): BadRequestException {
  return new BadRequestException("That path leads out of the app's folder");
}

function isMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** A full disk as a 503 a person can act on, like the files module's. */
async function diskFull<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOSPC' || code === 'EDQUOT') {
      throw new ServiceUnavailableException(
        'The disk is full — free some space and try again.',
      );
    }
    throw err;
  }
}

/**
 * The real path of `p`, or of its nearest existing ancestor with the missing
 * rest appended (which holds no link, being missing).
 */
async function realpathAllowingMissing(p: string): Promise<string> {
  const missing: string[] = [];
  let current = p;
  for (;;) {
    try {
      const real = await fs.realpath(current);
      return missing.length ? resolve(real, ...missing.reverse()) : real;
    } catch (err) {
      if (!isMissing(err)) throw err;
      const parent = dirname(current);
      if (parent === current) return p;
      missing.push(basename(current));
      current = parent;
    }
  }
}
