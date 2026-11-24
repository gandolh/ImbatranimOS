import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { openZipEntry, readZipDirectory, ZipFormatError } from "./zip-reader";
import { ZipWriter } from "./zip-writer";

const collect = async (stream: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
};

describe("zip-reader", () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), "zip-reader-"));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it("reads the directory off disk and streams each entry back", async () => {
    const body = Buffer.from("line\n".repeat(20_000));
    writeFileSync(join(work, "a.txt"), body);
    writeFileSync(join(work, "e.txt"), "");
    const writer = new ZipWriter(join(work, "x.zip"));
    await writer.addFile("dir/a.txt", join(work, "a.txt"), new Date(2026, 10, 24, 10, 20, 30));
    await writer.addFile("dir/ţ.txt", join(work, "e.txt"), new Date(2026, 10, 24));
    await writer.finish();

    const { entries, declared } = await readZipDirectory(join(work, "x.zip"), 100);
    expect(declared).toBe(2);
    expect(entries.map((e) => [e.name, e.size, e.method])).toEqual([
      ["dir/a.txt", body.length, 8],
      ["dir/ţ.txt", 0, 8],
    ]);
    const [a, empty] = entries as [(typeof entries)[0], (typeof entries)[0]];
    expect((await collect(await openZipEntry(join(work, "x.zip"), a))).equals(body)).toBe(true);
    expect((await collect(await openZipEntry(join(work, "x.zip"), empty))).length).toBe(0);
  });

  it("refuses a file that is not a zip", async () => {
    writeFileSync(join(work, "no.zip"), "not a zip at all");
    await expect(readZipDirectory(join(work, "no.zip"), 100)).rejects.toBeInstanceOf(ZipFormatError);
  });
});
