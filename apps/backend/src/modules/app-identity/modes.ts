import { SYSTEM_GROUP, type AppIdentity } from "./app-identity.types";

/**
 * Unix modes for the apps' data area, checked by the OS rather than Linux.
 *
 * The rules are Unix's, kept small: one class of bits applies to a caller
 * (owner if it owns the entry, else group if it is in the entry's group,
 * else others), every folder on the way needs execute to be passed through,
 * a folder's setgid bit hands its group (and, to a subfolder, the bit) to
 * what is made in it, and in a sticky folder only an entry's owner (or the
 * folder's) may delete it. The user (a call with no app identity) passes
 * every check, as the owner of the home folder.
 */

export const S_ISUID = 0o4000;
export const S_ISGID = 0o2000;
export const S_ISVTX = 0o1000;
/** Everything `mode` may hold. */
export const MODE_MASK = 0o7777;

export const R = 4;
export const W = 2;
export const X = 1;

export type EntryKind = "file" | "directory";

/** A path's owner, group and mode. `owner` null is the user. */
export interface ModeEntry {
  readonly owner: string | null;
  readonly group: string;
  readonly mode: number;
}

/**
 * A folder with no row: the user's, `rwx--x--x` in group `system`. Every
 * app, built-in or installed, can pass through the user's folders to its own
 * but can't list them: what it sees of the user's files is what it was given
 * (a file opened with it, one picked in the OS's dialog, an opened file's
 * folder for an app that declares it reads one), plus its own folders.
 * Settings, Files and the Terminal act as the user and aren't checked.
 */
export const IMPLIED_DIRECTORY: ModeEntry = Object.freeze({
  owner: null,
  group: SYSTEM_GROUP,
  mode: 0o711,
});

/** A file with no row: the user's, `rw-------` in group `system`. */
export const IMPLIED_FILE: ModeEntry = Object.freeze({
  owner: null,
  group: SYSTEM_GROUP,
  mode: 0o600,
});

/** An app's new file, as under umask 077: `rw-------`. */
export const PRIVATE_FILE_MODE = 0o600;
/** An app's new folder, as under umask 077: `rwx------`. */
export const PRIVATE_DIRECTORY_MODE = 0o700;
/** What the user makes in a setgid folder, shared with its group: `rw-rw----`. */
export const SHARED_FILE_MODE = 0o660;
/** A folder the user makes in a setgid folder: `rwxrwx---`, plus the bit. */
export const SHARED_DIRECTORY_MODE = 0o770;

export function impliedEntry(kind: EntryKind): ModeEntry {
  return kind === "directory" ? IMPLIED_DIRECTORY : IMPLIED_FILE;
}

/** The three bits (`rwx`, 0 to 7) that apply to an app on an entry. */
export function classBits(identity: AppIdentity, entry: ModeEntry): number {
  if (entry.owner === identity.appId) return (entry.mode >> 6) & 7;
  if (identity.groups.includes(entry.group)) return (entry.mode >> 3) & 7;
  return entry.mode & 7;
}

/** True when the caller holds every bit of `want` (R, W, X or a sum) on `entry`. */
export function permits(identity: AppIdentity | null, entry: ModeEntry, want: number): boolean {
  if (identity === null) return true;
  return (classBits(identity, entry) & want) === want;
}

/**
 * Who owns something new in `parent`, and with what mode.
 *
 * The owner is the app making it, or the user. The group is the parent's
 * when the parent is setgid (and a new folder keeps the bit, so the suite's
 * group carries down), else the app's own private group. `mode` is the
 * permission bits asked for, the private default when absent: setgid decides
 * only the group, so a suite that wants its shared folder's files readable by
 * the suite asks for `0o660` itself. The user making something in a setgid
 * folder shares it with the folder's group (`rw-rw----`, `rwxrws---`), as a
 * shared folder's umask would.
 *
 * Null when the user makes something outside a setgid folder: no row is
 * needed, the implied entry already says it is the user's.
 */
export function newEntry(
  identity: AppIdentity | null,
  parent: ModeEntry,
  kind: EntryKind,
  mode?: number,
): ModeEntry | null {
  const inherits = (parent.mode & S_ISGID) !== 0;
  if (identity === null && !inherits) return null;
  const shared = kind === "directory" ? SHARED_DIRECTORY_MODE : SHARED_FILE_MODE;
  const own = kind === "directory" ? PRIVATE_DIRECTORY_MODE : PRIVATE_FILE_MODE;
  const base = mode ?? (identity === null ? shared : own);
  assertMode(base);
  const setgid = inherits && kind === "directory" ? S_ISGID : 0;
  return {
    owner: identity?.appId ?? null,
    group: inherits ? parent.group : (identity?.appId ?? SYSTEM_GROUP),
    mode: base | setgid,
  };
}

export function assertMode(mode: number): void {
  if (!Number.isInteger(mode) || mode < 0 || mode > MODE_MASK) {
    throw new RangeError(`A mode is an integer from 0 to 0o7777, not ${mode}`);
  }
}

/** `ls -l`'s nine permission letters, with s/S and t/T for setuid, setgid and sticky. */
export function formatMode(mode: number): string {
  assertMode(mode);
  const triplet = (bits: number, special: boolean, letter: "s" | "t") =>
    (bits & R ? "r" : "-") +
    (bits & W ? "w" : "-") +
    (special ? (bits & X ? letter : letter.toUpperCase()) : bits & X ? "x" : "-");
  return (
    triplet((mode >> 6) & 7, (mode & S_ISUID) !== 0, "s") +
    triplet((mode >> 3) & 7, (mode & S_ISGID) !== 0, "s") +
    triplet(mode & 7, (mode & S_ISVTX) !== 0, "t")
  );
}

/** The inverse of {@link formatMode}: `rwxrws---` → `0o2770`. */
export function parseMode(text: string): number {
  if (!/^([r-][w-][xsS-])([r-][w-][xsS-])([r-][w-][xtT-])$/.test(text)) {
    throw new RangeError(`Not a mode: ${text}`);
  }
  let mode = 0;
  const specials = [S_ISUID, S_ISGID, S_ISVTX];
  for (let i = 0; i < 3; i++) {
    const [r, w, x] = text.slice(i * 3, i * 3 + 3);
    let bits = 0;
    if (r === "r") bits |= R;
    if (w === "w") bits |= W;
    if (x === "x" || x === "s" || x === "t") bits |= X;
    if (x === "s" || x === "S" || x === "t" || x === "T") mode |= specials[i];
    mode |= bits << ((2 - i) * 3);
  }
  return mode;
}
