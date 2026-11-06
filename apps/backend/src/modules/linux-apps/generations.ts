import { promises as fs } from 'fs';
import { basename, dirname, join, resolve } from 'path';

/**
 * A Nix profile's generations, read from its links: `profile` points at
 * `profile-3-link`, which points into the store, and every older
 * `profile-<n>-link` beside it is a generation Nix can roll back to.
 * `$NIX_STATE_HOME/profile` adds one more link in front.
 */

export interface Generations {
  /** The folder holding the links. */
  dir: string;
  /** The links' common name: `profile`, `imbatranim-xwayland`. */
  name: string;
  current: number;
}

const LINK = /^(.+)-(\d+)-link$/;

/** The profile's current generation, or null when it has none. */
export async function currentGeneration(
  profile: string,
): Promise<Generations | null> {
  let path = profile;
  for (let hops = 0; hops < 4; hops++) {
    const target = await fs.readlink(path).catch(() => null);
    if (target === null) return null;
    const next = resolve(dirname(path), target);
    const m = LINK.exec(basename(next));
    if (m) return { dir: dirname(next), name: m[1], current: Number(m[2]) };
    path = next;
  }
  return null;
}

export function generationLink(
  g: Pick<Generations, 'dir' | 'name'>,
  n: number,
): string {
  return join(g.dir, `${g.name}-${n}-link`);
}

/** Whether generation `n` is still on disk (a garbage collection with -d deletes it). */
export async function hasGeneration(
  profile: string,
  n: number,
): Promise<boolean> {
  const g = await currentGeneration(profile);
  if (!g) return false;
  return fs
    .lstat(generationLink(g, n))
    .then(() => true)
    .catch(() => false);
}

/**
 * Delete every generation but `keep`, the way `nix profile wipe-history`
 * does (it unlinks them), so a garbage collection can take what only they
 * held. The current generation is never deleted.
 */
export async function deleteGenerationsExcept(
  profile: string,
  keep: readonly number[],
): Promise<number[]> {
  const g = await currentGeneration(profile);
  if (!g) return [];
  const deleted: number[] = [];
  for (const f of await fs.readdir(g.dir)) {
    const m = LINK.exec(f);
    if (!m || m[1] !== g.name) continue;
    const n = Number(m[2]);
    if (n === g.current || keep.includes(n)) continue;
    await fs.rm(join(g.dir, f), { force: true });
    deleted.push(n);
  }
  return deleted.sort((a, b) => a - b);
}
