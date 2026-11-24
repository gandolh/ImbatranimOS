import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { unzipSync } from "fflate";
import { tmpdir } from "os";
import { join } from "path";
import { crc32, deflateRawSync } from "zlib";
import { ZipWriter } from "./zip-writer";

describe("ZipWriter", () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), "zip-writer-"));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it("writes streamed and pre-deflated entries another reader takes back byte for byte", async () => {
    const big = Buffer.alloc(300_000).map((_, i) => (i * 31) % 251);
    writeFileSync(join(work, "big.bin"), big);
    writeFileSync(join(work, "empty.txt"), "");
    const small = Buffer.from("ţară şi oraş\n");
    const writer = new ZipWriter(join(work, "out.zip"));
    await writer.addFile("dir/big.bin", join(work, "big.bin"), new Date(2026, 10, 24, 12, 30, 10));
    await writer.addFile("dir/empty.txt", join(work, "empty.txt"), new Date(2026, 10, 24));
    await writer.addDeflated("dir/ţară.txt", new Date(2026, 10, 24), crc32(small), small.length, deflateRawSync(small));
    await writer.finish();

    const back = unzipSync(readFileSync(join(work, "out.zip")));
    expect(Object.keys(back).sort()).toEqual(["dir/big.bin", "dir/empty.txt", "dir/ţară.txt"]);
    expect(Buffer.from(back["dir/big.bin"] ?? []).equals(big)).toBe(true);
    expect(back["dir/empty.txt"]?.length).toBe(0);
    expect(Buffer.from(back["dir/ţară.txt"] ?? []).toString()).toBe("ţară şi oraş\n");
  });
});
