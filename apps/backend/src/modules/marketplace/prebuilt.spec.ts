import { createHash } from "crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { gunzipSync, gzipSync } from "zlib";
import { fetchArchive, unpackArchive } from "./prebuilt";
import { tarball } from "../../../test/fixtures/tarball";

describe("prebuilt archives", () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), "prebuilt-"));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  const unpack = (archive: Buffer) => {
    writeFileSync(join(work, "a.tgz"), archive);
    return unpackArchive(join(work, "a.tgz"), join(work, "out"));
  };

  it("unpacks folders and files, a long path through the ustar prefix, all 0644", async () => {
    const deep = "a".repeat(60);
    const got = await unpack(
      tarball([
        { path: "todo/" },
        { path: "todo/app.mjs", body: "export default 1;\n" },
        { path: "empty.txt", body: "" },
        { path: "b".repeat(90) + ".js", prefix: `${deep}/${deep}`, body: "x".repeat(700) },
      ]),
    );
    expect(got).toEqual({ files: 3, bytes: 18 + 700 });
    expect(readFileSync(join(work, "out", "todo", "app.mjs"), "utf8")).toBe("export default 1;\n");
    expect(readFileSync(join(work, "out", deep, deep, "b".repeat(90) + ".js"), "utf8")).toBe("x".repeat(700));
    expect(statSync(join(work, "out", "todo", "app.mjs")).mode & 0o777).toBe(0o644);
  });

  it.each([
    ["a symlink", { path: "evil", type: "2", linkname: "/etc/passwd" }],
    ["a hard link", { path: "evil", type: "1", linkname: "../x" }],
    ["a pax header", { path: "PaxHeader", type: "x", body: "30 path=../../outside\n" }],
    ["a path up", { path: "../outside.txt", body: "x" }],
    ["an absolute path", { path: "/tmp/outside.txt", body: "x" }],
    ["a dot segment", { path: "a/./b.txt", body: "x" }],
    ["another format", { path: "a.txt", body: "x", magic: "notar\0" }],
  ])("refuses %s", async (_name, item) => {
    await expect(unpack(tarball([item]))).rejects.toThrow();
    expect(existsSync(join(work, "outside.txt"))).toBe(false);
  });

  it("refuses a header that fails its checksum, a truncated archive and an existing folder", async () => {
    await expect(unpack(tarball([{ path: "a.txt", body: "x" }], { badChecksum: true }))).rejects.toThrow(/checksum/);
    rmSync(join(work, "out"), { recursive: true, force: true });
    const whole = tarball([{ path: "a.txt", body: "x".repeat(2000) }]);
    await expect(unpack(gzipSync(gunzipSync(whole).subarray(0, 1024)))).rejects.toThrow(/ends/);
    rmSync(join(work, "out"), { recursive: true, force: true });
    mkdirSync(join(work, "out"));
    await expect(unpack(tarball([]))).rejects.toThrow(/EEXIST/);
  });

  describe("fetchArchive", () => {
    let server: Server;
    let base: string;
    const body = tarball([{ path: "a.txt", body: "hello" }]);
    const digest = createHash("sha256").update(body).digest("hex");
    beforeAll(async () => {
      server = createServer((req, res) => {
        if (req.url === "/a.tgz") res.end(body);
        else if (req.url === "/moved") res.writeHead(302, { location: "/a.tgz" }).end();
        else res.writeHead(404).end();
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it("keeps an archive whose digest matches, through a redirect", async () => {
      const dest = join(work, "got.tgz");
      expect(await fetchArchive(`${base}/moved`, digest, dest, 5_000)).toEqual({ ok: true, bytes: body.length });
      expect(readFileSync(dest).equals(body)).toBe(true);
    });

    it("refuses another digest and leaves nothing behind", async () => {
      const dest = join(work, "got.tgz");
      const got = await fetchArchive(`${base}/a.tgz`, "0".repeat(64), dest, 5_000);
      expect(got.ok).toBe(false);
      expect(got.ok ? "" : got.reason).toMatch(/SHA-256/);
      expect(readdirSync(work)).toEqual([]);
    });

    it("says why when the server refuses", async () => {
      const got = await fetchArchive(`${base}/missing`, digest, join(work, "got.tgz"), 5_000);
      expect(got).toEqual({ ok: false, reason: "its server answered 404" });
    });
  });
});
