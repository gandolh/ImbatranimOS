import { createHash } from "crypto";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import { join, posix } from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";

/**
 * A descriptor's published build output (`build.prebuilt`): downloaded, checked against the descriptor's SHA-256,
 * and unpacked into the build's output directory. The archive is a gzipped ustar holding only folders and regular
 * files, which imbatranim-apps' `npm run prebuilt` writes byte for byte the same from the same build, so anyone can
 * build the commit and get the digest the descriptor names.
 */

/** The most an archive may weigh as downloaded. imbatranim-office's whole output is 33 MB (2026-11-24). */
export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
/** The most it may hold unpacked, and in how many entries. */
export const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;
export const MAX_ENTRIES = 50_000;

const BLOCK = 512;

export type Fetched = { ok: true; bytes: number } | { ok: false; reason: string };

/**
 * Download `url` into `dest`, hashing as it goes. `ok` only when the SHA-256 is `sha256`; otherwise nothing is
 * left at `dest`.
 */
export async function fetchArchive(url: string, sha256: string, dest: string, timeoutMs: number): Promise<Fetched> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    return { ok: false, reason: `it could not be downloaded (${err instanceof Error ? err.message : String(err)})` };
  }
  if (!res.ok || !res.body) return { ok: false, reason: `its server answered ${res.status}` };
  const hash = createHash("sha256");
  let bytes = 0;
  const counted = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      if (bytes > MAX_ARCHIVE_BYTES) {
        done(new Error(`it is over ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB`));
        return;
      }
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body as never), counted, createWriteStream(dest, { mode: 0o600 }));
  } catch (err) {
    await fs.rm(dest, { force: true });
    return { ok: false, reason: `the download failed (${err instanceof Error ? err.message : String(err)})` };
  }
  const digest = hash.digest("hex");
  if (digest !== sha256) {
    await fs.rm(dest, { force: true });
    return { ok: false, reason: `its SHA-256 is ${digest}, not the descriptor's ${sha256}` };
  }
  return { ok: true, bytes };
}

/**
 * Unpack the gzipped ustar `file` into `dir`, which must not exist yet. Only folders and regular files, at relative
 * paths with no `..`, within {@link MAX_ENTRIES} and {@link MAX_UNPACKED_BYTES}; anything else (a link, a device, a
 * pax or GNU header, a broken header) throws, and the caller removes what was written. Files are written 0644.
 */
export async function unpackArchive(file: string, dir: string): Promise<{ files: number; bytes: number }> {
  await fs.mkdir(dir, { recursive: false, mode: 0o755 });
  const reader = new BlockReader(createReadStream(file).pipe(createGunzip()));
  const made = new Set<string>([""]);
  let entries = 0;
  let files = 0;
  let bytes = 0;
  for (;;) {
    const header = await reader.read(BLOCK);
    if (header === null || header.length < BLOCK) throw new Error("the archive ends without its closing blocks");
    if (header.every((b) => b === 0)) break;
    if (++entries > MAX_ENTRIES) throw new Error(`the archive holds over ${MAX_ENTRIES} entries`);
    const entry = parseHeader(header);
    const target = join(dir, ...entry.path.split("/"));
    if (entry.type === "dir") {
      await mkdirs(dir, entry.path, made);
      continue;
    }
    bytes += entry.size;
    if (bytes > MAX_UNPACKED_BYTES) throw new Error(`the archive unpacks to over ${MAX_UNPACKED_BYTES / 1024 ** 3} GB`);
    await mkdirs(dir, posix.dirname(entry.path), made);
    const out = await fs.open(target, "wx", 0o644);
    try {
      let left = entry.size;
      while (left > 0) {
        const chunk = await reader.read(Math.min(left, 64 * 1024));
        if (chunk === null) throw new Error(`the archive ends inside ${entry.path}`);
        await out.write(chunk);
        left -= chunk.length;
      }
    } finally {
      await out.close();
    }
    const pad = (BLOCK - (entry.size % BLOCK)) % BLOCK;
    if (pad > 0 && (await reader.read(pad)) === null) throw new Error(`the archive ends inside ${entry.path}`);
    files++;
  }
  return { files, bytes };
}

type Entry = { type: "file" | "dir"; path: string; size: number };

function parseHeader(h: Buffer): Entry {
  const text = (from: number, length: number) => {
    const end = h.indexOf(0, from);
    return h.toString("utf8", from, end === -1 || end > from + length ? from + length : end);
  };
  const magic = h.toString("latin1", 257, 263);
  if (magic !== "ustar\0" && magic !== "ustar ") throw new Error("the archive is not a ustar archive");
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : (h[i] ?? 0);
  if (parseInt(text(148, 8).trim() || "-1", 8) !== sum) throw new Error("an archive header fails its checksum");
  const prefix = text(345, 155);
  const name = text(0, 100);
  const raw = prefix ? `${prefix}/${name}` : name;
  const flag = String.fromCharCode(h[156] ?? 0);
  const type = flag === "0" || flag === "\0" ? "file" : flag === "5" ? "dir" : null;
  if (type === null) throw new Error(`${raw} is not a file or a folder (type ${JSON.stringify(flag)})`);
  const path = raw.replace(/\/+$/, "");
  const parts = path.split("/");
  if (!path || path.startsWith("/") || parts.some((p) => p === "" || p === "." || p === "..")) {
    throw new Error(`${JSON.stringify(raw)} is not a plain relative path`);
  }
  const size = type === "file" ? parseInt(text(124, 12).trim() || "0", 8) : 0;
  if (!Number.isSafeInteger(size) || size < 0) throw new Error(`${path} has no readable size`);
  return { type, path, size };
}

/** Make `rel`'s folders under `root`, each once. */
async function mkdirs(root: string, rel: string, made: Set<string>): Promise<void> {
  if (rel === "." || made.has(rel)) return;
  await mkdirs(root, posix.dirname(rel), made);
  await fs.mkdir(join(root, ...rel.split("/")), { mode: 0o755 }).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "EEXIST") throw err;
  });
  made.add(rel);
}

/** Exact-length reads from a stream: a whole header, or up to the bytes asked for of a file. */
class BlockReader {
  private readonly chunks: AsyncIterator<Buffer>;
  private held: Buffer = Buffer.alloc(0);

  constructor(stream: NodeJS.ReadableStream) {
    this.chunks = (stream as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
  }

  /** `n` bytes, or null at the end of the stream before any of them. Fewer only at the very end. */
  async read(n: number): Promise<Buffer | null> {
    while (this.held.length < n) {
      const next = await this.chunks.next();
      if (next.done) break;
      this.held = this.held.length === 0 ? next.value : Buffer.concat([this.held, next.value]);
    }
    if (this.held.length === 0) return null;
    const out = this.held.subarray(0, n);
    this.held = this.held.subarray(out.length);
    return out;
  }
}
