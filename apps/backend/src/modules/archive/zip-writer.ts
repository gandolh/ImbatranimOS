import { createReadStream, createWriteStream, type WriteStream } from "fs";
import { Transform, Writable } from "stream";
import { pipeline } from "stream/promises";
import { createDeflateRaw, crc32 } from "zlib";

/**
 * A zip archive written as it is built: each file is read as a stream, deflated by Node's zlib (in its thread
 * pool, off the event loop) and written straight to the archive, its CRC and sizes in a data descriptor after
 * it, and the central directory at the end. Building the whole archive in memory (fflate's `zip`, every file read
 * first) took a 231 MB folder to a 1.9 GB backend and stalled it for 6 s (2026-11-24).
 *
 * Plain zip, no zip64: the callers cap an archive at 10,000 entries and 512 MB, under its 65,535 and 4 GB.
 */
export class ZipWriter {
  private readonly out: WriteStream;
  private readonly central: Buffer[] = [];
  private offset = 0;
  private entries = 0;

  constructor(path: string) {
    this.out = createWriteStream(path, { mode: 0o644 });
  }

  /** Adds the file at `abs` as `name` (a posix path inside the archive), stamped with `mtime`, streamed through. */
  async addFile(name: string, abs: string, mtime: Date): Promise<void> {
    const start = await this.begin(name, mtime);
    let crc = 0;
    let size = 0;
    let compressed = 0;
    const measure = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        crc = crc32(chunk, crc);
        size += chunk.length;
        done(null, chunk);
      },
    });
    const sink = new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        compressed += chunk.length;
        this.offset += chunk.length;
        if (this.out.write(chunk)) done();
        else this.out.once("drain", () => done());
      },
    });
    await pipeline(createReadStream(abs), measure, createDeflateRaw({ level: DEFLATE_LEVEL }), sink);
    await this.end(start, crc, compressed, size);
  }

  /** Adds an entry already deflated (raw deflate of `size` bytes whose CRC-32 is `crc`). */
  async addDeflated(name: string, mtime: Date, crc: number, size: number, deflated: Buffer): Promise<void> {
    const start = await this.begin(name, mtime);
    await this.write(deflated);
    await this.end(start, crc, deflated.length, size);
  }

  /** The local header; CRC and sizes follow the data, in the descriptor (flag bit 3). */
  private async begin(name: string, mtime: Date): Promise<{ at: number; name: Buffer; time: number; date: number }> {
    const nameBytes = Buffer.from(name, "utf8");
    const { time, date } = dosDateTime(mtime);
    const at = this.offset;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0 (deflate)
    local.writeUInt16LE(FLAGS, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt16LE(nameBytes.length, 26);
    await this.write(Buffer.concat([local, nameBytes]));
    return { at, name: nameBytes, time, date };
  }

  /** The data descriptor, and the entry's record for the central directory. */
  private async end(
    start: { at: number; name: Buffer; time: number; date: number },
    crc: number,
    compressed: number,
    size: number,
  ): Promise<void> {
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc >>> 0, 4);
    descriptor.writeUInt32LE(compressed, 8);
    descriptor.writeUInt32LE(size, 12);
    await this.write(descriptor);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(0x031e, 4); // made by: Unix, zip 3.0
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(FLAGS, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(start.time, 12);
    entry.writeUInt16LE(start.date, 14);
    entry.writeUInt32LE(crc >>> 0, 16);
    entry.writeUInt32LE(compressed, 20);
    entry.writeUInt32LE(size, 24);
    entry.writeUInt16LE(start.name.length, 28);
    entry.writeUInt32LE((0o100644 << 16) >>> 0, 38); // a regular file, rw-r--r--
    entry.writeUInt32LE(start.at, 42);
    this.central.push(entry, start.name);
    this.entries++;
  }

  /** Writes the central directory and closes the file. */
  async finish(): Promise<void> {
    const at = this.offset;
    const directory = Buffer.concat(this.central);
    await this.write(directory);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries, 8);
    end.writeUInt16LE(this.entries, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(at, 16);
    await this.write(end);
    await new Promise<void>((resolve, reject) => {
      this.out.once("error", reject);
      this.out.end(() => resolve());
    });
  }

  /** Stops writing; the caller removes the file. */
  abort(): void {
    this.out.destroy();
  }

  private write(bytes: Buffer): Promise<void> {
    this.offset += bytes.length;
    return new Promise((resolve, reject) => {
      this.out.write(bytes, (err) => (err ? reject(err) : resolve()));
    });
  }
}

/** zlib's default, what fflate's `zip` used. */
export const DEFLATE_LEVEL = 6;

/** Bit 3: CRC and sizes in a descriptor after the data. Bit 11: names are UTF-8. */
const FLAGS = 0x0808;

/** MS-DOS date and time, as zip keeps them: local time, two-second steps, 1980 at the earliest. */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}
