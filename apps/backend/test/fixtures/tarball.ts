import { gzipSync } from "zlib";

/**
 * A published build's archive as imbatranim-apps' `npm run prebuilt` writes one (gzipped ustar, folders and regular
 * files, mode 0644, owner 0, time 0), or broken in the ways a test asks: another entry type, a link name, a path
 * through the ustar prefix, another magic, a wrong checksum.
 */
export type TarItem = {
  path: string;
  body?: string;
  type?: string;
  linkname?: string;
  prefix?: string;
  magic?: string;
};

export function tarball(items: TarItem[], options: { badChecksum?: boolean } = {}): Buffer {
  const blocks: Buffer[] = [];
  for (const item of items) {
    const h = Buffer.alloc(512);
    const body = Buffer.from(item.body ?? "");
    const type = item.type ?? (item.path.endsWith("/") ? "5" : "0");
    h.write(item.path, 0, 100, "utf8");
    h.write("0000644\0", 100, "latin1");
    h.write("0000000\0", 108, "latin1");
    h.write("0000000\0", 116, "latin1");
    h.write(`${(type === "0" ? body.length : 0).toString(8).padStart(11, "0")}\0`, 124, "latin1");
    h.write("00000000000\0", 136, "latin1");
    h.write(type, 156, "latin1");
    if (item.linkname) h.write(item.linkname, 157, 100, "utf8");
    h.write(item.magic ?? "ustar\0", 257, "latin1");
    h.write("00", 263, "latin1");
    if (item.prefix) h.write(item.prefix, 345, 155, "utf8");
    h.fill(32, 148, 156);
    let sum = 0;
    for (const b of h) sum += b;
    if (options.badChecksum) sum += 1;
    h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "latin1");
    blocks.push(h);
    if (type === "0" && body.length > 0) {
      blocks.push(body, Buffer.alloc((512 - (body.length % 512)) % 512));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}
