import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { trimNpmCache } from "./marketplace.service";

describe("trimNpmCache", () => {
  let dir: string;
  let cache: string;
  const file = (path: string, bytes: number) => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, Buffer.alloc(bytes));
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "npm-cache-"));
    cache = join(dir, "npm");
    mkdirSync(cache, { mode: 0o700 });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps a cache at or under the cap", async () => {
    file(join(cache, "_cacache", "content-v2", "sha512", "aa", "one"), 600);
    file(join(cache, "_cacache", "index-v5", "bb", "two"), 400);

    expect(await trimNpmCache(cache, 1000)).toBe(0);
    expect(existsSync(join(cache, "_cacache", "content-v2", "sha512", "aa", "one"))).toBe(true);
  });

  it("empties a cache over the cap and leaves it an empty private folder", async () => {
    file(join(cache, "_cacache", "content-v2", "sha512", "aa", "one"), 600);
    file(join(cache, "_cacache", "content-v2", "sha512", "cc", "three"), 600);

    expect(await trimNpmCache(cache, 1000)).toBeGreaterThan(1000);
    expect(readdirSync(cache)).toEqual([]);
    expect(statSync(cache).mode & 0o777).toBe(0o700);
  });

  it("counts no file outside through a symlink, and removes none", async () => {
    file(join(dir, "outside", "big"), 5000);
    symlinkSync(join(dir, "outside"), join(cache, "linked"));

    expect(await trimNpmCache(cache, 1000)).toBe(0);
    expect(existsSync(join(dir, "outside", "big"))).toBe(true);
  });

  it("does nothing when there is no cache yet", async () => {
    expect(await trimNpmCache(join(dir, "missing"), 1000)).toBe(0);
  });
});
