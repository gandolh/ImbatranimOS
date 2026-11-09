import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { join, resolve, relative, basename, dirname, sep } from 'path';
import * as fs from 'fs/promises';
import { constants as fsConstants, createReadStream } from 'fs';
import type { Dirent, Stats } from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';

import type { AppIdentity } from '../app-identity/app-identity.types';
import type { ModeOp } from '../app-identity/mode-store.service';
import { addOnlyRefusal, FileAccess, type Access } from './file-access';

/**
 * Cap for the text-content endpoint. Reading into a UTF-8 string materialises
 * the whole file (plus its JSON-encoded copy) in the heap, so a huge file would
 * spike memory / stall the event loop. Large files should go through the
 * streaming download path instead. Env-overridable; defaults to 5 MB.
 */
const MAX_TEXT_FILE_BYTES =
  Number(process.env.FILES_MAX_TEXT_BYTES) || 5 * 1024 * 1024;

/**
 * A cheap "has this file changed" token: the modification time in
 * whole milliseconds and the size. Content hashes would mean reading large
 * files on every listing; two writes inside one millisecond with the same size
 * are the accepted blind spot.
 */
export function versionOf(stat: Pick<Stats, 'mtimeMs' | 'size'>): string {
  return `${Math.trunc(stat.mtimeMs)}-${stat.size}`;
}

/** What `link()` fails with on a file system that has no hard links. */
const NO_HARD_LINKS: ReadonlySet<string> = new Set([
  'EPERM',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EXDEV',
]);

/**
 * A 409 for a name already taken, for a caller that may add a file there but
 * not write over one; `current` is the taken file's version.
 */
function nameTaken(current: string | null): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'NAME_TAKEN',
    message: 'That name is taken: pick another',
    current,
  });
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
  /** ctime — POSIX has no true birth time on every filesystem. */
  createdAt: string;
  /** POSIX permission bits as octal, e.g. "644". Display only. */
  mode: string;
  /** True when the entry itself is a symlink (type reflects its target). */
  isSymlink: boolean;
  /** {@link versionOf} the file (its target, for a symlink). Send it back as `expected`. */
  version: string;
}

/** One line inside a file that matched a `content=1` search. */
export interface SearchMatch {
  /** 1-based line number, so it can be handed straight to an editor. */
  line: number;
  /** The line itself, trimmed and length-capped — a preview, not the file. */
  text: string;
}

/** One hit from {@link FilesService.search}. `path` is root-relative. */
export interface SearchHit {
  name: string;
  path: string;
  type: 'file' | 'directory';
  /**
   * Which lines matched, for a `content=1` search that asked for them
   *. Absent on name-only matches and on every request that did
   * not opt in, so the response stays byte-identical for the command palette
   * and the file manager's search box.
   */
  matches?: SearchMatch[];
}

/** Recursive size of a directory, with the caps that stopped the walk. */
export interface DirSize {
  bytes: number;
  files: number;
  directories: number;
  /** True when an entry/depth/time cap stopped the walk — the number is a floor. */
  truncated: boolean;
}

/**
 * Run a write and translate a full disk into something a human can act on.
 *
 * Nothing distinguished ENOSPC before, so a full volume surfaced as a raw 500
 * and every save just "failed" — the OS looked broken rather than out of space,
 * which on a container volume is a likely failure mode (one big download, one
 * archive extract, an accumulating Trash).
 *
 * Only ENOSPC/EDQUOT are translated. Permission errors, too-large uploads and
 * the rest keep their own distinct messages.
 */
async function withDiskSpaceCheck<T>(op: () => Promise<T>): Promise<T> {
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

export interface SearchResult {
  items: SearchHit[];
  /** True when any bound (results/entries/depth/time) stopped the walk early. */
  truncated: boolean;
}

/**
 * Directories the search walk never descends into. `node_modules`/`.git` are
 * huge + never interesting; dot-directories are skipped separately by prefix.
 */
const SEARCH_SKIP_DIRS = new Set(['node_modules', '.git']);

/**
 * Where the `notes` root lives. Both roots resolve dynamically (see
 * {@link FilesService.getRootDir}) so tests and the container can point them
 * at a real directory via env without re-importing the module.
 *
 * Read from NOTES_DIR at call time, like `homeRoot()` reads FILES_ROOT, rather
 * than baked in at import. It used to be a hardcoded `<cwd>/data/notes`, which
 * silently ignored NOTES_DIR — so in the container it resolved to
 * `/app/data/notes`, inside the image's writable layer, while the volume is
 * `/home/imbatranim` and `entrypoint.sh` was dutifully creating
 * `/home/imbatranim/notes` for nobody. Every note written in Notepad was
 * therefore destroyed the moment the container was recreated, which the README
 * actively encourages ("delete and recreate the container as often as you
 * like; the volume is what persists").
 *
 * The fallback keeps the previous behaviour when NOTES_DIR is unset.
 */
function notesRoot(): string {
  return resolve(process.env.NOTES_DIR || resolve(process.cwd(), 'data/notes'));
}

/** A path resolved inside a root: where it is, and the key its modes and grants are kept under. */
export interface Located {
  rootDir: string;
  /** The jailed path, as named (a link in it is not followed). */
  abs: string;
  /**
   * The absolute path the modes and grants check: the real path of the
   * target (its parent's, for a call that acts on a link itself), under the
   * root as configured, so a link inside the home can't lead past a check.
   */
  key: string;
}

/**
 * The jailed file API, with the caller checked.
 *
 * Every method a route calls takes the calling app last: null (the default)
 * is the user, who may do anything in the jail; an app may do what its modes
 * allow (its own folders) and what its running copy was given (see
 * {@link FileAccess}). The OS's own callers (archives, backups, git) leave it
 * out and act as the user.
 */
@Injectable()
export class FilesService {
  /**
   * The checks are optional only so the OS's own users can build the service
   * by hand (`new FilesService()` in their specs): without them, any call that
   * names an app is refused rather than let through.
   */
  constructor(@Optional() private readonly access?: FileAccess) {}

  /**
   * The real home root: FILES_ROOT env override, else the process user's home
   * dir. In the container this IS /home/imbatranim. Resolved per-call so an
   * env change (tests) takes effect without a module reload.
   */
  private homeRoot(): string {
    return resolve(process.env.FILES_ROOT || os.homedir());
  }

  /** Resolve a root name to an absolute directory. Throws if unknown. */
  private getRootDir(root: string): string {
    if (root === 'home') return this.homeRoot();
    if (root === 'notes') return notesRoot();
    throw new BadRequestException(`Unknown root: ${root}`);
  }

  /**
   * Percent-decode a path defensively, unwrapping nested encoding of traversal
   * (e.g. `%252e%252e` → `%2e%2e` → `..`) WITHOUT over-decoding benign literals.
   *
   * Express already decodes query params once, so most input arrives decoded.
   * The old version decoded up to 6× unconditionally, which meant a real file
   * named `a%2Bb.txt` became `a+b.txt` (unaddressable) and `report%20v2.txt`
   * silently became `report v2.txt`. The fix keeps unwrapping only while a pass
   * actually REVEALS a new traversal-significant character (a path separator, a
   * `..` segment, or a NUL); the moment a pass introduces none of those, it is
   * decoding a legitimate literal, so we stop and keep the pre-decode form.
   *
   * Traversal safety is unchanged: encoded `..`/separators still unwrap all the
   * way to their dangerous form, where {@link resolveSafe}'s jail rejects them.
   */
  private fullyDecode(input: string): string {
    let prev = input;
    for (let i = 0; i < 6; i++) {
      let next: string;
      try {
        next = decodeURIComponent(prev);
      } catch {
        return prev; // malformed % sequence — treat remainder as literal
      }
      if (next === prev) return next;
      // A pass that reveals no new separator/`..`/NUL is unwrapping a benign
      // literal — keep the previous (still-encoded) form so it stays addressable.
      if (!this.revealsTraversalChar(prev, next)) return prev;
      prev = next;
    }
    return prev;
  }

  /**
   * True when `after` contains a traversal-significant character (a path
   * separator, a `..` path segment, or a NUL) that `before` did not — i.e. this
   * decode pass unwrapped something that matters to the jail.
   */
  private revealsTraversalChar(before: string, after: string): boolean {
    const dotdot = /(?:^|[/\\])\.\.(?:[/\\]|$)/;
    const sep = /[/\\]/;
    return (
      (sep.test(after) && !sep.test(before)) ||
      (dotdot.test(after) && !dotdot.test(before)) ||
      (after.includes('\0') && !before.includes('\0'))
    );
  }

  /**
   * realpath that tolerates a not-yet-existing leaf: walks up to the nearest
   * existing ancestor, canonicalises THAT (following symlinks), then re-appends
   * the missing (symlink-free, because non-existent) tail. This is what makes
   * the jail symlink-proof for create/upload/mkdir targets.
   */
  private async realpathAllowingMissing(p: string): Promise<string> {
    const missing: string[] = [];
    let current = p;
    // Bounded by path depth; dirname eventually hits the fs root fixpoint.
    for (;;) {
      try {
        const real = await fs.realpath(current);
        return missing.length
          ? resolve(real, ...missing.slice().reverse())
          : real;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        const parent = dirname(current);
        if (parent === current) return p; // nothing on this path exists
        missing.push(basename(current));
        current = parent;
      }
    }
  }

  /**
   * Resolve a root-relative virtual path to an absolute, jailed host path.
   *
   * Defence in depth:
   *  1. Full percent-decode, so encoded traversal (%2e%2e, %252e) can't slip
   *     past — Express already decodes query strings once; this catches nested
   *     encoding and direct service calls.
   *  2. Reject NUL bytes.
   *  3. Strip leading slashes/backslashes so the path is always root-relative
   *     (an absolute input can never re-root the resolve).
   *  4. Lexical jail: the resolved path must equal the root or sit under
   *     `root + sep` — kills `../` escapes.
   *  5. Symlink jail: realpath both the root and the target (or its nearest
   *     existing ancestor) and re-verify containment — kills symlink escapes.
   */
  async resolveSafe(root: string, virtualPath = ''): Promise<Located> {
    const rootDir = this.getRootDir(root);
    let vp = this.fullyDecode(virtualPath ?? '');
    if (vp.includes('\0')) throw new BadRequestException('Invalid path');
    vp = vp.replace(/^[/\\]+/, '');
    const abs = resolve(rootDir, vp);

    // (4) lexical containment
    if (abs !== rootDir && !abs.startsWith(rootDir + sep)) {
      throw new BadRequestException('Path traversal detected');
    }

    // (5) symlink containment
    const realRoot = await this.realpathAllowingMissing(rootDir);
    const realTarget = await this.realpathAllowingMissing(abs);
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
      throw new BadRequestException('Path traversal detected');
    }

    return { rootDir, abs, key: join(rootDir, relative(realRoot, realTarget)) };
  }

  /**
   * Like {@link resolveSafe}, but validates realpath containment on the PARENT
   * directory only and never follows a symlink AT the leaf.
   *
   * `resolveSafe` realpaths the leaf, which follows a symlink there — so a
   * broken link (its target ENOENTs) reads as "not found" (404) and a link
   * pointing out of the jail reads as an escape (400). Both mean the UI can
   * never remove such a link. Operations that act on the link ITSELF
   * (delete/trash) resolve through this instead: the parent chain must still sit
   * inside the jail (symlink-proof), but the leaf is taken lexically so it can
   * be `lstat`/`unlink`ed as the link it is, never its target.
   */
  async resolveSafeNoFollow(root: string, virtualPath = ''): Promise<Located> {
    const rootDir = this.getRootDir(root);
    let vp = this.fullyDecode(virtualPath ?? '');
    if (vp.includes('\0')) throw new BadRequestException('Invalid path');
    vp = vp.replace(/^[/\\]+/, '');
    const abs = resolve(rootDir, vp);

    if (abs !== rootDir && !abs.startsWith(rootDir + sep)) {
      throw new BadRequestException('Path traversal detected');
    }
    // No leaf (the root itself) — nothing to follow; defer to resolveSafe.
    if (abs === rootDir) return { rootDir, abs, key: rootDir };

    const realRoot = await this.realpathAllowingMissing(rootDir);
    const realParent = await this.realpathAllowingMissing(dirname(abs));
    if (realParent !== realRoot && !realParent.startsWith(realRoot + sep)) {
      throw new BadRequestException('Path traversal detected');
    }
    // Return the lexical abs (like resolveSafe) — the containment check above
    // used the realpath, but lstat/unlink never follow the final component, so
    // the leaf link is operated on in place.
    return {
      rootDir,
      abs,
      key: join(rootDir, relative(realRoot, realParent), basename(abs)),
    };
  }

  // ── who may ──────────────────────────────────────────────────────────────

  /** Why `who` may do `op` to `key`, or null. The user always may. */
  can(who: AppIdentity | null, op: ModeOp, key: string): Access | null {
    if (who === null) return 'user';
    // Without the checks there is no way to tell, so an app is refused.
    return this.access?.how(who, op, key) ?? null;
  }

  /**
   * When `who` may make something at `key` only because it was given an
   * `assets/` folder to add to: what it may make there (see
   * `FileAccess.addOnly`). Null for everyone else.
   */
  private addOnly(
    who: AppIdentity | null,
    key: string,
  ): 'folder' | 'file' | null {
    return this.access?.addOnly(who, key) ?? null;
  }

  /** {@link can}, refusing with a 403 that names the path as `who` gave it. */
  assertCan(
    who: AppIdentity | null,
    op: ModeOp,
    key: string,
    root: string,
    path: string,
  ): Access {
    if (who === null) return 'user';
    if (!this.access) {
      throw new Error('The files service was built without its checks');
    }
    return this.access.assert(who, op, key, { root, path });
  }

  /** Resolve a path and check `who` may do `op` to it; the key it was checked under. */
  async check(
    who: AppIdentity | null,
    op: ModeOp,
    root: string,
    virtualPath: string,
    { follow = true }: { follow?: boolean } = {},
  ): Promise<Located & { access: Access }> {
    const located = follow
      ? await this.resolveSafe(root, virtualPath)
      : await this.resolveSafeNoFollow(root, virtualPath);
    const access = this.assertCan(who, op, located.key, root, virtualPath);
    return { ...located, access };
  }

  /** Record what `who` just made at `key` (see `FileAccess.made`). */
  private recordMade(
    who: AppIdentity | null,
    access: Access,
    key: string,
    kind: 'file' | 'directory',
  ): void {
    this.access?.made(who, access, key, kind);
  }

  /** Forget the modes kept for a path that went away (deleted, trashed). */
  forget(key: string): void {
    this.access?.removed(key);
  }

  /**
   * The folders between `dir`'s nearest existing ancestor and `dir`, which a
   * write is about to make, outermost first. Each is checked as a `create`
   * when the write is allowed by the app's own modes; one it was given
   * carries the folders the owner typed with the file.
   */
  private async missingFolders(dir: string): Promise<string[]> {
    const missing: string[] = [];
    let at = dir;
    while (!(await this.exists(at))) {
      missing.unshift(at);
      const up = dirname(at);
      if (up === at) break;
      at = up;
    }
    return missing;
  }

  /**
   * Check, then record, the write of a file at `abs`: `write` over one that
   * is there, `create` (and each missing folder above it) for a new one.
   * Returns the record to make once the bytes are in place, and whether the
   * file must be placed only if nothing is there by then: a caller that may
   * make it but not write over it (an app adding to an `assets/` folder) is
   * never let replace a file that appeared since this check.
   *
   * An app that was given a place to add files to but may not write over
   * one there, asking for a name that is taken, is answered 409 with the
   * file's version: the name is the app's to change.
   */
  private async checkWrite(
    who: AppIdentity | null,
    located: Located,
    root: string,
    virtualPath: string,
  ): Promise<{ record: () => void; exclusive: boolean }> {
    const { abs, key } = located;
    const existing = await fs.stat(abs).catch(() => null);
    if (existing) {
      if (existing.isDirectory()) {
        this.assertCan(who, 'write', key, root, virtualPath);
        throw new BadRequestException('Path is a directory');
      }
      if (this.addOnly(who, key) === 'file') {
        throw nameTaken(versionOf(existing));
      }
      this.assertCan(who, 'write', key, root, virtualPath);
      return { record: () => undefined, exclusive: false };
    }
    const folders = await this.missingFolders(dirname(abs));
    const keyOf = (p: string) => join(dirname(key), relative(dirname(abs), p));
    const adds = this.addOnly(who, key);
    // Adding to `assets/` makes a file directly in it, and at most the
    // folder itself: never a file where the folder goes, nor the folders
    // above it.
    if (adds === 'folder' || (adds === 'file' && folders.length > 1)) {
      throw addOnlyRefusal(who!, { root, path: virtualPath });
    }
    // Given the file (or a folder above it), the folders typed with it come
    // with it. Otherwise the app may make the outermost folder in its own
    // folders, and what is made inside that is its own.
    let access = this.can(who, 'create', key);
    if (
      access === null &&
      folders.length > 0 &&
      this.can(who, 'create', keyOf(folders[0])) === 'mode'
    ) {
      access = 'mode';
    }
    access ??= this.assertCan(who, 'create', key, root, virtualPath);
    const made = access;
    return {
      record: () => {
        for (const folder of folders) {
          this.recordMade(who, made, keyOf(folder), 'directory');
        }
        this.recordMade(who, made, key, 'file');
      },
      // Its own folders' new files are the app's to write over; only what
      // it was given to add to is placed exclusively.
      exclusive: adds === 'file',
    };
  }

  private async exists(p: string): Promise<boolean> {
    try {
      await fs.stat(p);
      return true;
    } catch {
      return false;
    }
  }

  private async toEntry(rootDir: string, absPath: string): Promise<FileEntry> {
    const stat = await fs.lstat(absPath);
    // Report the target type for symlinks so the UI treats them sensibly,
    // falling back to the link itself if the target is broken.
    let type: 'file' | 'directory' = stat.isDirectory() ? 'directory' : 'file';
    let size = stat.size;
    let version = versionOf(stat);
    if (stat.isSymbolicLink()) {
      try {
        const t = await fs.stat(absPath);
        type = t.isDirectory() ? 'directory' : 'file';
        size = t.size;
        version = versionOf(t);
      } catch {
        type = 'file';
      }
    }
    return {
      name: basename(absPath),
      path: relative(rootDir, absPath),
      type,
      size,
      modifiedAt: stat.mtime.toISOString(),
      createdAt: stat.ctime.toISOString(),
      mode: (stat.mode & 0o777).toString(8).padStart(3, '0'),
      isSymlink: stat.isSymbolicLink(),
      version,
    };
  }

  async list(
    root: string,
    virtualPath = '',
    who: AppIdentity | null = null,
  ): Promise<FileEntry[]> {
    const { rootDir, abs } = await this.check(who, 'list', root, virtualPath);
    if (!(await this.exists(abs)))
      throw new NotFoundException('Directory not found');
    const stat = await fs.stat(abs);
    if (!stat.isDirectory()) throw new BadRequestException('Not a directory');

    const entries = await fs.readdir(abs, { withFileTypes: true });
    // An entry can vanish between readdir and lstat — e.g. uploadFile stages a
    // `.part` sibling in this very directory and renames it away, or another
    // client deletes a file mid-refresh. A per-entry ENOENT must drop that one
    // entry, not 500 the whole listing (mirrors dirSize's vanished-mid-walk
    // tolerance).
    const mapped = await Promise.all(
      entries.map((e) =>
        this.toEntry(rootDir, join(abs, e.name)).catch((err) => {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw err;
        }),
      ),
    );
    return mapped.filter((e): e is FileEntry => e !== null);
  }

  /**
   * Bounds for the search walk. Read per-call (not module-level consts) so tests
   * can dial them down via env without a module reload — the same idiom as
   * {@link FilesService.homeRoot}. Defaults keep a single search from walking the
   * whole disk or stalling the event loop.
   */
  private searchBounds() {
    return {
      // Hard cap on returned hits — the UI shows a bounded list anyway.
      maxResults: Number(process.env.FILES_SEARCH_MAX_RESULTS) || 100,
      // Ceiling on total dirents visited (the real DoS bound on tree size).
      maxEntries: Number(process.env.FILES_SEARCH_MAX_ENTRIES) || 20000,
      // Deepest directory level the walk will descend to.
      maxDepth: Number(process.env.FILES_SEARCH_MAX_DEPTH) || 12,
      // Wall-clock budget; past it we return partial results + truncated.
      budgetMs: Number(process.env.FILES_SEARCH_BUDGET_MS) || 3000,
      // Per-file size cap for the content grep; larger files are skipped.
      maxContentBytes:
        Number(process.env.FILES_SEARCH_MAX_CONTENT_BYTES) || 256 * 1024,
      /** Matching lines reported per file. A results panel wants a
       *  taste of each file, not a second copy of it. */
      maxMatchesPerFile: Number(process.env.FILES_SEARCH_MAX_MATCHES) || 5,
      /** Longest previewed line; a minified bundle would otherwise ship 200KB
       *  on one "line". */
      maxMatchChars: Number(process.env.FILES_SEARCH_MAX_MATCH_CHARS) || 200,
    };
  }

  /**
   * Jailed, bounded, live filename/content search under a root.
   *
   * Jail: the root is resolved through {@link resolveSafe} (lexical + symlink
   * containment). The walk starts at that real root and only ever `join`s
   * dirent names onto the current dir — no `..`, and symlinks are never
   * followed — so every emitted `path` (relative to the root) provably stays
   * inside the jail without a per-hit re-check.
   *
   * Bounds: results/entries/depth/time caps (see {@link searchBounds}); hitting
   * any returns the partial list with `truncated: true`. `node_modules`, `.git`
   * and dot-directories are always skipped.
   *
   * Scope: `opts.path` starts the walk at a subfolder — jailed by
   * the same `resolveSafe`, and every bound still applies. Emitted paths stay
   * **root**-relative whatever the scope, so a scoped response is shaped
   * exactly like an unscoped one and no consumer has to know which it asked
   * for.
   */
  async search(
    root: string,
    query: string,
    opts: { content?: boolean; path?: string; matches?: boolean } = {},
    who: AppIdentity | null = null,
  ): Promise<SearchResult> {
    // Jail the root exactly like every other endpoint (throws on escape).
    const { rootDir } = await this.resolveSafe(root, '');
    // The scope is jailed the same way — a traversal `path` throws here, and
    // the walk can only ever descend from what came back. An app searches
    // only a folder it may list, and the walk skips what it may not see.
    const { abs: startDir, key: startKey } = await this.check(
      who,
      'list',
      root,
      opts.path ?? '',
    );
    // The walk never follows a link, so a path under the start keys as its
    // place under the start's key.
    const keyOf = (abs: string) => join(startKey, relative(startDir, abs));
    const may = (op: ModeOp, abs: string) =>
      this.can(who, op, keyOf(abs)) !== null;

    const needle = query.toLowerCase();
    const wantContent = opts.content === true;
    // Per-match line data is opt-in on top of the content grep: the bytes are
    // already read either way, but the extra field would change the response
    // shape for consumers that never asked for it.
    const wantMatches = wantContent && opts.matches === true;
    const bounds = this.searchBounds();
    const deadline = Date.now() + bounds.budgetMs;

    const items: SearchHit[] = [];
    let scanned = 0;
    let truncated = false;

    // An empty needle would match everything; the DTO forbids it, but guard the
    // direct-call path too rather than dumping the whole tree.
    if (needle.length === 0) return { items, truncated };

    const capHit = (): boolean => {
      if (
        items.length >= bounds.maxResults ||
        scanned >= bounds.maxEntries ||
        Date.now() > deadline
      ) {
        truncated = true;
        return true;
      }
      return false;
    };

    const walk = async (absDir: string, depth: number): Promise<void> => {
      if (truncated || depth > bounds.maxDepth) return;

      let entries: Dirent[];
      try {
        entries = await fs.readdir(absDir, { withFileTypes: true });
      } catch {
        return; // unreadable dir — skip it, don't abort the whole search
      }

      for (const entry of entries) {
        if (capHit()) return;

        const name = entry.name;
        // Never follow symlinks: keeps the walk inside the jail and cycle-free.
        if (entry.isSymbolicLink()) continue;

        const isDir = entry.isDirectory();
        // Always skip heavy/noisy dirs and any dot-directory.
        if (isDir && (SEARCH_SKIP_DIRS.has(name) || name.startsWith('.'))) {
          continue;
        }

        scanned++;
        const abs = join(absDir, name);
        const type: 'file' | 'directory' = isDir ? 'directory' : 'file';

        const nameMatched = name.toLowerCase().includes(needle);
        let matched = nameMatched;
        let matches: SearchMatch[] | undefined;
        if (wantContent && entry.isFile() && may('read', abs)) {
          // Even a name match is scanned when line data was asked for: a hit
          // whose name matches but whose body also does should still show the
          // lines, or the panel would list it with nothing under it.
          const found = await this.contentLines(abs, needle, bounds);
          if (found === null) {
            // Unreadable / binary / oversize — no content answer either way.
          } else if (wantMatches) {
            if (found.length > 0) matches = found;
            matched = matched || found.length > 0;
          } else {
            matched = matched || found.length > 0;
          }
        }

        if (matched) {
          items.push({
            name,
            path: relative(rootDir, abs),
            type,
            ...(matches ? { matches } : {}),
          });
          if (capHit()) return;
        }

        if (isDir && may('list', abs)) {
          await walk(abs, depth + 1);
          if (truncated) return;
        }
      }
    };

    await walk(startDir, 0);
    return { items, truncated };
  }

  /**
   * Cheap text-content grep for the search walk, now reporting *which* lines
   * matched.
   *
   * Returns `null` when the file was not searchable at all — unreadable,
   * oversized, or binary (a NUL in the sniff window) — and an array otherwise,
   * empty when nothing matched. That three-way answer is why it is not a
   * boolean: "no match" and "never looked" are different facts, and the caller
   * used to conflate them.
   *
   * Line extraction is a scan over the buffer that was read anyway, capped at
   * `maxMatchesPerFile` lines each trimmed to `maxMatchChars`, so the cost of
   * the extra data is bounded by two constants rather than by file size. Reads
   * at most one file into the heap at a time. Never throws upward.
   */
  private async contentLines(
    abs: string,
    needle: string,
    bounds: {
      maxContentBytes: number;
      maxMatchesPerFile: number;
      maxMatchChars: number;
    },
  ): Promise<SearchMatch[] | null> {
    try {
      const stat = await fs.stat(abs);
      if (!stat.isFile() || stat.size > bounds.maxContentBytes) return null;
      const buf = await fs.readFile(abs);
      const sniff = Math.min(buf.length, 8192);
      for (let i = 0; i < sniff; i++) {
        if (buf[i] === 0) return null; // NUL ⇒ treat as binary, skip
      }
      const text = buf.toString('utf-8');
      // One cheap check before splitting: most files do not match at all, and
      // splitting a 256KB file into lines to learn that is pure waste.
      if (!text.toLowerCase().includes(needle)) return [];

      const out: SearchMatch[] = [];
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (out.length >= bounds.maxMatchesPerFile) break;
        const line = lines[i];
        if (!line.toLowerCase().includes(needle)) continue;
        const trimmed = line.trim();
        out.push({
          line: i + 1,
          text:
            trimmed.length > bounds.maxMatchChars
              ? trimmed.slice(0, bounds.maxMatchChars)
              : trimmed,
        });
      }
      return out;
    } catch {
      return null;
    }
  }

  async readFile(
    root: string,
    virtualPath: string,
    who: AppIdentity | null = null,
  ): Promise<{ path: string; content: string; version: string }> {
    const { abs } = await this.check(who, 'read', root, virtualPath);
    if (!(await this.exists(abs)))
      throw new NotFoundException('File not found');
    const stat = await fs.stat(abs);
    if (stat.isDirectory())
      throw new BadRequestException('Path is a directory');
    if (stat.size > MAX_TEXT_FILE_BYTES) {
      throw new PayloadTooLargeException(
        `File is too large to open as text (max ${MAX_TEXT_FILE_BYTES} bytes); download it instead`,
      );
    }
    const content = await fs.readFile(abs, 'utf-8');
    return { path: virtualPath, content, version: versionOf(stat) };
  }

  /**
   * Resolve a file inside the jail and return its absolute path + size,
   * validated (exists, not a directory). Used by the download route to build
   * Range responses without a second resolve/stat when it opens the stream.
   */
  async statFile(
    root: string,
    virtualPath: string,
    who: AppIdentity | null = null,
  ): Promise<{ abs: string; size: number; version: string }> {
    const { abs } = await this.check(who, 'read', root, virtualPath);
    if (!(await this.exists(abs)))
      throw new NotFoundException('File not found');
    const stat = await fs.stat(abs);
    if (stat.isDirectory())
      throw new BadRequestException('Path is a directory');
    return { abs, size: stat.size, version: versionOf(stat) };
  }

  async readFileStream(root: string, virtualPath: string): Promise<Readable> {
    const { abs } = await this.statFile(root, virtualPath);
    return createReadStream(abs);
  }

  /**
   * Open a byte range of an already-jailed absolute path (from `statFile`).
   * `start`/`end` are inclusive, as HTTP Range semantics require.
   */
  openRange(abs: string, start: number, end: number): Readable {
    return createReadStream(abs, { start, end });
  }

  /**
   * Open the whole of an already-jailed absolute path (from `statFile`), so the
   * download route need not re-resolve + re-stat a path it already validated.
   */
  openFile(abs: string): Readable {
    return createReadStream(abs);
  }

  async writeFile(
    root: string,
    virtualPath: string,
    content: string,
    expected?: string,
    who: AppIdentity | null = null,
  ): Promise<FileEntry> {
    const located = await this.resolveSafe(root, virtualPath);
    const { rootDir, abs } = located;
    const { record, exclusive } = await this.checkWrite(
      who,
      located,
      root,
      virtualPath,
    );
    await this.assertVersion(abs, expected);
    await withDiskSpaceCheck(() => fs.mkdir(dirname(abs), { recursive: true }));
    // Atomic like an upload: `fs.writeFile` onto `abs` truncated it
    // first, so a full disk mid-save left Notepad's file empty.
    await this.writeAtomically(
      abs,
      (staged) => fs.writeFile(staged, content, 'utf-8'),
      exclusive ? located : undefined,
    );
    record();
    return this.toEntry(rootDir, abs);
  }

  async createFile(
    root: string,
    virtualPath: string,
    content = '',
  ): Promise<FileEntry> {
    const { rootDir, abs } = await this.resolveSafe(root, virtualPath);
    if (await this.exists(abs)) throw new BadRequestException('Already exists');
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
    return this.toEntry(rootDir, abs);
  }

  /**
   * Move an already-on-disk upload (multer diskStorage temp file) into the
   * jail. Copying from the temp path avoids ever holding the whole upload in the
   * JS heap. The temp file is always removed, even if the destination path is
   * rejected by the jail.
   */
  async uploadFile(
    root: string,
    virtualPath: string,
    tmpPath: string,
    expected?: string,
    who: AppIdentity | null = null,
  ): Promise<FileEntry> {
    try {
      const located = await this.resolveSafe(root, virtualPath);
      const { rootDir, abs } = located;
      const { record, exclusive } = await this.checkWrite(
        who,
        located,
        root,
        virtualPath,
      );
      await this.assertVersion(abs, expected);
      await withDiskSpaceCheck(async () => {
        await fs.mkdir(dirname(abs), { recursive: true });
      });

      // The multer temp file is copied rather than renamed into place, because
      // it genuinely can be on another mount.
      await this.writeAtomically(
        abs,
        (staged) => fs.copyFile(tmpPath, staged),
        exclusive ? located : undefined,
      );
      record();
      return this.toEntry(rootDir, abs);
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  }

  /**
   * The save precondition. With no `expected` token this is
   * today's blind overwrite, so every existing caller is unchanged. With one,
   * the file must still be the version the editor read: a `git checkout` in
   * the Terminal or a second window that wrote it meanwhile answers 409 with
   * the current token (`null` when the file is gone), and nothing is written.
   */
  private async assertVersion(abs: string, expected?: string): Promise<void> {
    if (expected === undefined) return;
    const stat = await fs.stat(abs).catch(() => null);
    const current = stat ? versionOf(stat) : null;
    if (current === expected) return;
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: 'The file changed on disk since it was opened',
      current,
    });
  }

  /**
   * Write `abs` by staging beside it and renaming over it.
   *
   * Writing straight onto `abs` (`fs.writeFile`, `copyFile`) TRUNCATES it before
   * writing, so a failure part-way through — a full disk, an OOM kill, a
   * container restart — left the user's file truncated and the original bytes
   * gone. Both save paths come through here: `writeFile` (`PUT /files/content`:
   * Notepad, the file manager's text writes, the REST client's collections) and
   * `uploadFile` (Code Editor, Markdown Editor, Paint, images, and Office's
   * apps from the Marketplace).
   *
   * `rename` within the same directory is atomic on POSIX: either the new bytes
   * are fully in place or the old file is untouched. Staging in the
   * destination's own directory rather than the OS temp dir is what makes that
   * guarantee hold — a rename across filesystems is not atomic and would fall
   * back to a copy. The cost: a save needs write permission on the directory,
   * not just the file.
   *
   * `exclusive` (the located path it was checked as) places the staged file
   * only if nothing is at `abs` by then: see {@link placeNew}.
   */
  private async writeAtomically(
    abs: string,
    write: (stagedPath: string) => Promise<void>,
    exclusive?: Located,
  ): Promise<void> {
    const staged = join(
      dirname(abs),
      `.${basename(abs)}.imbatranim-${randomUUID()}.part`,
    );
    if (exclusive) {
      await this.placeNew(exclusive, (to) => write(to), staged);
      return;
    }
    try {
      await withDiskSpaceCheck(() => write(staged));
      // A rename carries the staged file's mode, not the destination's, so an
      // existing file's permissions would silently reset to the default. Copy
      // them across first; a failure here is not worth losing the save over.
      const previous = await fs.stat(abs).catch(() => null);
      if (previous) {
        await fs.chmod(staged, previous.mode).catch(() => undefined);
      }
      await withDiskSpaceCheck(() => fs.rename(staged, abs));
    } catch (err) {
      // Leave the original exactly as it was.
      await fs.rm(staged, { force: true });
      throw err;
    }
  }

  /**
   * Make a new file at `located` and never replace anything: what an app that
   * may only add files to a folder writes. The bytes are staged beside it
   * and placed with a hard link, which fails with EEXIST over anything there
   * (a dangling symlink included) where a rename would replace it; a file
   * system without hard links gets an exclusive copy instead. A taken name
   * answers 409.
   *
   * The folder it lands in must be a real folder, and still the one the
   * path was checked as once the file is in: a link swapped in for it
   * meanwhile is found, the new file taken back out, and the write refused.
   */
  private async placeNew(
    located: Located,
    write: (stagedPath: string) => Promise<void>,
    staged = join(
      dirname(located.abs),
      `.${basename(located.abs)}.imbatranim-${randomUUID()}.part`,
    ),
  ): Promise<void> {
    const { abs } = located;
    const parent = await fs.lstat(dirname(abs));
    if (!parent.isDirectory()) throw new BadRequestException('Not a folder');
    const where = await this.parentAsChecked(located);
    try {
      await withDiskSpaceCheck(() => write(staged));
      await withDiskSpaceCheck(() =>
        fs.link(staged, abs).catch((err: NodeJS.ErrnoException) => {
          if (!NO_HARD_LINKS.has(err.code ?? '')) throw err;
          return fs.copyFile(staged, abs, fsConstants.COPYFILE_EXCL);
        }),
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        const there = await fs.stat(abs).catch(() => null);
        throw nameTaken(there ? versionOf(there) : null);
      }
      throw err;
    } finally {
      await fs.rm(staged, { force: true });
    }
    if ((await fs.realpath(dirname(abs)).catch(() => null)) !== where) {
      await fs.rm(abs, { force: true });
      throw new BadRequestException('The folder changed while writing');
    }
  }

  /**
   * The real path of the folder `located` is in, refused unless it is the
   * folder the path was checked as (its key's parent).
   */
  private async parentAsChecked(located: Located): Promise<string> {
    const { rootDir, abs, key } = located;
    const real = await fs.realpath(dirname(abs));
    const realRoot = await fs.realpath(rootDir);
    if (join(rootDir, relative(realRoot, real)) !== dirname(key)) {
      throw new BadRequestException('The folder changed while writing');
    }
    return real;
  }

  async createDirectory(
    root: string,
    virtualPath: string,
    who: AppIdentity | null = null,
  ): Promise<FileEntry> {
    const { rootDir, abs, key } = await this.resolveSafe(root, virtualPath);
    const folders = await this.missingFolders(abs);
    const keyOf = (p: string) => join(key, relative(abs, p));
    // Each folder made is checked, the outermost first, whose parent is
    // there. Once an app makes one in its own folders, those inside it are
    // its own too.
    const accesses: Access[] = [];
    for (const folder of folders) {
      accesses.push(
        accesses[0] === 'mode'
          ? 'mode'
          : this.assertCan(who, 'create', keyOf(folder), root, virtualPath),
      );
      // Given `assets/` to add files to, an app may make the folder itself,
      // never one inside it.
      if (this.addOnly(who, keyOf(folder)) === 'file') {
        throw addOnlyRefusal(who!, { root, path: virtualPath });
      }
    }
    if (folders.length === 0) {
      this.assertCan(who, 'create', key, root, virtualPath);
      throw new BadRequestException('Already exists');
    }
    await withDiskSpaceCheck(() => fs.mkdir(abs, { recursive: true }));
    folders.forEach((folder, i) =>
      this.recordMade(who, accesses[i], keyOf(folder), 'directory'),
    );
    return this.toEntry(rootDir, abs);
  }

  async move(
    root: string,
    from: string,
    to: string,
    who: AppIdentity | null = null,
  ): Promise<FileEntry> {
    const {
      rootDir,
      abs: absFrom,
      key: keyFrom,
    } = await this.check(who, 'delete', root, from, { follow: false });
    const { abs: absTo, key: keyTo } = await this.check(
      who,
      'create',
      root,
      to,
    );
    // A move carries what it is, its owner included, so nothing moves into
    // a folder an app may only add new files to: the app would own it.
    if (this.addOnly(who, keyTo) !== null) {
      throw addOnlyRefusal(who!, { root, path: to });
    }
    if (!(await this.exists(absFrom)))
      throw new NotFoundException('Source not found');
    // Moving a directory into itself (a → a/b) is a raw EINVAL 500; reject it.
    if (absTo === absFrom || absTo.startsWith(absFrom + sep)) {
      throw new BadRequestException('Cannot move a folder into itself');
    }
    if (await this.exists(absTo))
      throw new BadRequestException('Destination already exists');
    await withDiskSpaceCheck(async () => {
      await fs.mkdir(dirname(absTo), { recursive: true });
      await fs.rename(absFrom, absTo);
    });
    // What it is goes with it: an app's folder renamed stays the app's.
    this.access?.moved(keyFrom, keyTo);
    return this.toEntry(rootDir, absTo);
  }

  async copy(
    root: string,
    from: string,
    to: string,
    who: AppIdentity | null = null,
  ): Promise<FileEntry> {
    const located = await this.resolveSafe(root, from);
    const { rootDir, abs: absFrom, key: keyFrom } = located;
    const target = await this.resolveSafe(root, to);
    const { abs: absTo, key: keyTo } = target;
    const source = await fs.stat(absFrom).catch(() => null);
    // A folder is copied whole, so it needs listing; a file, reading.
    this.assertCan(
      who,
      source?.isDirectory() ? 'list' : 'read',
      keyFrom,
      root,
      from,
    );
    const access = this.assertCan(who, 'create', keyTo, root, to);
    // Into a folder an app may only add files to: one file, directly in it,
    // placed without replacing anything.
    const adds = this.addOnly(who, keyTo);
    if (
      adds === 'folder' ||
      (adds === 'file' &&
        (source?.isDirectory() ||
          (await this.missingFolders(dirname(absTo))).length > 1))
    ) {
      throw addOnlyRefusal(who!, { root, path: to });
    }
    if (!(await this.exists(absFrom)))
      throw new NotFoundException('Source not found');
    // Copying a directory into itself (a → a/b) recurses / EINVALs into a 500.
    if (absTo === absFrom || absTo.startsWith(absFrom + sep)) {
      throw new BadRequestException('Cannot copy a folder into itself');
    }
    if (await this.exists(absTo))
      throw new BadRequestException('Destination already exists');
    // Wrap the writes in withDiskSpaceCheck so a full volume surfaces as a
    // clear 503 rather than a generic 500 — same as writeFile/uploadFile.
    const stat = await fs.stat(absFrom);
    await withDiskSpaceCheck(async () => {
      await fs.mkdir(dirname(absTo), { recursive: true });
      if (stat.isDirectory()) {
        await fs.cp(absFrom, absTo, { recursive: true });
      } else if (adds === 'file') {
        await this.placeNew(target, (staged) => fs.copyFile(absFrom, staged));
      } else {
        // Never over a file that appeared since the check above.
        await fs
          .copyFile(absFrom, absTo, fsConstants.COPYFILE_EXCL)
          .catch((err: NodeJS.ErrnoException) => {
            if (err.code === 'EEXIST') {
              throw new BadRequestException('Destination already exists');
            }
            throw err;
          });
      }
    });
    this.recordMade(
      who,
      access,
      keyTo,
      stat.isDirectory() ? 'directory' : 'file',
    );
    // A folder an app copies inside its own folders is its own all the way
    // down, or it couldn't read what it just made.
    if (access === 'mode' && stat.isDirectory()) {
      const inside = await fs.readdir(absTo, {
        recursive: true,
        withFileTypes: true,
      });
      // Outermost first, so each folder's record is there for what is in it.
      const depth = (d: Dirent) => join(d.parentPath, d.name).split(sep).length;
      inside.sort((a, b) => depth(a) - depth(b));
      for (const inner of inside) {
        const at = join(inner.parentPath, inner.name);
        this.recordMade(
          who,
          access,
          join(keyTo, relative(absTo, at)),
          inner.isDirectory() ? 'directory' : 'file',
        );
      }
    }
    return this.toEntry(rootDir, absTo);
  }

  async delete(
    root: string,
    virtualPath: string,
    who: AppIdentity | null = null,
  ): Promise<void> {
    // No-follow resolve + lstat: a broken symlink (its target ENOENTs) or one
    // pointing out of the jail must still be removable — we operate on the link
    // itself, never its target.
    const { abs, key } = await this.check(who, 'delete', root, virtualPath, {
      follow: false,
    });
    let stat: Stats;
    try {
      stat = await fs.lstat(abs);
    } catch {
      throw new NotFoundException('Not found');
    }
    if (stat.isSymbolicLink()) {
      await fs.unlink(abs); // remove the link, never chase its target
    } else if (stat.isDirectory()) {
      await fs.rm(abs, { recursive: true });
    } else {
      await fs.unlink(abs);
    }
    this.forget(key);
  }

  /**
   * One entry, as a listing has it: a file the caller may read, or a folder
   * it may list. Lets an app given one file learn its size without listing
   * the folder it is in.
   */
  async stat(
    root: string,
    virtualPath: string,
    who: AppIdentity | null = null,
  ): Promise<FileEntry> {
    const { rootDir, abs, key } = await this.resolveSafe(root, virtualPath);
    if (this.can(who, 'read', key) === null) {
      this.assertCan(who, 'list', key, root, virtualPath);
    }
    if (!(await this.exists(abs))) throw new NotFoundException('Not found');
    return this.toEntry(rootDir, abs);
  }

  /**
   * Recursive size of a directory, bounded exactly like {@link search}.
   *
   * Computed in Node rather than by shelling out to `du`: the same lesson the
   * `ps` fix taught — the shipped image is busybox, and depending on whichever
   * userland happens to be present is how a feature ends up silently dead in
   * production.
   *
   * The caps mean a query pointed at a huge tree returns an honest floor with
   * `truncated: true` rather than hanging. Symlinks are never followed, so the
   * walk cannot leave the jail or loop.
   */
  async dirSize(
    root: string,
    virtualPath = '',
    who: AppIdentity | null = null,
  ): Promise<DirSize> {
    const { abs } = await this.check(who, 'list', root, virtualPath);
    const bounds = this.searchBounds();
    const deadline = Date.now() + bounds.budgetMs;

    let bytes = 0;
    let files = 0;
    let directories = 0;
    let entries = 0;
    let truncated = false;

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (truncated) return;
      if (depth > bounds.maxDepth) {
        truncated = true;
        return;
      }
      let dirents: Dirent[];
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // unreadable subtree — skip it rather than fail the whole query
      }
      for (const d of dirents) {
        if (++entries > bounds.maxEntries || Date.now() > deadline) {
          truncated = true;
          return;
        }
        if (d.isSymbolicLink()) continue; // never follow — jail + loop safety
        const full = join(dir, d.name);
        if (d.isDirectory()) {
          directories++;
          await walk(full, depth + 1);
          if (truncated) return;
        } else if (d.isFile()) {
          try {
            bytes += (await fs.lstat(full)).size;
            files++;
          } catch {
            /* vanished mid-walk */
          }
        }
      }
    };

    const st = await fs.lstat(abs).catch(() => null);
    if (!st) throw new NotFoundException('Not found');
    if (!st.isDirectory()) {
      return { bytes: st.size, files: 1, directories: 0, truncated: false };
    }
    await walk(abs, 0);
    return { bytes, files, directories, truncated };
  }
}
