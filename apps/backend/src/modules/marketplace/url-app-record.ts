import { posix } from "path";
import { z } from "zod";

import { isInnerPath, type Descriptor } from "./catalog";
import type { InstalledRow } from "./marketplace.service";
import { parseNativeManifest } from "./native-manifest";
import { deriveAppId, type AppSource } from "./source-url";

/**
 * Reading back the database row of an app installed from a URL.
 *
 * The row holds the app's manifest and source as JSON, and the paths its
 * files are served from. Everything in it was checked at install, but a row
 * is read on every listing, file and lease, and a row that no longer holds
 * what install wrote (a hand edit, a bad restore, a bug) must not break the
 * whole listing nor point the file routes anywhere else. So it is checked
 * again, by the install's rules, every time it is read; a row that fails is
 * listed as a problem, to be uninstalled, and serves nothing.
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
  .refine((p) => !p.split("/").some((s) => s === "" || s === "."));

const sourceSchema = z
  .object({
    url: z.string().min(1),
    repo: z.string().min(1),
    ref: z.string().min(1).nullable(),
    commit: z.string().regex(COMMIT),
    subdir: subdirSchema.nullable(),
  })
  .strict();

/**
 * How an app from a URL that runs natively came to be trusted at its commit:
 * the OS's verified list vouched for it, or the owner said so. `at` is when.
 */
export interface UrlTrust {
  by: "verified" | "owner";
  at: number;
}

const trustSchema = z.strictObject({
  by: z.enum(["verified", "owner"]),
  at: z.number().int().nonnegative(),
});

/** A native URL app's stored source: the {@link AppSource} and its trust record. */
const nativeSourceSchema = sourceSchema.extend({ trust: trustSchema }).strict();

/** The `root` install stores for a subdirectory: normalized, '' for the top. */
function storedRoot(subdir: string | null): string {
  if (!subdir) return "";
  const root = posix.normalize(subdir);
  return root === "." ? "" : root;
}

function json(text: unknown): unknown {
  if (typeof text !== "string") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * A leftover prebuilt (version 1) app from a URL, as far as its row still
 * reads: the name its manifest gave, or its id, and its source when that
 * still has its shape and derives the row's id. Only for the listing, which
 * names it so the owner can uninstall it; nothing of it runs or is served.
 */
export function retiredUrlApp(row: InstalledRow): {
  name: string;
  source: AppSource | null;
} {
  const manifest = json(row.manifest);
  const named = manifest && typeof manifest === "object" ? (manifest as Record<string, unknown>).name : undefined;
  const name = typeof named === "string" && named.trim() !== "" ? named.trim().slice(0, 60) : String(row.id);
  const source = sourceSchema.safeParse(json(row.source));
  return {
    name,
    source: source.success && deriveAppId(source.data.repo, source.data.subdir) === row.id ? source.data : null,
  };
}

export type NativeUrlRecord =
  | {
      ok: true;
      descriptor: Descriptor;
      source: AppSource;
      trust: UrlTrust;
      /** The `imbatranim.json` the row was built from, as read. */
      manifest: unknown;
    }
  | { ok: false; damaged: string };

/**
 * The descriptor, source and trust record of a URL app that runs natively,
 * or which part of its row is damaged, by install's rules: the source has its shape and derives the row's id, `ref`
 * is its commit, the build id has that commit's prefix, `root` is the
 * source's folder, and the stored manifest still reads as a descriptor. What
 * the build recorded (`entry`, `entries`) is `recordedBuild`'s to read.
 */
export function readNativeUrlRow(row: InstalledRow, options: { allowLocalRepos: boolean }): NativeUrlRecord {
  const damaged = (what: string): NativeUrlRecord => ({
    ok: false,
    damaged: what,
  });
  if (row.runtime !== "native" || !URL_APP_ID.test(String(row.id))) {
    return damaged("id");
  }
  const stored = nativeSourceSchema.safeParse(json(row.source));
  if (!stored.success || deriveAppId(stored.data.repo, stored.data.subdir) !== row.id) {
    return damaged("source");
  }
  const { trust, ...source } = stored.data;
  if (row.ref !== source.commit) return damaged("commit");
  if (
    typeof row.build_id !== "string" ||
    !BUILD_ID.test(row.build_id) ||
    !row.build_id.startsWith(source.commit.slice(0, 12))
  ) {
    return damaged("build id");
  }
  if (row.root !== storedRoot(source.subdir)) return damaged("folder");
  const manifest = json(row.manifest);
  const parsed = parseNativeManifest(manifest, source, options);
  if (!parsed.ok || parsed.descriptor.id !== row.id) {
    return damaged("manifest");
  }
  return { ok: true, descriptor: parsed.descriptor, source, trust, manifest };
}
