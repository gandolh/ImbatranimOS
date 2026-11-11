import { createWriteStream, promises as fs } from "fs";
import https from "https";
import { join } from "path";
import { pipeline } from "stream/promises";
import { isCommit, parseSnapshot, type Pin } from "./pins";

/**
 * Asking NixOS's channels what the newest snapshot of a release is, and
 * fetching that snapshot's package list. Only the Updates page's Check and
 * Update buttons get here; boot never does.
 */

export type Fetch = typeof fetch;

export const CHANNELS = "https://channels.nixos.org";
const RELEASES = /^https:\/\/releases\.nixos\.org\/nixos\/(\d{2}\.\d{2})\/([^/]+)\/?$/;

/** A request may take this long. */
const TIMEOUT_MS = 60_000;
/** The package list is about 10 MB; anything far bigger isn't one. */
const INDEX_MAX_BYTES = 64 * 1024 * 1024;

/** Where a snapshot's files are on releases.nixos.org. */
export function snapshotUrl(pin: Pick<Pin, "release" | "snapshot">): string {
  return `https://releases.nixos.org/nixos/${pin.release.slice("nixos-".length)}/${pin.snapshot}`;
}

/**
 * The newest snapshot on a release's channel, or null when the channel
 * doesn't exist (yet). `channels.nixos.org/<release>` redirects to the
 * snapshot's directory; its `git-revision` must be the commit the name ends
 * with.
 */
export async function newestSnapshot(release: string, fetchImpl: Fetch = fetch): Promise<Pin | null> {
  const res = await fetchImpl(`${CHANNELS}/${release}`, {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404 || res.status === 403) return null;
  const location = res.headers.get("location") ?? "";
  const m = RELEASES.exec(location);
  const snap = m ? parseSnapshot(m[2]) : null;
  if (res.status < 300 || res.status >= 400 || !m || !snap || snap.release !== release)
    throw new Error(`${CHANNELS}/${release} didn't point at a snapshot of ${release}`);
  const pin = { release, snapshot: m[2], commit: "" };
  const rev = await fetchImpl(`${snapshotUrl(pin)}/git-revision`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const commit = rev.ok ? (await rev.text()).trim() : "";
  if (!isCommit(commit) || !commit.startsWith(snap.short))
    throw new Error(`${pin.snapshot} has no git-revision that matches its name`);
  return { ...pin, commit };
}

/** Saves a URL's bytes to a file; rejects on anything but a 200 or past `maxBytes`. */
export type Download = (url: string, dest: string, maxBytes: number) => Promise<void>;

/**
 * A file's bytes exactly as the server sends them. Not `fetch`: it would
 * undo the `Content-Encoding: br` releases.nixos.org serves the list with,
 * and the list is kept compressed, as the image keeps its own.
 */
export const downloadRaw: Download = (url, dest, maxBytes) =>
  new Promise<void>((ok, fail) => {
    const req = https.get(url, { timeout: 10 * TIMEOUT_MS }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        fail(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      if (Number(res.headers["content-length"]) > maxBytes) {
        res.destroy();
        fail(new Error(`too big (${res.headers["content-length"]} bytes)`));
        return;
      }
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) res.destroy(new Error("too big"));
      });
      pipeline(res, createWriteStream(dest)).then(ok, fail);
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", fail);
  });

/**
 * The snapshot's `packages.json.br` and `git-revision` into `dir`, the way
 * the image bakes its own. Written beside and renamed, so a cut-off download
 * never looks like a list.
 */
export async function downloadSnapshotIndex(pin: Pin, dir: string, download: Download = downloadRaw): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const tmp = join(dir, `packages.json.br.${process.pid}.tmp`);
  try {
    await download(`${snapshotUrl(pin)}/packages.json.br`, tmp, INDEX_MAX_BYTES);
    await fs.rename(tmp, join(dir, "packages.json.br"));
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw new Error(`${pin.snapshot}'s package list: ${(err as Error).message}`, { cause: err });
  }
  await fs.writeFile(join(dir, "git-revision"), pin.commit + "\n");
}
