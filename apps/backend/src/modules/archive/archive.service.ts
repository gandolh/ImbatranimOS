import { required } from "../../lib/required";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { unzip, zip, type Unzipped, type AsyncZippable } from "fflate";
import { execFile, spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import { constants as fsConstants, createReadStream, type Stats } from "fs";
import { Transform, Writable } from "stream";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import { basename, dirname, join, posix, relative, sep } from "path";
import { randomUUID } from "crypto";
import { FilesService } from "../files/files.service";
import { childEnv } from "../../child-env";
import type {
  ArchiveEntry,
  ArchiveJob,
  ArchiveFormat,
  ArchiveListing,
  LoneFlavour,
  TarFlavour,
} from "./dto/archive.dto";

/**
 * Spawn the real `tar` binary with a fixed argv array and NO shell. We use
 * Node's built-in `child_process.execFile` (never `exec`, never `shell:true`)
 * rather than execa: execa v9 is pure ESM and cannot be loaded under the repo's
 * CommonJS jest config, which would make the security tests unrunnable — and
 * those tests are the point of this module. `execFile` gives the identical
 * guarantee (argv array, no shell interpolation) with zero dependencies.
 */
const execFileAsync = promisify(execFile);

/** Wall-clock cap so a wedged tar can't hang a request. */
const TAR_TIMEOUT_MS = Number(process.env.ARCHIVE_TAR_TIMEOUT_MS) || 60_000;
/** Cap on tar's captured stdout (the member listing). */
const TAR_MAX_BUFFER = Number(process.env.ARCHIVE_TAR_MAX_BUFFER) || 32 * 1024 * 1024;

/**
 * Resource caps (zip-bomb / OOM guard). All env-overridable so the deploy can
 * tune them without a code change; read per-call so an env change takes effect
 * without a module reload. These bound the declared header sizes AND the actual
 * inflated bytes — a lying header can't slip past the total-bytes cap because it
 * is re-checked against actually-inflated bytes.
 */
const MAX_ENTRIES = () => Number(process.env.ARCHIVE_MAX_ENTRIES) || 10_000;
const MAX_TOTAL_BYTES = () => Number(process.env.ARCHIVE_MAX_TOTAL_BYTES) || 512 * 1024 * 1024;
const MAX_ENTRY_BYTES = () => Number(process.env.ARCHIVE_MAX_ENTRY_BYTES) || 512 * 1024 * 1024;
/** Cap on the compressed archive itself, so reading it can't blow the heap. */
const MAX_ARCHIVE_BYTES = () => Number(process.env.ARCHIVE_MAX_ARCHIVE_BYTES) || 200 * 1024 * 1024;
/**
 * Max plausible uncompressed:compressed ratio. DEFLATE's theoretical ceiling is
 * ~1032:1; we allow generous headroom. Critically, this bounds the per-entry /
 * total *declared* size to a small multiple of the ACTUAL archive bytes — so a
 * tiny archive whose central-directory header lies (e.g. 387 bytes declaring
 * 512 MiB) can't force `unzipSync` to pre-allocate the forged size. Without this
 * the absolute caps alone permit a ~1500x memory-amplification DoS.
 */
const MAX_COMPRESSION_RATIO = () => Number(process.env.ARCHIVE_MAX_RATIO) || 2000;
/** A suffix that may name one compressed file rather than a tarball. */
const LONE_SUFFIX = /\.(gz|xz|bz2)$/i;
/** The tar flavour a lone compressed file turns out to be when a tar is inside. */
const TAR_OF: Record<LoneFlavour, TarFlavour> = {
  gz: "targz",
  xz: "tarxz",
  bz2: "tarbz2",
};
/** What `link()` fails with on a file system that has no hard links. */
const NO_HARD_LINKS: ReadonlySet<string> = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"]);

/** Remove the folders `mkdir -p` made, from `leaf` up to `top`, while they are empty. */
async function removeMade(leaf: string, top: string): Promise<void> {
  for (let dir = leaf; ; dir = dirname(dir)) {
    try {
      await fs.rmdir(dir);
    } catch {
      return;
    }
    if (dir === top || dirname(dir) === dir) return;
  }
}

/** A counting semaphore: `acquire` waits for a free slot, `release` hands it on. */
class Slots {
  private free: number;
  private readonly waiting: (() => void)[] = [];
  constructor(size: number) {
    this.free = size;
  }
  async acquire(): Promise<void> {
    if (this.free > 0) {
      this.free--;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }
  release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.free++;
  }
}

/** How many lone files unpack at once. */
const LONE_CONCURRENCY = 2;

/** A staged file this old is a crash's leftover, not an unpack in progress. */
const STALE_STAGED_MS = 24 * 60 * 60 * 1000;
const STAGED_NAME = /^\.extract-[0-9a-f-]{36}\.part$/;

/** Thrown by a peek's sink once it has the bytes it wanted. */
class PeekDone extends Error {}

/**
 * The name a lone compressed file unpacks to: its own, without the suffix
 * (`notes.txt.gz` → `notes.txt`), as gunzip, unxz and bunzip2 name it. Null
 * when nothing would be left (a file called just `.gz`).
 */
export function loneOutputName(archiveName: string): string | null {
  const name = archiveName.replace(LONE_SUFFIX, "");
  return name === "" || name === "." || name === ".." ? null : name;
}

/**
 * `name`, then `notes (2).txt`, `notes (3).txt`…: the number goes before the
 * last extension, as Files numbers a new archive's name. A leading dot is a
 * hidden file's name, not an extension (`.bashrc (2)`).
 */
export function numberedName(name: string, n: number): string {
  if (n === 1) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
}

/**
 * The folder name an archive's file name stands for: its name without the
 * archive suffix. A plain .gz/.xz/.bz2 reaches here only with a tar inside.
 * Empty when nothing is left, or only dots (`.gz`, `..gz`).
 */
function deriveName(fileName: string): string {
  const base = fileName.replace(/\.(zip|tgz|tbz2?|txz|tar\.gz|tar\.bz2|tar\.xz|tar|gz|xz|bz2)$/i, "");
  return base === "." || base === ".." ? "" : base;
}

const isLone = (format: string): format is LoneFlavour => format === "gz" || format === "xz" || format === "bz2";

/** A write's full disk, as the 503 the files module answers with. */
async function diskFull<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOSPC" || code === "EDQUOT") {
      throw new ServiceUnavailableException("The disk is full — free some space and try again.");
    }
    throw err;
  }
}

/** How long a finished job stays pollable, and how many jobs are kept at all. */
const JOB_TTL_MS = 5 * 60 * 1000;
const MAX_JOBS = 50;

/**
 * Decode a stored entry name into something the jail can reason about.
 *
 * The brief asks for a decision on non-UTF8 names (legacy Windows zips) and for
 * it to be stated. The decision: **decode as UTF-8, replace invalid sequences,
 * and tell the user the name was repaired.** Never write a filename the jail
 * cannot reason about.
 *
 * Why not decode CP437 properly when the UTF-8 flag is unset? Because the flag is
 * frequently wrong in the wild, and a mis-guessed legacy codepage produces a
 * *different* wrong name with no warning attached. A replacement character is
 * visibly wrong, which is the honest failure — and `repaired` is surfaced in the
 * listing so the user knows the extracted name will differ from the original.
 *
 * The replacement character is also NUL-free and slash-free, so a repaired name
 * cannot become a traversal that the raw bytes were not.
 */
export function decodeEntryName(bytes: Uint8Array, utf8Flag: boolean): { name: string; repaired: boolean } {
  const strict = new TextDecoder("utf-8", { fatal: true });
  try {
    return { name: strict.decode(bytes), repaired: false };
  } catch {
    const lossy = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    void utf8Flag;
    return { name: lossy, repaired: true };
  }
}

/** DOS date/time (as stored in a zip central directory) to an ISO string. */
export function dosDateToIso(dosDate: number, dosTime: number): string | null {
  if (dosDate === 0) return null;
  const year = 1980 + ((dosDate >> 9) & 0x7f);
  const month = (dosDate >> 5) & 0x0f;
  const day = dosDate & 0x1f;
  const hours = (dosTime >> 11) & 0x1f;
  const minutes = (dosTime >> 5) & 0x3f;
  const seconds = (dosTime & 0x1f) * 2;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // DOS timestamps carry no zone; treated as UTC so the value is at least stable.
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * One line of `tar -tv` output.
 *
 * Parsed from the LEFT for the fixed fields and then "everything after the
 * timestamp" for the name — because column alignment differs between busybox and
 * GNU tar, and a filename may contain spaces. A line that does not match falls
 * back to treating the whole thing as a name, which is wrong in a visible way
 * rather than dropping the entry.
 */
export function parseTarListLine(line: string): ArchiveEntry {
  // e.g. "-rw-r--r-- 1000/1000  1234 2026-08-05 12:34:56 dir/my file.txt"
  const match = /^([dlbcps-])\S{9}\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)\s+(.*)$/.exec(line);
  if (!match) {
    const name = line.trim();
    return {
      name,
      size: null,
      compressedSize: null,
      directory: name.endsWith("/"),
      modified: null,
      nameRepaired: false,
    };
  }
  const [, typeChar, sizeText, date, time, rest] = match;
  // A tar listing writes a link as "name -> target"; the entry is the left side.
  const name = typeChar === "l" ? rest.split(" -> ")[0] : rest;
  const parsed = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  return {
    name,
    size: Number(sizeText),
    compressedSize: null,
    directory: typeChar === "d" || name.endsWith("/"),
    modified: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
    nameRepaired: false,
  };
}

export interface ExtractResult {
  dest: string;
  entries: number;
  totalBytes: number;
}

export interface CompressResult {
  dest: string;
  entries: number;
  bytes: number;
}

@Injectable()
export class ArchiveService {
  private readonly loneSlot = new Slots(LONE_CONCURRENCY);

  constructor(private readonly files: FilesService) {}

  /**
   * In-flight and recently finished extractions, keyed by an unguessable id.
   *
   * In memory on purpose: a job is meaningful only while the process that started
   * it is alive, and persisting one would invite resuming a half-extraction after
   * a restart — which is exactly the state the temp-dir-then-move flow exists to
   * make impossible.
   */
  private readonly jobs = new Map<string, { job: ArchiveJob; startedAt: number }>();

  // ── jobs (progress) ───────────────────────────────────────────────────────

  /**
   * Extraction as a polled job.
   *
   * **Polling, not a new transport.** A big extract with no feedback is
   * indistinguishable from a hang, and this module's own timeout and caps mean a
   * long job can also fail after a long silence. A WebSocket for one feature
   * would be a second realtime channel to secure and reason about; an id plus a
   * status endpoint reuses the guard that is already there.
   *
   * The job id is a CSPRNG value, not a counter: it is the only thing naming a
   * result, so it must not be guessable by another request. Jobs are also
   * per-process and expire, so a stale id cannot resurrect an old result.
   */
  startExtractJob(root: string, path: string, dest?: string, entries?: string[]): { id: string } {
    const id = randomUUID();
    const job: ArchiveJob = {
      id,
      state: "running",
      percent: 0,
      entriesDone: 0,
      entriesTotal: entries?.length ?? 0,
    };
    this.jobs.set(id, { job, startedAt: Date.now() });
    this.sweepJobs();

    // Deliberately not awaited: the caller gets an id immediately and polls.
    void this.extract(root, path, dest, entries)
      .then((result) => {
        job.state = "done";
        job.percent = 100;
        job.entriesDone = result.entries;
        job.entriesTotal = result.entries;
        job.result = result;
      })
      .catch((err: unknown) => {
        job.state = "failed";
        // The message is the user-facing one the service already composed
        // ("…past the size cap", "Refusing symlink entry…"), which is the whole
        // point of surfacing a failure rather than a silent stall.
        job.error = err instanceof Error ? err.message : "Extraction failed";
      });

    return { id };
  }

  getJob(id: string): ArchiveJob {
    const found = this.jobs.get(id);
    if (!found) throw new NotFoundException("No such extraction job");
    return found.job;
  }

  /** Drop finished jobs after a while so the map cannot grow without bound. */
  private sweepJobs(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, entry] of this.jobs) {
      if (entry.job.state !== "running" && entry.startedAt < cutoff) {
        this.jobs.delete(id);
      }
    }
    // A hard cap as well, in case something never finishes.
    if (this.jobs.size > MAX_JOBS) {
      const oldest = [...this.jobs.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt);
      for (const [id] of oldest.slice(0, this.jobs.size - MAX_JOBS)) {
        this.jobs.delete(id);
      }
    }
  }

  // ── list ───────────────────────────────────────────────────────────────────

  /**
   * Read what is inside an archive **without extracting it** — the headline of
   * the archive manager work, and most of what an archive manager is for.
   *
   * This reuses the validation that already existed rather than adding a second,
   * looser path: every declared entry goes through the same {@link resolveEntry}
   * jail a real extraction would use, and one that fails is reported in `refused`
   * instead of silently omitted. A listing that quietly dropped the dangerous
   * entries would be a listing that lies about the file.
   *
   * Nothing is written and nothing is inflated for a zip — only the central
   * directory is parsed.
   */
  async list(root: string, path: string): Promise<ArchiveListing> {
    const { abs: archiveAbs } = await this.files.resolveSafe(root, path);
    const stat = await this.statFile(archiveAbs);
    if (stat.size > MAX_ARCHIVE_BYTES()) {
      throw new PayloadTooLargeException(`Archive is too large to read (max ${MAX_ARCHIVE_BYTES()} bytes)`);
    }
    const format = await this.detectFormat(path, archiveAbs);
    if (isLone(format)) {
      // One file, and the only way to its size is to decompress it all.
      return {
        format,
        entries: [
          {
            name: this.loneName(path),
            size: null,
            compressedSize: stat.size,
            directory: false,
            modified: null,
            nameRepaired: false,
          },
        ],
        refused: [],
        encrypted: false,
        truncated: false,
      };
    }
    const destVirtual = this.deriveDest(path);

    const raw = format === "zip" ? await this.listZip(archiveAbs) : await this.listTar(archiveAbs, format);

    // Jail-check every declared name against a hypothetical extraction.
    const entries: ArchiveEntry[] = [];
    const refused: { name: string; reason: string }[] = [];
    for (const entry of raw.entries) {
      try {
        await this.resolveEntry(root, destVirtual, "", entry.name);
        entries.push(entry);
      } catch (err) {
        refused.push({
          name: entry.name,
          reason: err instanceof Error ? err.message : "refused",
        });
      }
    }

    return {
      format,
      entries,
      refused,
      encrypted: raw.encrypted,
      truncated: raw.truncated,
    };
  }

  /**
   * Parse a zip's central directory into rows. No inflation.
   *
   * Also detects encryption (general-purpose bit 0). `fflate` cannot decrypt, and
   * adding a crypto dependency for legacy ZipCrypto — which is broken anyway — is
   * not a trade worth making, so an encrypted zip is **declined with a clear
   * message** rather than failing cryptically halfway through an extract.
   */
  private async listZip(archiveAbs: string): Promise<{
    entries: ArchiveEntry[];
    encrypted: boolean;
    truncated: boolean;
  }> {
    const buf = await fs.readFile(archiveAbs);
    const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    const EOCD_SIG = 0x06054b50;
    const CDH_SIG = 0x02014b50;
    let eocd = -1;
    const minPos = Math.max(0, data.length - 22 - 0xffff);
    for (let i = data.length - 22; i >= minPos; i--) {
      if (view.getUint32(i, true) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new BadRequestException("Not a valid zip archive");

    const declared = view.getUint16(eocd + 10, true);
    const total = Math.min(declared, MAX_ENTRIES());
    let cdOffset = view.getUint32(eocd + 16, true);

    const entries: ArchiveEntry[] = [];
    let encrypted = false;
    for (let n = 0; n < total; n++) {
      if (cdOffset + 46 > data.length || view.getUint32(cdOffset, true) !== CDH_SIG) {
        throw new BadRequestException("Corrupt zip central directory");
      }
      const flags = view.getUint16(cdOffset + 8, true);
      if ((flags & 0x1) !== 0) encrypted = true;
      const dosTime = view.getUint16(cdOffset + 12, true);
      const dosDate = view.getUint16(cdOffset + 14, true);
      const compressedSize = view.getUint32(cdOffset + 20, true);
      const uncompressed = view.getUint32(cdOffset + 24, true);
      const nameLen = view.getUint16(cdOffset + 28, true);
      const extraLen = view.getUint16(cdOffset + 30, true);
      const commentLen = view.getUint16(cdOffset + 32, true);
      const nameBytes = data.subarray(cdOffset + 46, cdOffset + 46 + nameLen);
      // Bit 11 is the "names are UTF-8" flag. When it is unset the name is
      // officially CP437; decoding it as UTF-8 is what mangles a legacy Windows
      // zip. Either way the result is repaired to something the jail can reason
      // about, and the row says so — see decodeEntryName.
      const { name, repaired } = decodeEntryName(nameBytes, (flags & 0x800) !== 0);
      entries.push({
        name,
        size: uncompressed === 0xffffffff ? null : uncompressed,
        compressedSize: compressedSize === 0xffffffff ? null : compressedSize,
        directory: name.endsWith("/"),
        modified: dosDateToIso(dosDate, dosTime),
        nameRepaired: repaired,
      });
      cdOffset += 46 + nameLen + extraLen + commentLen;
    }
    return { entries, encrypted, truncated: declared > total };
  }

  /**
   * List a tar with `tar -tv`, which gives size and mtime as well as the name.
   *
   * Parsed positionally from the right rather than by column offset: busybox and
   * GNU tar align the columns differently, and a filename can contain spaces —
   * so the name is everything after the timestamp, not "field 6".
   */
  private async listTar(
    archiveAbs: string,
    flavour: TarFlavour,
  ): Promise<{
    entries: ArchiveEntry[];
    encrypted: boolean;
    truncated: boolean;
  }> {
    const flag = this.tarFlag(flavour);
    const { stdout } = await execFileAsync("tar", [`-tv${flag}f`, archiveAbs], {
      timeout: TAR_TIMEOUT_MS,
      env: childEnv(),
      maxBuffer: TAR_MAX_BUFFER,
    });
    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    const truncated = lines.length > MAX_ENTRIES();
    const entries: ArchiveEntry[] = [];
    for (const line of lines.slice(0, MAX_ENTRIES())) {
      entries.push(parseTarListLine(line));
    }
    return { entries, encrypted: false, truncated };
  }

  // ── extract ────────────────────────────────────────────────────────────────

  async extract(
    root: string,
    path: string,
    dest?: string,
    /**
     * Extract only these entries. **Untrusted client input** — the
     * exact zip-slip vector this module was hardened against — so it is jailed by
     * `resolveEntry` like any other name AND required to name an entry the
     * archive actually declares.
     */
    entries?: string[],
  ): Promise<ExtractResult> {
    const only = entries && entries.length > 0 ? new Set(entries) : undefined;
    const { abs: archiveAbs } = await this.files.resolveSafe(root, path);
    const stat = await this.statFile(archiveAbs);
    if (stat.size > MAX_ARCHIVE_BYTES()) {
      throw new PayloadTooLargeException(`Archive is too large to extract (max ${MAX_ARCHIVE_BYTES()} bytes)`);
    }

    // The format first, so an archive this module can't read leaves nothing
    // behind (it used to leave an empty destination folder).
    const format = await this.detectFormat(path, archiveAbs);
    if (isLone(format)) {
      return this.extractLone(root, path, archiveAbs, format, dest, only);
    }

    // Destination: caller-supplied, else a sibling folder named after the
    // archive (foo.tar.gz -> foo), or `foo (2)`… when that exists: extracting
    // the same archive twice must never land on the first copy.
    // Always re-jailed.
    if (dest === undefined && !deriveName(basename(path))) {
      // A `.gz` with a tar inside has no name left to make a folder of.
      throw new BadRequestException(`Can't name a folder for ${basename(path)}: rename it first`);
    }
    const destVirtual = dest ?? (await this.freeDest(root, this.deriveDest(path)));
    const { abs: destAbs } = await this.files.resolveSafe(root, destVirtual);

    await fs.mkdir(destAbs, { recursive: true });

    if (format === "zip") {
      return this.extractZip(root, destVirtual, destAbs, archiveAbs, only);
    }
    return this.extractTar(root, destVirtual, destAbs, archiveAbs, format, only);
  }

  /**
   * ZIP via fflate. THE JAIL: every entry name is joined to the destination and
   * re-validated through `resolveSafe` BEFORE a single byte is written. Names
   * are never trusted — `../x`, `/abs/x`, or a name whose realpath escapes are
   * hard-failed for the whole extraction. Note fflate has no notion of symlink
   * entries; a "symlink" entry is written as an ordinary file containing the
   * target text, so a zip cannot plant a traversing symlink at all.
   *
   * Zip-bomb guard runs in two layers:
   *   (1) a cheap central-directory scan ({@link inspectZip}) enforces the entry
   *       COUNT cap and the declared-uncompressed-size cap WITHOUT inflating a
   *       byte, so an honest bomb (headers report the true huge size) is
   *       rejected before any work.
   *   (2) after inflation, the ACTUAL decompressed sizes are summed and
   *       re-checked, so a header that lies about its size can't slip past.
   */
  private async extractZip(
    root: string,
    destVirtual: string,
    destAbs: string,
    archiveAbs: string,
    only?: Set<string>,
  ): Promise<ExtractResult> {
    const buf = await fs.readFile(archiveAbs);
    const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

    // (1) PRE-INFLATION guard: parse the ZIP central directory for entry count
    // and DECLARED uncompressed sizes and enforce the caps BEFORE inflating a
    // single byte — so an honest zip-bomb is rejected without doing the work.
    // (fflate's CJS `unzipSync` ignores its `filter` option, so we parse the
    // directory ourselves rather than trusting fflate to gate per entry.)
    this.inspectZip(data);

    // (2) Inflate, then verify ACTUAL inflated sizes against the caps (defeats a
    // header that lies about its size). Async `unzip` (not `unzipSync`): a large
    // archive inflates in chunks off the main thread instead of blocking all
    // HTTP + PTY for seconds. The size/ratio caps above still gate the work.
    let unzipped: Unzipped;
    try {
      unzipped = await new Promise<Unzipped>((resolve, reject) => {
        unzip(data, (err, out) => {
          if (err) reject(err instanceof Error ? err : new Error(err));
          else resolve(out);
        });
      });
    } catch {
      throw new BadRequestException("Corrupt or unreadable zip archive");
    }

    const names = Object.keys(unzipped);
    if (names.length > MAX_ENTRIES()) {
      throw new PayloadTooLargeException(`Archive has too many entries (max ${MAX_ENTRIES()})`);
    }
    let actualTotal = 0;
    for (const name of names) {
      const size = unzipped[name].length;
      actualTotal += size;
      if (size >= MAX_ENTRY_BYTES() || actualTotal >= MAX_TOTAL_BYTES()) {
        throw new PayloadTooLargeException(`Archive uncompresses past the size cap (max ${MAX_TOTAL_BYTES()} bytes)`);
      }
    }

    // (3) JAIL — resolve every entry against the dest, reject the whole
    // extraction on ANY escape, BEFORE writing anything.
    const absByName = new Map<string, string>();
    for (const name of names) {
      absByName.set(name, await this.resolveEntry(root, destVirtual, destAbs, name));
    }

    // A selected name the archive does not declare is a client inventing a path.
    if (only) {
      const declared = new Set(names);
      for (const wanted of only) {
        if (!declared.has(wanted)) {
          throw new BadRequestException(`That archive does not contain an entry named ${wanted}`);
        }
      }
    }

    // (4) Only now, write. Directory entries (trailing '/') become dirs.
    // The jail check above ran over EVERY declared name, not just the chosen
    // ones — a dangerous entry elsewhere in the archive is still a reason to
    // refuse the whole file, so a selection cannot be used to slip past it.
    let fileCount = 0;
    for (const name of names) {
      if (only && !only.has(name)) continue;
      const abs = required(absByName.get(name), name);
      if (name.endsWith("/")) {
        await fs.mkdir(abs, { recursive: true });
        continue;
      }
      await fs.mkdir(dirname(abs), { recursive: true });
      await fs.writeFile(abs, unzipped[name]);
      fileCount++;
    }

    return { dest: destVirtual, entries: fileCount, totalBytes: actualTotal };
  }

  /**
   * Minimal ZIP central-directory scan: entry count + declared uncompressed
   * sizes, WITHOUT inflating. Enforces the count / per-entry / total caps so an
   * honest zip-bomb is rejected up front. A ZIP64 size marker (0xFFFFFFFF) is
   * treated as "over cap" (our caps are far below 4 GiB anyway), never trusted
   * as a small value. Throws PayloadTooLargeException past a cap, BadRequest on
   * a structurally invalid archive.
   */
  private inspectZip(data: Uint8Array): void {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    // Locate the End Of Central Directory record: scan back for its signature
    // (0x06054b50). The trailing comment is bounded to 64 KiB by the spec.
    const EOCD_SIG = 0x06054b50;
    const CDH_SIG = 0x02014b50;
    let eocd = -1;
    const minPos = Math.max(0, data.length - 22 - 0xffff);
    for (let i = data.length - 22; i >= minPos; i--) {
      if (view.getUint32(i, true) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new BadRequestException("Not a valid zip archive");

    const totalEntries = view.getUint16(eocd + 10, true);
    if (totalEntries > MAX_ENTRIES()) {
      throw new PayloadTooLargeException(`Archive has too many entries (max ${MAX_ENTRIES()})`);
    }
    let cdOffset = view.getUint32(eocd + 16, true);

    // The declared sizes drive `unzipSync`'s pre-allocation, so bound them by a
    // ratio of the ACTUAL archive bytes (not just the absolute caps) — this is
    // what stops a forged-header amplification DoS. `>=` (not `>`) so a value
    // exactly at the cap is rejected too.
    const ratioCap = data.length * MAX_COMPRESSION_RATIO();
    const entryCap = Math.min(MAX_ENTRY_BYTES(), ratioCap);
    const totalCap = Math.min(MAX_TOTAL_BYTES(), ratioCap);

    let declaredTotal = 0;
    for (let n = 0; n < totalEntries; n++) {
      if (cdOffset + 46 > data.length || view.getUint32(cdOffset, true) !== CDH_SIG) {
        throw new BadRequestException("Corrupt zip central directory");
      }
      const uncompressed = view.getUint32(cdOffset + 24, true);
      const nameLen = view.getUint16(cdOffset + 28, true);
      const extraLen = view.getUint16(cdOffset + 30, true);
      const commentLen = view.getUint16(cdOffset + 32, true);
      // 0xFFFFFFFF => real size lives in a ZIP64 extra field; treat as over-cap.
      const size = uncompressed === 0xffffffff ? Infinity : uncompressed;
      declaredTotal += size;
      if (size >= entryCap || declaredTotal >= totalCap) {
        throw new PayloadTooLargeException(`Archive uncompresses past the size cap (max ${totalCap} bytes)`);
      }
      cdOffset += 46 + nameLen + extraLen + commentLen;
    }
  }

  /**
   * TAR / TAR.GZ via the image's real `tar` binary (array args, never a shell).
   * Defence in depth:
   *   (a) list members first (`tar -t`); reject absolute names, `..` segments,
   *       or any name that fails the resolveSafe jail — BEFORE extracting.
   *   (b) extract into a FRESH jailed temp dir (never `--absolute-names`, always
   *       `--no-same-owner`).
   *   (c) walk the extracted tree: reject any symlink whose target escapes the
   *       temp root — so a symlink-escape entry never reaches the real dest.
   *   (d) only then move the validated tree into the destination.
   */
  private async extractTar(
    root: string,
    destVirtual: string,
    destAbs: string,
    archiveAbs: string,
    flavour: TarFlavour,
    only?: Set<string>,
  ): Promise<ExtractResult> {
    const tmpVirtual = join(
      dirname(destVirtual) || ".",
      `.archive-tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const staged = await this.stageTarExtraction({
      root,
      destVirtual,
      tmpVirtual,
      archiveAbs,
      flavour,
      only,
    });
    try {
      // (d) move validated tree into the real destination.
      const entries = await this.mergeTree(staged.stagingAbs, destAbs);
      return { dest: destVirtual, entries, totalBytes: staged.totalBytes };
    } finally {
      await fs.rm(staged.stagingAbs, { recursive: true, force: true });
    }
  }

  /**
   * Steps (a)–(c) of the hardened tar path, stopping **before** anything is moved
   * into place. Returns the staging directory for the caller to inspect and to
   * clean up.
   *
   * This exists so backup and restore's restore can reuse the guards rather than
   * re-implement them: restore needs the verified tree in hand so it can swap it
   * in atomically with a rollback, which `extractTar`'s merge step cannot give it.
   * Splitting the method is real reuse — a second copy of a traversal check is a
   * second place for it to rot.
   *
   * `maxTotalBytes` overrides the zip-bomb cap. The default 512 MB is right for an
   * archive a user found somewhere; it is the wrong bound for restoring a whole
   * home volume, where the honest limit is how much disk is actually free. Only
   * the *resource* bound moves — traversal, symlink, hardlink, entry-count and
   * `--no-same-owner` are unchanged.
   */
  async stageTarExtraction(opts: {
    root: string;
    /** Jail context the member names are resolved against. */
    destVirtual: string;
    /** Where to stage, relative to the root. Created fresh; caller removes it. */
    tmpVirtual: string;
    archiveAbs: string;
    flavour: TarFlavour;
    only?: Set<string>;
    maxTotalBytes?: number;
  }): Promise<{ stagingAbs: string; members: string[]; totalBytes: number }> {
    const { root, destVirtual, tmpVirtual, archiveAbs, flavour, only } = opts;
    const flag = this.tarFlag(flavour);
    const listArgs = [`-t${flag}f`, archiveAbs];
    const { stdout } = await execFileAsync("tar", listArgs, {
      timeout: TAR_TIMEOUT_MS,
      env: childEnv(),
      maxBuffer: TAR_MAX_BUFFER,
    });
    const members = stdout.split("\n").filter((l) => l.length > 0);

    if (members.length > MAX_ENTRIES()) {
      throw new PayloadTooLargeException(`Archive has too many entries (max ${MAX_ENTRIES()})`);
    }

    // (a) name-based jail check, before any extraction. EVERY declared member is
    // checked, not only the selected ones: tar is being handed the archive whole,
    // so a dangerous member elsewhere in it is still a reason to refuse the file.
    for (const member of members) {
      await this.resolveEntry(root, destVirtual, "", member);
    }
    if (only) {
      // A selected name that the archive does not declare is a client inventing a
      // path — refuse rather than passing it to tar and hoping.
      const declared = new Set(members);
      for (const wanted of only) {
        if (!declared.has(wanted)) {
          throw new BadRequestException(`That archive does not contain an entry named ${wanted}`);
        }
      }
    }

    // (b) fresh jailed temp dir under the same root.
    const { abs: stagingAbs } = await this.files.resolveSafe(root, tmpVirtual);
    await fs.mkdir(stagingAbs, { recursive: true });

    try {
      // Selective extraction: the chosen members are appended as literal argv
      // entries AFTER `--`, so a member name beginning with `-` can never be read
      // as a tar option. Each has already been jail-checked above AND confirmed to
      // be a member the archive itself declares, so a client cannot name a path
      // the archive does not contain.
      const extractArgs = [
        `-x${flag}f`,
        archiveAbs,
        "-C",
        stagingAbs,
        "--no-same-owner",
        ...(only ? ["--", ...members.filter((m) => only.has(m))] : []),
      ];
      await execFileAsync("tar", extractArgs, {
        timeout: TAR_TIMEOUT_MS,
        env: childEnv(),
      });

      // (c) walk the extracted tree; reject symlink-escapes + enforce byte cap.
      const totalBytes = await this.verifyExtractedTree(stagingAbs, opts.maxTotalBytes);
      return { stagingAbs, members, totalBytes };
    } catch (err) {
      await fs.rm(stagingAbs, { recursive: true, force: true });
      throw err;
    }
  }

  /**
   * Recursively walk `rootAbs` (an already-extracted temp tree). Rejects any
   * symlink whose realpath escapes `rootAbs`, and enforces the total-bytes cap
   * against the real on-disk sizes. Returns the total bytes.
   */
  private async verifyExtractedTree(rootAbs: string, maxTotalBytes = MAX_TOTAL_BYTES()): Promise<number> {
    const realRoot = await fs.realpath(rootAbs);
    let total = 0;
    let count = 0;
    const walk = async (absDir: string): Promise<void> => {
      const dirents = await fs.readdir(absDir, { withFileTypes: true });
      for (const d of dirents) {
        const abs = join(absDir, d.name);
        if (++count > MAX_ENTRIES()) {
          throw new PayloadTooLargeException(`Archive has too many entries (max ${MAX_ENTRIES()})`);
        }
        if (d.isSymbolicLink()) {
          // A symlink may not resolve anywhere outside the temp root.
          let realTarget: string;
          try {
            realTarget = await fs.realpath(abs);
          } catch {
            // Broken/dangling link — still verify its literal target can't climb
            // out lexically before rejecting outright.
            const target = await fs.readlink(abs);
            throw new BadRequestException(`Refusing symlink entry pointing outside the archive: ${target}`);
          }
          if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
            throw new BadRequestException("Refusing symlink entry that escapes the extraction directory");
          }
          continue;
        }
        if (d.isDirectory()) {
          await walk(abs);
        } else if (d.isFile()) {
          const st = await fs.stat(abs);
          // Hardlink guard: a regular file with >1 link is a hardlink entry
          // sharing an inode with a file outside the temp tree (a symlink it is
          // not, so the check above missed it). GNU tar sanitises these, but the
          // `tar` binary is resolved from PATH — don't depend on its behaviour.
          if (st.nlink > 1) {
            throw new BadRequestException(
              "Refusing hardlink entry in archive (shares an inode outside the extraction directory)",
            );
          }
          total += st.size;
          if (total >= maxTotalBytes) {
            throw new PayloadTooLargeException(`Archive uncompresses past the size cap (max ${maxTotalBytes} bytes)`);
          }
        }
      }
    };
    await walk(rootAbs);
    return total;
  }

  /**
   * Move the staged tree into `toAbs`, file by file. Returns the file count.
   *
   * It used to `rm -rf` each top-level destination entry and rename the staged
   * one into its place, so extracting an archive into a folder that already
   * held its `project/` deleted every edit and every new file inside it, with
   * no prompt and no Trash. Now an existing directory is merged
   * into, a same-path file is replaced by `rename` (atomic), and nothing that
   * the archive does not contain is touched.
   */
  private async mergeTree(fromAbs: string, toAbs: string): Promise<number> {
    let files = 0;
    const merge = async (from: string, to: string): Promise<void> => {
      for (const d of await fs.readdir(from, { withFileTypes: true })) {
        const src = join(from, d.name);
        const dst = join(to, d.name);
        const existing = await fs.lstat(dst).catch(() => null);
        if (d.isDirectory()) {
          if (existing?.isDirectory()) {
            await merge(src, dst);
            continue;
          }
          // Nothing there, or a file where the archive has a folder: the
          // archive's folder wins, as a same-path file would.
          files += await countFiles(src);
          if (existing) await fs.rm(dst);
          await fs.rename(src, dst);
          continue;
        }
        if (existing?.isDirectory()) {
          throw new ConflictException(
            `"${d.name}" is a folder here, but a file in the archive; nothing under it was changed`,
          );
        }
        await fs.rename(src, dst);
        files++;
      }
    };
    const countFiles = async (abs: string): Promise<number> => {
      let n = 0;
      for (const d of await fs.readdir(abs, { withFileTypes: true })) {
        n += d.isDirectory() ? await countFiles(join(abs, d.name)) : 1;
      }
      return n;
    };
    await merge(fromAbs, toAbs);
    return files;
  }

  /**
   * `wanted`, or the first of `wanted (2)`, `wanted (3)`… that does not exist —
   * the Trash's naming convention, so a second extraction sits beside the
   * first instead of on top of it.
   */
  private async freeDest(root: string, wanted: string): Promise<string> {
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? wanted : `${wanted} (${n})`;
      const { abs } = await this.files.resolveSafe(root, candidate);
      const taken = await fs.lstat(abs).then(
        () => true,
        () => false,
      );
      if (!taken) return candidate;
    }
  }

  // ── a lone compressed file ─────────────────────────────────────────────────

  /**
   * Unpack one `.gz`, `.xz` or `.bz2` file (no tar inside) to one file beside
   * it, or in `dest`, named without the suffix — `notes.txt.gz` → `notes.txt`,
   * or `notes (2).txt` when that is taken. The compressed file stays, as
   * Windows' "Extract" and `gunzip -k` leave it.
   *
   * The bytes are decompressed into a fresh hidden staging file in the target
   * folder (opened `wx`, so not over anything, a symlink included), counted on
   * the way through: past the size cap the decompressor is stopped and the
   * staging file removed, so a bomb leaves nothing. Only a complete file is
   * placed, with a hard link that fails over anything already at the name —
   * the name is claimed by the link itself, so nothing can take it between a
   * check and the write. The folder must still be the one checked once the
   * file is in, or the file is taken back out.
   */
  private async extractLone(
    root: string,
    path: string,
    archiveAbs: string,
    kind: LoneFlavour,
    dest: string | undefined,
    only: Set<string> | undefined,
  ): Promise<ExtractResult> {
    const name = this.loneName(path);
    if (only && (only.size !== 1 || !only.has(name))) {
      const [wanted] = [...only].filter((n) => n !== name);
      throw new BadRequestException(`That archive does not contain an entry named ${wanted ?? name}`);
    }

    const parent = posix.dirname(path.replace(/\\/g, "/"));
    const folderVirtual = dest ?? (parent === "." ? "" : parent);
    const { abs: folderAbs } = await this.files.resolveSafe(root, folderVirtual);
    // The first folder this made, if any: taken back if the unpack fails.
    const made = await fs.mkdir(folderAbs, { recursive: true }).catch(() => undefined);
    const folder = await fs.stat(folderAbs).catch(() => null);
    if (!folder?.isDirectory()) {
      throw new BadRequestException(`Not a folder: ${folderVirtual || "/"}`);
    }
    // Everything below happens in the folder's real path, checked again once
    // the file is in.
    const realFolder = await fs.realpath(folderAbs);
    await this.sweepStaged(realFolder);

    // Short, so a long output name can't push the staging name past the limit.
    const staged = join(realFolder, `.extract-${randomUUID()}.part`);
    let created = false;
    let ok = false;
    let handle: fs.FileHandle | undefined;
    try {
      const writer = await diskFull(() => fs.open(staged, "wx"));
      const out = writer.createWriteStream();
      created = true;
      // A second descriptor on the same file, kept open: the re-check below
      // stats the file by it, whatever the folder's path reaches by then.
      handle = await fs.open(staged, "r");

      const totalBytes = await this.decompressInto(archiveAbs, kind, out).catch((err: unknown) => {
        // Closes the staging file when the stream never got going.
        out.destroy();
        throw err;
      });
      const placed = await diskFull(() => this.placeNumbered(staged, realFolder, name));
      if ((await fs.realpath(realFolder).catch(() => null)) !== realFolder) {
        // Take back only the file this made (the staging file's inode), not
        // whatever the name now reaches.
        const ours = await handle.stat();
        const there = await fs.lstat(join(realFolder, placed)).catch(() => null);
        if (there?.ino === ours.ino && there.dev === ours.dev) {
          await fs.rm(join(realFolder, placed), { force: true });
        }
        throw new BadRequestException("The folder changed while extracting");
      }
      ok = true;
      return {
        dest: folderVirtual ? posix.join(folderVirtual, placed) : placed,
        entries: 1,
        totalBytes,
      };
    } finally {
      // Only a staging file this made: `wx` failing means something else is there.
      if (created) await fs.rm(staged, { force: true });
      await handle?.close().catch(() => undefined);
      if (!ok && made !== undefined) await removeMade(folderAbs, made);
    }
  }

  /** Remove staged files an old crash left in `folder`. A recent one may be in use. */
  private async sweepStaged(folder: string): Promise<void> {
    try {
      for (const name of await fs.readdir(folder)) {
        if (!STAGED_NAME.test(name)) continue;
        const abs = join(folder, name);
        const stat = await fs.lstat(abs).catch(() => null);
        if (stat?.isFile() && Date.now() - stat.mtimeMs > STALE_STAGED_MS) {
          await fs.rm(abs, { force: true });
        }
      }
    } catch {
      // A folder that can't be listed is the unpack's own error to report.
    }
  }

  /**
   * Link `staged` in as `name`, or the first free `numberedName` after it.
   * `link` fails with EEXIST over anything at the name, a dangling symlink
   * included, where a rename would replace it; a file system without hard
   * links gets an exclusive copy instead. Returns the name it took.
   */
  private async placeNumbered(staged: string, folder: string, name: string): Promise<string> {
    for (let n = 1; n <= MAX_ENTRIES(); n++) {
      const candidate = numberedName(name, n);
      const target = join(folder, candidate);
      try {
        await fs.link(staged, target).catch((err: NodeJS.ErrnoException) => {
          if (!NO_HARD_LINKS.has(err.code ?? "")) throw err;
          return fs.copyFile(staged, target, fsConstants.COPYFILE_EXCL);
        });
        return candidate;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENAMETOOLONG") {
          throw new BadRequestException(
            `The name ${candidate.slice(0, 60)}… is too long to number: rename the archive first`,
          );
        }
        if (code !== "EEXIST") throw err;
      }
    }
    throw new ConflictException(`Too many files named like ${name} here`);
  }

  /** The output name for a lone compressed file at `path`, or a 400. */
  private loneName(path: string): string {
    const name = loneOutputName(basename(path));
    if (!name) {
      throw new BadRequestException(`Can't name the file inside ${basename(path)}: rename it first`);
    }
    return name;
  }

  /**
   * Decompress the whole file into `sink`, refusing past the size cap.
   * Resolves the byte count. The cap is the one on a single archive entry and
   * on a whole extraction (the smaller of the two), on bytes actually
   * produced: a gzip's trailer size is modulo 4 GiB and anyone can write it,
   * and xz and bzip2 need not declare a size at all. The zip path's ratio cap
   * isn't applied: it bounds a pre-allocation driven by a zip header, which a
   * stream doesn't make, and honest xz and bzip2 files pass 2000:1.
   */
  private async decompressInto(archiveAbs: string, kind: LoneFlavour, sink: Writable): Promise<number> {
    const cap = Math.min(MAX_ENTRY_BYTES(), MAX_TOTAL_BYTES());
    let total = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        total += chunk.length;
        if (total > cap) {
          done(new PayloadTooLargeException(`Archive uncompresses past the size cap (max ${cap} bytes)`));
        } else done(null, chunk);
      },
    });
    await diskFull(() => this.decompress(archiveAbs, kind, counter, sink));
    return total;
  }

  /**
   * The first `bytes` of the decompressed stream, or all of it when shorter.
   * Stops the decompressor once it has them.
   */
  private async peekDecompressed(archiveAbs: string, kind: LoneFlavour, bytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let have = 0;
    const sink = new Writable({
      write(chunk: Buffer, _enc, done) {
        chunks.push(chunk);
        have += chunk.length;
        done(have >= bytes ? new PeekDone() : null);
      },
    });
    const pass = new Transform({
      transform(chunk: Buffer, _enc, done) {
        done(null, chunk);
      },
    });
    try {
      await this.decompress(archiveAbs, kind, pass, sink);
    } catch (err) {
      if (!(err instanceof PeekDone)) throw err;
    }
    return Buffer.concat(chunks).subarray(0, bytes);
  }

  /**
   * Run `kind`'s decompressor over the file into `through` then `sink`.
   *
   * gzip is Node's own zlib (multi-member files included). xz and bzip2 are
   * the image's busybox `xzcat` and `bzcat` (both applets ship in Alpine's
   * busybox, checked in the running image), spawned with no shell and no
   * argv: the file is the child's stdin, so its name is never parsed. A
   * failure anywhere kills the child and waits for it to exit, so none is
   * left behind; a child that can't start is a 500 saying so, a non-zero exit
   * a 400 (the file is damaged), and the module's tar timeout bounds the lot.
   */
  private async decompress(archiveAbs: string, kind: LoneFlavour, through: Transform, sink: Writable): Promise<void> {
    // At most a couple at once: each can hold a thread, a child and a file.
    await this.loneSlot.acquire();
    try {
      await this.decompressNow(archiveAbs, kind, through, sink);
    } finally {
      this.loneSlot.release();
    }
  }

  private async decompressNow(
    archiveAbs: string,
    kind: LoneFlavour,
    through: Transform,
    sink: Writable,
  ): Promise<void> {
    const signal = AbortSignal.timeout(TAR_TIMEOUT_MS);
    const late = (): never => {
      throw new RequestTimeoutException(`Decompressing took too long (over ${TAR_TIMEOUT_MS / 1000} s)`);
    };
    const damaged = () => new BadRequestException(`The ${kind} file is damaged or not ${kind}`);

    if (kind === "gz") {
      try {
        await pipeline(createReadStream(archiveAbs), createGunzip(), through, sink, { signal });
      } catch (err) {
        if (signal.aborted) late();
        if (err instanceof HttpException || err instanceof PeekDone) throw err;
        if (String((err as NodeJS.ErrnoException).code).startsWith("Z_")) {
          throw damaged();
        }
        throw err;
      }
      return;
    }

    const command = this.decompressorCommand(kind);
    const input = await fs.open(archiveAbs, "r");
    let child: ChildProcess;
    // Listened for before anything awaits: a child that can't start says so
    // on the next tick, and an 'error' nobody hears would crash the process.
    let startError: Error | null = null;
    let exited: Promise<number | null>;
    try {
      child = spawn(command, [], {
        stdio: [input.fd, "pipe", "pipe"],
        env: childEnv(),
      });
      child.on("error", (err) => {
        startError = err;
      });
      exited = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
    } finally {
      // The child has its own copy of the descriptor by now.
      await input.close();
    }
    required(child.stderr, "the unpack process's stderr").resume();
    const unavailable = () =>
      new InternalServerErrorException(`Can't unpack ${kind} files here: ${command} is not available`);

    try {
      await pipeline(required(child.stdout, "the unpack process's stdout"), through, sink, { signal });
    } catch (err) {
      child.kill("SIGKILL");
      await exited;
      if (startError) throw unavailable();
      if (signal.aborted) late();
      throw err;
    }
    const code = await exited;
    if (startError) throw unavailable();
    if (code !== 0) throw damaged();
  }

  /** The program that decompresses `kind` to stdout. A seam for the tests. */
  protected decompressorCommand(kind: Exclude<LoneFlavour, "gz">): string {
    return kind === "xz" ? "xzcat" : "bzcat";
  }

  /** Which compressor wrote this file, from its first bytes; null for none. */
  private async sniffCompression(abs: string): Promise<LoneFlavour | null> {
    const fh = await fs.open(abs, "r");
    const head = Buffer.alloc(6);
    try {
      await fh.read(head, 0, 6, 0);
    } finally {
      await fh.close();
    }
    if (head[0] === 0x1f && head[1] === 0x8b) return "gz";
    if (head.equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]))) {
      return "xz";
    }
    if (head.subarray(0, 3).toString("latin1") === "BZh") return "bz2";
    return null;
  }

  // ── compress ─────────────────────────────────────────────────────────────

  /**
   * Create an archive.
   *
   * `ArchiveFormat` is `'zip' | 'targz'` and the DTO pins it with `@IsIn`, so
   * `.tar.xz` cannot be requested — which is correct rather than an oversight:
   * Alpine's busybox has **no `xz` applet** (`# CONFIG_XZ is not set`), only
   * `unxz`/`xzcat`, and busybox tar creates by exec'ing a separate compressor. A
   * `-cJf` would fail at exec time with a message about `xz` that says nothing
   * about the real cause. `.tar.bz2` creation *would* work (`CONFIG_BZIP2=y`) but
   * is not offered either: gzip and zip already cover the cases, and every extra
   * creatable format is another combination to keep tested for no user gain.
   * Extraction, where the user has no choice about the format, supports all four.
   */
  async compress(root: string, paths: string[], dest: string, format: ArchiveFormat): Promise<CompressResult> {
    const { rootDir } = await this.files.resolveSafe(root, "");
    const { abs: destAbs } = await this.files.resolveSafe(root, dest);

    // Resolve + existence-check every source through the jail.
    const sources: { abs: string; rel: string }[] = [];
    for (const p of paths) {
      const { abs } = await this.files.resolveSafe(root, p);
      if (!(await this.exists(abs))) {
        throw new NotFoundException(`Not found: ${p}`);
      }
      sources.push({ abs, rel: relative(rootDir, abs) });
    }

    await fs.mkdir(dirname(destAbs), { recursive: true });

    if (format === "zip") {
      return this.compressZip(sources, destAbs);
    }
    return this.compressTarGz(rootDir, sources, destAbs);
  }

  private async compressZip(sources: { abs: string; rel: string }[], destAbs: string): Promise<CompressResult> {
    const tree: AsyncZippable = {};
    let bytes = 0;
    let entries = 0;

    const addFile = async (abs: string, name: string): Promise<void> => {
      const st = await fs.stat(abs);
      bytes += st.size;
      entries++;
      if (entries > MAX_ENTRIES()) {
        throw new PayloadTooLargeException(`Too many files to compress (max ${MAX_ENTRIES()})`);
      }
      if (bytes > MAX_TOTAL_BYTES()) {
        throw new PayloadTooLargeException(`Selection is too large to compress (max ${MAX_TOTAL_BYTES()} bytes)`);
      }
      const buf = await fs.readFile(abs);
      tree[name] = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    };

    const addDir = async (abs: string, prefix: string): Promise<void> => {
      const dirents = await fs.readdir(abs, { withFileTypes: true });
      for (const d of dirents) {
        // Skip symlinks: never chase a link out of the jail while packing.
        if (d.isSymbolicLink()) continue;
        const childAbs = join(abs, d.name);
        const childName = posix.join(prefix, d.name);
        if (d.isDirectory()) await addDir(childAbs, childName);
        else if (d.isFile()) await addFile(childAbs, childName);
      }
    };

    for (const s of sources) {
      const st = await fs.lstat(s.abs);
      if (st.isSymbolicLink()) continue;
      const name = basename(s.rel);
      if (st.isDirectory()) await addDir(s.abs, name);
      else await addFile(s.abs, name);
    }

    // Async `zip` (not `zipSync`): deflating a large selection runs chunked off
    // the main thread instead of blocking all HTTP + PTY for seconds.
    const zipped = await new Promise<Uint8Array>((resolve, reject) => {
      zip(tree, (err, out) => {
        if (err) reject(err instanceof Error ? err : new Error(err));
        else resolve(out);
      });
    });
    await fs.writeFile(destAbs, zipped);
    return { dest: relative(dirname(destAbs), destAbs), entries, bytes };
  }

  private async compressTarGz(
    rootDir: string,
    sources: { abs: string; rel: string }[],
    destAbs: string,
  ): Promise<CompressResult> {
    // Relative member names, packed with cwd = the jail root. No shell.
    const rels = sources.map((s) => s.rel);
    await execFileAsync("tar", ["-czf", destAbs, "-C", rootDir, "--no-same-owner", ...rels], {
      timeout: TAR_TIMEOUT_MS,
      env: childEnv(),
    });
    // Count members for the response (list back the built archive).
    const { stdout } = await execFileAsync("tar", ["-tzf", destAbs], {
      timeout: TAR_TIMEOUT_MS,
      env: childEnv(),
      maxBuffer: TAR_MAX_BUFFER,
    });
    const members = stdout.split("\n").filter((l) => l && !l.endsWith("/"));
    const st = await fs.stat(destAbs);
    return { dest: basename(destAbs), entries: members.length, bytes: st.size };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * THE per-entry jail check. Rejects absolute names and any lexical `..`
   * segment up front (belt-and-suspenders), then joins the (normalised) entry
   * name to the destination and runs it through `resolveSafe`, which enforces
   * the lexical + realpath containment jail. Returns the safe absolute path.
   */
  private async resolveEntry(root: string, destVirtual: string, _destAbs: string, entryName: string): Promise<string> {
    const name = entryName.replace(/\/+$/, ""); // tolerate dir trailing slash
    if (name.length === 0) {
      // Root entry ('./' or '/') — maps to the dest itself.
      const { abs } = await this.files.resolveSafe(root, destVirtual);
      return abs;
    }
    if (name.includes("\0")) {
      throw new BadRequestException("Invalid entry name (NUL byte)");
    }
    // Reject absolute + drive-letter + UNC style names outright.
    if (/^([/\\]|[a-zA-Z]:)/.test(name)) {
      throw new BadRequestException(`Refusing absolute archive entry: ${name}`);
    }
    // Reject any `..` path segment (forward or back slash).
    const segs = name.split(/[/\\]+/);
    if (segs.some((s) => s === "..")) {
      throw new BadRequestException(`Refusing archive entry that escapes the destination: ${name}`);
    }
    const virtual = posix.join(destVirtual, ...segs);
    const { abs } = await this.files.resolveSafe(root, virtual);
    return abs;
  }

  /**
   * Which archive this is, and how tar should be told to read it.
   *
   * **Verified against the shipped image rather than assumed** — the brief calls
   * this out as the class of guess that broke `ps` and `git`. Docker pulls are
   * blocked from this environment, so the check was done the way the media player playlist and codecs work cleared
   * `--no-same-owner`: from busybox's own source and Alpine's build config
   * (`aports@3.22-stable main/busybox/busyboxconfig`, cross-checked on 3.21).
   *
   * The answer is **asymmetric**, which is exactly why guessing would have been
   * wrong in one direction or the other:
   *
   * | format      | read / list | create |
   * |-------------|-------------|--------|
   * | .tar        | yes         | yes    |
   * | .tar.gz/.tgz| yes         | yes    |
   * | .tar.bz2    | yes         | yes    |
   * | .tar.xz     | **yes**     | **no** |
   *
   * Reading uses busybox's *built-in* decompressors: `CONFIG_FEATURE_SEAMLESS_GZ`,
   * `_BZ2`, `_XZ` and `_LZMA` are all `=y`. Creating is different — busybox tar
   * `vfork`s and `execlp`s a separate compressor applet (`archival/tar.c:573-621`),
   * and Alpine sets `CONFIG_BZIP2=y`, `CONFIG_GZIP=y`, but
   * **`# CONFIG_XZ is not set`** (only `unxz`/`xzcat` exist). So `tar -cJf` would
   * fail to exec `xz`. `.tar.xz` is therefore offered for extraction only, and
   * {@link compress} refuses to create one with a message that says why.
   *
   * A name ending in plain `.gz`, `.xz` or `.bz2` is read by content: its
   * first bytes say which compressor wrote it (`1f 8b`, `fd 37 7a 58 5a 00`,
   * `BZh`), and the first 512 decompressed bytes whether a tar is inside
   * (`ustar` at offset 257). A tar inside is a tarball like any `.tar.gz`;
   * anything else is one compressed file ({@link extractLone}). The zip and
   * tar suffixes above are taken as they always were.
   */
  private async detectFormat(path: string, archiveAbs: string): Promise<TarFlavour | "zip" | LoneFlavour> {
    const bySuffix = this.formatBySuffix(path);
    if (bySuffix) return bySuffix;
    if (!LONE_SUFFIX.test(path)) {
      throw new BadRequestException(
        "Unsupported archive format (expected .zip, .tar, .tar.gz, .tgz, .tar.bz2, .tar.xz, .gz, .xz or .bz2)",
      );
    }
    const kind = await this.sniffCompression(archiveAbs);
    if (!kind) {
      throw new BadRequestException(`${basename(path)} is not a gzip, xz or bzip2 file`);
    }
    const head = await this.peekDecompressed(archiveAbs, kind, 512);
    const tar = head.subarray(257, 262).toString("latin1") === "ustar";
    return tar ? TAR_OF[kind] : kind;
  }

  /** The zip and tar formats, by name alone; null for any other name. */
  private formatBySuffix(path: string): TarFlavour | "zip" | null {
    const lower = path.toLowerCase();
    if (lower.endsWith(".zip")) return "zip";
    if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "targz";
    if (lower.endsWith(".tar.bz2") || lower.endsWith(".tbz2") || lower.endsWith(".tbz")) {
      return "tarbz2";
    }
    if (lower.endsWith(".tar.xz") || lower.endsWith(".txz")) return "tarxz";
    if (lower.endsWith(".tar")) return "tar";
    return null;
  }

  /**
   * The single-letter tar flag for a flavour.
   *
   * `-a` (autodetect by extension) is deliberately NOT used even though busybox
   * has `FEATURE_TAR_AUTODETECT=y`: being explicit means the argv says exactly
   * what will happen, and a future image without autodetect cannot change the
   * meaning of a call silently.
   */
  private tarFlag(flavour: TarFlavour): string {
    switch (flavour) {
      case "targz":
        return "z";
      case "tarbz2":
        return "j";
      case "tarxz":
        return "J";
      default:
        return "";
    }
  }

  private deriveDest(path: string): string {
    const dir = dirname(path);
    const base = deriveName(basename(path));
    return dir === "." ? base : posix.join(dir, base);
  }

  private async statFile(abs: string): Promise<Stats> {
    let stat: Stats;
    try {
      stat = await fs.stat(abs);
    } catch {
      throw new NotFoundException("Archive not found");
    }
    if (stat.isDirectory()) {
      throw new BadRequestException("Path is a directory, not an archive");
    }
    // A FIFO or a device would block a thread when read.
    if (!stat.isFile()) {
      throw new BadRequestException("Path is not a regular file");
    }
    return stat;
  }

  private async exists(abs: string): Promise<boolean> {
    try {
      await fs.stat(abs);
      return true;
    } catch {
      return false;
    }
  }
}
