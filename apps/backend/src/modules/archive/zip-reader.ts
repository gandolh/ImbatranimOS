import { createReadStream, promises as fs } from "fs";
import { PassThrough, type Readable } from "stream";
import { createInflateRaw } from "zlib";

/** One entry of a zip's central directory, as extraction needs it. */
export interface ZipEntry {
  /** Decoded as fflate decodes it: UTF-8 when the entry says so (flag bit 11), latin1 otherwise. */
  name: string;
  /** The name as stored, for a listing that repairs legacy names its own way. */
  nameBytes: Buffer;
  flags: number;
  /** MS-DOS time and date, as stored. */
  dosTime: number;
  dosDate: number;
  method: number;
  compressedSize: number;
  compressedSizeIsZip64: boolean;
  /** As declared; null for a zip64 marker. */
  size: number | null;
  localHeaderOffset: number;
}

/** The central directory may be at most this big to be read: 10,000 entries of long names fit in a few MB. */
const MAX_DIRECTORY_BYTES = 64 * 1024 * 1024;

/**
 * Reads a zip's central directory from the file at `path`: the tail (to find the end record) and the directory,
 * never the entries' data. `maxEntries` bounds the rows read. Throws "Not a valid zip archive" or "Corrupt zip
 * central directory" as `Error`s for the caller to map.
 */
export async function readZipDirectory(
  path: string,
  maxEntries: number,
): Promise<{ entries: ZipEntry[]; declared: number; fileSize: number }> {
  const fh = await fs.open(path, "r");
  try {
    const { size: fileSize } = await fh.stat();
    const tailLength = Math.min(fileSize, 22 + 0xffff);
    const tail = Buffer.alloc(tailLength);
    await fh.read(tail, 0, tailLength, fileSize - tailLength);
    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ZipFormatError("Not a valid zip archive");
    const declared = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);
    if (directorySize > MAX_DIRECTORY_BYTES || directoryOffset + directorySize > fileSize) {
      throw new ZipFormatError("Corrupt zip central directory");
    }
    const directory = Buffer.alloc(directorySize);
    await fh.read(directory, 0, directorySize, directoryOffset);

    const entries: ZipEntry[] = [];
    let at = 0;
    for (let n = 0; n < Math.min(declared, maxEntries); n++) {
      if (at + 46 > directory.length || directory.readUInt32LE(at) !== 0x02014b50) {
        throw new ZipFormatError("Corrupt zip central directory");
      }
      const flags = directory.readUInt16LE(at + 8);
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      if (at + 46 + nameLength > directory.length) throw new ZipFormatError("Corrupt zip central directory");
      const nameBytes = directory.subarray(at + 46, at + 46 + nameLength);
      const uncompressed = directory.readUInt32LE(at + 24);
      entries.push({
        name: flags & 0x800 ? nameBytes.toString("utf8") : nameBytes.toString("latin1"),
        nameBytes: Buffer.from(nameBytes),
        flags,
        dosTime: directory.readUInt16LE(at + 12),
        dosDate: directory.readUInt16LE(at + 14),
        method: directory.readUInt16LE(at + 10),
        compressedSize: directory.readUInt32LE(at + 20),
        compressedSizeIsZip64: directory.readUInt32LE(at + 20) === 0xffffffff,
        size: uncompressed === 0xffffffff ? null : uncompressed,
        localHeaderOffset: directory.readUInt32LE(at + 42),
      });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return { entries, declared, fileSize };
  } finally {
    await fh.close();
  }
}

/**
 * The entry's data, inflated (deflate) or as stored, read from the archive at `path` as a stream. Throws
 * `ZipFormatError` for an encrypted entry, another method, or a broken local header.
 */
export async function openZipEntry(path: string, entry: ZipEntry): Promise<Readable> {
  if (entry.flags & 0x1) throw new ZipFormatError("Encrypted zip entries can't be extracted");
  if (entry.method !== 0 && entry.method !== 8) throw new ZipFormatError("Unsupported zip compression method");
  const fh = await fs.open(path, "r");
  let start: number;
  try {
    const header = Buffer.alloc(30);
    const { bytesRead } = await fh.read(header, 0, 30, entry.localHeaderOffset);
    if (bytesRead < 30 || header.readUInt32LE(0) !== 0x04034b50) throw new ZipFormatError("Corrupt zip entry");
    start = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  } finally {
    await fh.close();
  }
  if (entry.compressedSize === 0) {
    const empty = new PassThrough();
    empty.end();
    return empty;
  }
  const raw = createReadStream(path, { start, end: start + entry.compressedSize - 1 });
  if (entry.method === 0) return raw;
  const inflate = createInflateRaw();
  raw.on("error", (err) => inflate.destroy(err));
  return raw.pipe(inflate);
}

/** A zip the reader can't take: the caller answers 400. */
export class ZipFormatError extends Error {}
