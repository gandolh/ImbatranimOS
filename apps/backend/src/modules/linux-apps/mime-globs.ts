import { promises as fs } from "fs";
import { join } from "path";

/**
 * From a MIME type to the file names that carry it, read from the
 * shared-mime-info database the Linux apps' own desktops use. The database
 * lives in the Nix profile the apps are installed into: `share/mime/globs2`
 * (`weight:type:glob[:flags]`), or the older `share/mime/globs`
 * (`type:glob`). A profile without one (LibreOffice's install doesn't bring
 * it) falls back to the image's own copy, from Alpine's shared-mime-info.
 * Spec: https://specifications.freedesktop.org/shared-mime-info-spec/latest/
 */

/**
 * What a glob claims, in the shape the desktop's file associations use: a
 * lowercase extension (`*.ODT` claims `odt`), or a whole lowercase name
 * (`Makefile`). Null for a glob that is neither: a pattern with other
 * wildcards, a case-sensitive one, or a double extension (`*.tar.gz`), which
 * a name's last extension can't match.
 */
export function claimOfGlob(glob: string, caseSensitive = false): string | null {
  if (caseSensitive) return null;
  const g = glob.toLowerCase();
  const ext = /^\*\.([a-z0-9_+-]+)$/.exec(g);
  if (ext) return ext[1];
  if (/^[a-z0-9_+-][a-z0-9_.+-]*$/.test(g)) return g;
  return null;
}

/** A MIME type's claims, by type. */
export type MimeGlobs = Map<string, string[]>;

/** Parse a `globs2` or `globs` file. Comment lines and malformed ones are skipped. */
export function parseGlobs(text: string): MimeGlobs {
  const out: MimeGlobs = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const parts = line.split(":");
    // globs2 has a numeric weight first; globs does not.
    const [type, glob, flags] =
      parts.length >= 3 && /^\d+$/.test(parts[0]) ? [parts[1], parts[2], parts[3] ?? ""] : [parts[0], parts[1], ""];
    if (!type || !glob) continue;
    const claim = claimOfGlob(glob, flags.split(",").includes("cs"));
    if (!claim) continue;
    const claims = out.get(type.toLowerCase()) ?? [];
    if (!claims.includes(claim)) claims.push(claim);
    out.set(type.toLowerCase(), claims);
  }
  return out;
}

/** The claims of every one of `mimeTypes` that the database knows, without repeats. */
export function claimsOf(globs: MimeGlobs, mimeTypes: readonly string[]): string[] {
  const out = new Set<string>();
  for (const t of mimeTypes) for (const c of globs.get(t) ?? []) out.add(c);
  return [...out];
}

/** The image's own database (Alpine's shared-mime-info). */
export const IMAGE_MIME_DIR = "/usr/share/mime";

/**
 * The profile's database, or the image's, or null with the reason: the Linux apps that
 * claim types are offered in Open with only when it can be read.
 */
export async function loadGlobs(
  profile: string,
  fallbackDir: string = IMAGE_MIME_DIR,
): Promise<{ globs: MimeGlobs } | { missing: string }> {
  const dirs = [join(profile, "share", "mime"), fallbackDir];
  for (const dir of dirs) {
    for (const name of ["globs2", "globs"]) {
      const text = await fs.readFile(join(dir, name), "utf8").catch(() => null);
      if (text !== null) return { globs: parseGlobs(text) };
    }
  }
  return { missing: `no globs2 in ${dirs.join(" or ")}` };
}
