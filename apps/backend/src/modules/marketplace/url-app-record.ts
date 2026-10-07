import { isAbsolute, join, posix, relative } from 'path';
import { z } from 'zod';

import { appManifestSchema, type AppManifest } from './app-manifest';
import { isInnerPath } from './catalog';
import type { InstalledRow } from './marketplace.service';
import { deriveAppId, type AppSource } from './source-url';

/**
 * Reading back the database row of an app installed from a URL (brief 158).
 *
 * The row holds the app's manifest and source as JSON, and the paths its
 * files are served from. Everything in it was checked at install, but a row
 * is read on every listing, token and file, and a row that no longer holds
 * what install wrote (a hand edit, a bad restore, a bug) must not break the
 * whole listing nor point the sandbox's file routes anywhere else. So it is
 * checked again, by the install's rules, every time it is read; a row that
 * fails is listed as a problem, to be uninstalled, and serves nothing.
 */

/** A build's id: the commit's first 12 hex, a dash, 8 random hex (see `check` and `build`). */
export const BUILD_ID = /^[0-9a-f]{12}-[0-9a-f]{8}$/;
const URL_APP_ID = /^x-[0-9a-f]{12}$/;
const COMMIT = /^[0-9a-f]{40}$/;

/** A subdirectory from a URL: the catalog's rule for a path inside the clone, at a URL's length. */
const subdirSchema = z
  .string()
  .min(1)
  .max(2000)
  .refine(isInnerPath)
  .refine((p) => !p.split('/').some((s) => s === '' || s === '.'));

const sourceSchema = z
  .object({
    url: z.string().min(1),
    repo: z.string().min(1),
    ref: z.string().min(1).nullable(),
    commit: z.string().regex(COMMIT),
    subdir: subdirSchema.nullable(),
  })
  .strict();

export type UrlAppRecord =
  | { ok: true; manifest: AppManifest; source: AppSource }
  | {
      ok: false;
      /** Which part of the row is wrong, in a word or two, for the listing's problem. */
      damaged: string;
    };

/** The `root` install stores for a subdirectory: normalized, '' for the top. */
function storedRoot(subdir: string | null): string {
  if (!subdir) return '';
  const root = posix.normalize(subdir);
  return root === '.' ? '' : root;
}

function json(text: unknown): unknown {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The manifest and source of a URL app's row, or which part of it is damaged.
 * By install's rules: the manifest passes the manifest's schema; the source
 * has its shape, and the row's id is the one it derives; `ref` is its commit;
 * the build id has its pattern and its commit's prefix; `entry` passes the
 * manifest's entry rule and is the manifest's, normalized; `root` is the
 * source's subdirectory as install stores it, and the build's directory
 * `apps/<id>@<build_id>`, and `root` within it, sit where they should under
 * `appsDir`.
 */
export function readUrlAppRow(
  row: InstalledRow,
  appsDir: string,
): UrlAppRecord {
  const damaged = (what: string): UrlAppRecord => ({
    ok: false,
    damaged: what,
  });
  if (row.runtime !== 'sandboxed' || !URL_APP_ID.test(String(row.id))) {
    return damaged('id');
  }
  const manifest = appManifestSchema.safeParse(json(row.manifest));
  if (!manifest.success) return damaged('manifest');
  const source = sourceSchema.safeParse(json(row.source));
  if (
    !source.success ||
    deriveAppId(source.data.repo, source.data.subdir) !== row.id
  ) {
    return damaged('source');
  }
  if (row.ref !== source.data.commit) return damaged('commit');
  if (
    typeof row.build_id !== 'string' ||
    !BUILD_ID.test(row.build_id) ||
    !row.build_id.startsWith(source.data.commit.slice(0, 12))
  ) {
    return damaged('build id');
  }
  if (
    typeof row.entry !== 'string' ||
    !appManifestSchema.shape.entry.safeParse(row.entry).success ||
    row.entry !== posix.normalize(manifest.data.entry)
  ) {
    return damaged('entry');
  }
  if (row.root !== storedRoot(source.data.subdir)) return damaged('folder');
  // Implied by the checks above, and checked anyway: these are the paths the
  // sandbox serves from.
  const name = `${row.id}@${row.build_id}`;
  const buildDir = join(appsDir, name);
  const inBuild = relative(buildDir, join(buildDir, row.root));
  if (
    relative(appsDir, buildDir) !== name ||
    inBuild.startsWith('..') ||
    isAbsolute(inBuild)
  ) {
    return damaged('folder');
  }
  return { ok: true, manifest: manifest.data, source: source.data };
}
