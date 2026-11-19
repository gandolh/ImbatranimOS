import type { ChildProcess } from "child_process";
import { execFile, spawnSync } from "child_process";
import { closeSync, constants as fsConstants, openSync } from "fs";
import * as fs from "fs/promises";
import * as os from "os";
import { join } from "path";
import { promisify } from "util";
import { FilesService } from "../files/files.service";
import { ArchiveService } from "./archive.service";

const execFileAsync = promisify(execFile);

/** The pool holds the service's `spawn` sets up, one per decompressor started. */
const holds: Promise<void>[] = [];
let fifo = "";

// Builtin exports cannot be spied on in Node 24; wrap `spawn` instead.
jest.mock("child_process", () => {
  const actual = jest.requireActual<typeof import("child_process")>("child_process");
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      const child = actual.spawn(...args);
      holds.push(holdPoolUntilClosed(child));
      return child;
    },
  };
});

/** Threads in libuv's pool: every fs call the server makes waits for one. */
const POOL_SIZE = Number(process.env.UV_THREADPOOL_SIZE) || 4;

/**
 * A busy server, made exact: from the moment `child` starts until it has
 * exited and its output has closed, every thread of the pool is taken, so any
 * fs call the service awaits in that time finishes only after the child is
 * gone. Under load that happens by chance, since a small `xzcat` is done in a
 * millisecond. Each thread blocks opening a FIFO for reading; opening it
 * read-write counts as a writer and frees them all, queued ones included.
 */
async function holdPoolUntilClosed(child: ChildProcess): Promise<void> {
  const readers = Array.from({ length: POOL_SIZE }, () => fs.open(fifo, "r"));
  await new Promise<void>((resolve) => child.once("close", () => resolve()));
  const writer = openSync(fifo, fsConstants.O_RDWR);
  try {
    for (const reader of await Promise.all(readers)) await reader.close();
  } finally {
    closeSync(writer);
  }
}

function compressWith(tool: "xz" | "bzip2", data: Buffer): Buffer {
  const run = spawnSync(tool, ["-c"], { input: data });
  if (run.status !== 0) throw new Error(`${tool} failed: ${run.stderr.toString()}`);
  return run.stdout;
}

/**
 * The xz and bz2 decompressors are child processes. Node drains a child's
 * stdout to nowhere once the child exits with nobody reading it, so if the
 * service awaits anything between starting `xzcat` and reading it, a busy
 * server can find the output gone: the extract then counted 0 bytes and left
 * an empty file, with no error. Real files and the host's real `xzcat` and
 * `bzcat`.
 */
describe("ArchiveService — a decompressor done before a busy server reads it", () => {
  let service: ArchiveService;
  let jail: string;
  let pipes: string;
  const prevRoot = process.env.FILES_ROOT;
  const text = Buffer.from("line one\nline two\n".repeat(50));

  beforeEach(async () => {
    jail = await fs.mkdtemp(join(os.tmpdir(), "imb-busy-jail-"));
    pipes = await fs.mkdtemp(join(os.tmpdir(), "imb-busy-fifo-"));
    fifo = join(pipes, "pool");
    spawnSync("mkfifo", [fifo]);
    process.env.FILES_ROOT = jail;
    service = new ArchiveService(new FilesService());
    await fs.mkdir(join(jail, "docs"));
    holds.length = 0;
  });

  afterEach(async () => {
    // No thread stays held past its test.
    await Promise.all(holds);
    process.env.FILES_ROOT = prevRoot;
    await fs.rm(jail, { recursive: true, force: true });
    await fs.rm(pipes, { recursive: true, force: true });
  });

  it.each([
    ["xz", "xz"],
    ["bz2", "bzip2"],
  ] as const)("a .%s file: every byte reaches the file and the count", async (kind, tool) => {
    await fs.writeFile(join(jail, `docs/notes.txt.${kind}`), compressWith(tool, text));

    const res = await service.extract("home", `docs/notes.txt.${kind}`);

    // The format peek and the unpack each ran under a held pool.
    expect(holds).toHaveLength(2);
    expect(await fs.readFile(join(jail, "docs/notes.txt"))).toEqual(text);
    expect(res).toEqual({ dest: "docs/notes.txt", entries: 1, totalBytes: text.length });
    expect((await fs.readdir(join(jail, "docs"))).sort()).toEqual(["notes.txt", `notes.txt.${kind}`]);
  });

  it("a .xz holding a tar is still a tarball: the peek sees its header", async () => {
    await fs.mkdir(join(jail, "src"));
    await fs.writeFile(join(jail, "src/a.txt"), "alpha");
    await execFileAsync("tar", ["-cJf", join(jail, "docs/bundle.xz"), "-C", jail, "src"]);

    const res = await service.extract("home", "docs/bundle.xz");

    expect(holds).toHaveLength(1);
    expect(res.dest).toBe("docs/bundle");
    expect(await fs.readFile(join(jail, "docs/bundle/src/a.txt"), "utf8")).toBe("alpha");
  });
});
