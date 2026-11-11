import { readFileSync } from "fs";
import { join, posix } from "path";
import { z } from "zod";

import { isInnerPath, VERIFIED_FILE } from "./catalog";
import { parseSourceUrl } from "./source-url";

/**
 * The verified apps from a URL: `marketplace/verified.json`, a copy of
 * imbatranim-apps' `verified.json` at the commit it records. The sync script
 * (`npm run verified:sync`) writes it; the image carries it, so reading it
 * needs no network, and an OS release pins it like the catalog's descriptors.
 *
 * An app is verified at one commit: its entry names the repository, the app's
 * folder in it and that commit. A verified app installs from its URL with no
 * warning; any other commit of it, or any app not listed, needs the owner's
 * trust first.
 */

const COMMIT = /^[0-9a-f]{40}$/;

const entrySchema = z.strictObject({
  repo: z.string().min(1).max(500),
  subdir: z.string().min(1).max(500).refine(isInnerPath, "must be a folder inside the repository").optional(),
  commit: z.string().regex(COMMIT, "must be a full 40-character commit id"),
  note: z.string().max(300).default(""),
});

const fileSchema = z.strictObject({
  /** The repository the list was copied from, by name. */
  from: z.literal("imbatranim-apps"),
  /** Its commit the copy was taken at: the pin. */
  commit: z.string().regex(COMMIT, "must be a full 40-character commit id"),
  apps: z.array(entrySchema).max(1000),
});

export interface VerifiedApp {
  /** As `parseSourceUrl` normalizes it, so it compares with an app's source. */
  repo: string;
  /** Normalized, null for the repository's top. */
  subdir: string | null;
  commit: string;
  note: string;
}

export interface VerifiedList {
  /** imbatranim-apps' commit the copy records; null when there is no good copy. */
  commit: string | null;
  apps: VerifiedApp[];
  /** Why the file was not read. Nothing is verified then. */
  problem: string | null;
}

function normalSubdir(subdir: string | null | undefined): string | null {
  if (!subdir) return null;
  const p = posix.normalize(subdir).replace(/\/+$/, "");
  return p === "." || p === "" ? null : p;
}

/**
 * Read the verified list from the catalog directory. A missing file is an
 * empty list. A broken one verifies nothing and says why: an entry that can't
 * be read must not quietly drop the warning for anything.
 */
export function loadVerified(dir: string, options: { allowLocalRepos: boolean }): VerifiedList {
  const none = (problem: string | null): VerifiedList => ({
    commit: null,
    apps: [],
    problem,
  });
  let text: string;
  try {
    text = readFileSync(join(dir, VERIFIED_FILE), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return none(null);
    return none(`could not be read: ${(err as Error).message}`);
  }
  return parseVerified(text, options);
}

/** {@link loadVerified}'s reading of the file's text. */
export function parseVerified(text: string, options: { allowLocalRepos: boolean }): VerifiedList {
  const none = (problem: string): VerifiedList => ({
    commit: null,
    apps: [],
    problem,
  });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return none(`not JSON: ${(err as Error).message}`);
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return none(`${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  const apps: VerifiedApp[] = [];
  const seen = new Set<string>();
  for (const [i, entry] of parsed.data.apps.entries()) {
    let repo: string;
    try {
      const url = parseSourceUrl(entry.repo, options);
      if (url.refPath.length > 0) throw new Error("names a branch");
      repo = url.repo;
    } catch {
      return none(`apps.${i}.repo: must be a repository's address, like https://github.com/<owner>/<repo>`);
    }
    const subdir = normalSubdir(entry.subdir);
    const key = `${repo}#${subdir ?? ""}`;
    if (seen.has(key)) {
      return none(`apps.${i}: ${entry.repo} is listed twice`);
    }
    seen.add(key);
    apps.push({ repo, subdir, commit: entry.commit, note: entry.note });
  }
  return { commit: parsed.data.commit, apps, problem: null };
}

/** The verified entry for an app's repository and folder, whatever its commit. */
export function verifiedEntry(list: VerifiedList, repo: string, subdir: string | null): VerifiedApp | null {
  const folder = normalSubdir(subdir);
  return list.apps.find((a) => a.repo === repo && a.subdir === folder) ?? null;
}

/** True when the list verifies this app at exactly this commit. */
export function isVerified(
  list: VerifiedList,
  source: { repo: string; subdir: string | null; commit: string },
): boolean {
  return verifiedEntry(list, source.repo, source.subdir)?.commit === source.commit;
}
