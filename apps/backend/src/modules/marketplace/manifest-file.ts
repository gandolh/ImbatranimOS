import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { isAbsolute, join, relative } from 'path';

/** An app from a URL's manifest, at the top of its folder in the repository. */
export const MANIFEST_FILE = 'imbatranim.json';

/** Bigger than any honest manifest: read no further than this. */
export const MAX_MANIFEST_BYTES = 64 * 1024;

/**
 * The JSON of `imbatranim.json` at the top of an app's folder in a clone: a
 * real, small file inside the folder (a symlink out of it is refused). 400
 * when it is missing or not JSON; `where` names the folder for the owner.
 */
export async function readManifestJson(
  root: string,
  where: string,
): Promise<unknown> {
  let text: string;
  try {
    const realRoot = await fs.realpath(root);
    const real = await fs.realpath(join(root, MANIFEST_FILE));
    const rel = relative(realRoot, real);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('outside');
    }
    const stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) {
      throw new Error('not a small file');
    }
    text = await fs.readFile(real, 'utf8');
  } catch {
    throw new BadRequestException(
      `There is no ${MANIFEST_FILE} in ${where}. An app installed from a URL needs one at the top of its folder.`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new BadRequestException(
      `${MANIFEST_FILE} is not JSON: ${(err as Error).message}`,
    );
  }
}

/** The manifest's version, or null when it names none. */
export function manifestVersion(raw: unknown): unknown {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>).schemaVersion
    : null;
}
