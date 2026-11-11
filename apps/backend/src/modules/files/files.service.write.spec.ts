import * as os from "os";
import { join } from "path";
import { ConflictException, ServiceUnavailableException } from "@nestjs/common";

/*
 * A save that fails part-way must leave the original file alone.
 *
 * The other atomicity tests use real filesystem conditions, but no real
 * condition fails `writeFile`'s own write without root (a full tmpfs) or
 * failing the old in-place write too. So this file mocks `fs/promises` (its
 * exports cannot be spied on in Node 24) with the real module plus a
 * `writeFile` a test can make fail after writing part of its data: a disk that
 * fills mid-save.
 */
jest.mock("fs/promises", () => {
  const actual = jest.requireActual<typeof import("fs/promises")>("fs/promises");
  return {
    ...actual,
    writeFile: jest.fn(actual.writeFile),
    link: jest.fn(actual.link),
  };
});

import * as fs from "fs/promises";
import type { FileAccess } from "./file-access";
import { FilesService } from "./files.service";

const actual = jest.requireActual<typeof import("fs/promises")>("fs/promises");
const writeFile = fs.writeFile as unknown as jest.Mock;
const link = fs.link as unknown as jest.Mock;

describe("FilesService.writeFile when the disk fills mid-save", () => {
  let service: FilesService;
  let jail: string;
  const prevEnv = process.env.FILES_ROOT;

  beforeEach(async () => {
    jail = await actual.mkdtemp(join(os.tmpdir(), "imb-write-"));
    process.env.FILES_ROOT = jail;
    service = new FilesService();
  });

  afterEach(async () => {
    writeFile.mockReset();
    writeFile.mockImplementation(actual.writeFile);
    process.env.FILES_ROOT = prevEnv;
    await actual.rm(jail, { recursive: true, force: true });
  });

  it("keeps the original bytes and leaves no staging file", async () => {
    await actual.writeFile(join(jail, "notes.txt"), "the only copy", "utf-8");
    writeFile.mockImplementationOnce(async (path: string, data: string) => {
      // Half the new content lands, then the disk is full.
      await actual.writeFile(path, data.slice(0, 4), "utf-8");
      throw Object.assign(new Error("ENOSPC: no space left on device"), {
        code: "ENOSPC",
      });
    });

    await expect(service.writeFile("home", "notes.txt", "a much longer replacement")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(await actual.readFile(join(jail, "notes.txt"), "utf-8")).toBe("the only copy");
    expect(await actual.readdir(jail)).toEqual(["notes.txt"]);
  });
});

describe("FilesService placing a file an app may only add", () => {
  let jail: string;
  const prevEnv = process.env.FILES_ROOT;
  const app = {
    appId: "notepad",
    instanceId: "w1",
    windowId: "w1",
    groups: ["notepad"],
  };
  // Given `assets/` to add to: making and reading there, never writing over.
  const adds = {
    how: (_who: unknown, op: string) => (op === "create" || op === "read" ? "grant" : null),
    addOnly: (_who: unknown, key: string) => (key.endsWith("/assets") ? "folder" : "file"),
    made: () => undefined,
  } as unknown as FileAccess;

  beforeEach(async () => {
    jail = await actual.mkdtemp(join(os.tmpdir(), "imb-add-"));
    process.env.FILES_ROOT = jail;
  });

  afterEach(async () => {
    writeFile.mockReset();
    writeFile.mockImplementation(actual.writeFile);
    link.mockReset();
    link.mockImplementation(actual.link);
    process.env.FILES_ROOT = prevEnv;
    await actual.rm(jail, { recursive: true, force: true });
  });

  it("never replaces a file that appeared after the check: a 409, the other bytes kept", async () => {
    const service = new FilesService(adds);
    const target = join(jail, "assets/shot.png");
    writeFile.mockImplementationOnce(async (path: string, data: string) => {
      // Another window writes the same name while this one stages its bytes.
      await actual.writeFile(target, "theirs", "utf-8");
      await actual.writeFile(path, data, "utf-8");
    });

    await expect(service.writeFile("home", "assets/shot.png", "mine", undefined, app)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(await actual.readFile(target, "utf-8")).toBe("theirs");
    expect(await actual.readdir(join(jail, "assets"))).toEqual(["shot.png"]);
  });

  it("places it when the name is free", async () => {
    const service = new FilesService(adds);
    await service.writeFile("home", "assets/shot.png", "mine", undefined, app);
    expect(await actual.readFile(join(jail, "assets/shot.png"), "utf-8")).toBe("mine");
    expect(await actual.readdir(join(jail, "assets"))).toEqual(["shot.png"]);
  });

  it("places it by an exclusive copy where the file system has no hard links", async () => {
    const service = new FilesService(adds);
    link.mockRejectedValueOnce(
      Object.assign(new Error("EPERM: operation not permitted"), {
        code: "EPERM",
      }),
    );
    await service.writeFile("home", "assets/shot.png", "mine", undefined, app);
    expect(await actual.readFile(join(jail, "assets/shot.png"), "utf-8")).toBe("mine");
    expect(await actual.readdir(join(jail, "assets"))).toEqual(["shot.png"]);

    // And still never over a file there.
    link.mockRejectedValueOnce(
      Object.assign(new Error("EPERM: operation not permitted"), {
        code: "EPERM",
      }),
    );
    writeFile.mockImplementationOnce(async (path: string, data: string) => {
      await actual.writeFile(join(jail, "assets/late.png"), "theirs", "utf-8");
      await actual.writeFile(path, data, "utf-8");
    });
    await expect(service.writeFile("home", "assets/late.png", "mine", undefined, app)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await actual.readFile(join(jail, "assets/late.png"), "utf-8")).toBe("theirs");
  });

  it("takes the file back out when its folder was swapped for a link meanwhile", async () => {
    const service = new FilesService(adds);
    await actual.mkdir(join(jail, "assets"));
    await actual.mkdir(join(jail, "elsewhere"));
    link.mockImplementationOnce(async (from: string, to: string) => {
      // Between the checks and the placing, assets/ becomes a link.
      await actual.rename(join(jail, "assets"), join(jail, "moved"));
      await actual.symlink(join(jail, "elsewhere"), join(jail, "assets"));
      await actual.link(from.replace(join(jail, "assets"), join(jail, "moved")), to);
    });
    await expect(service.writeFile("home", "assets/shot.png", "mine", undefined, app)).rejects.toThrow(
      "The folder changed while writing",
    );
    expect(await actual.readdir(join(jail, "elsewhere"))).toEqual([]);
  });
});
