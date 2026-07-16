import { FilesService } from './files.service';
import * as fs from 'fs/promises';
import * as os from 'os';
import { join } from 'path';
import type { Readable } from 'stream';

/** Drain a readable stream into a single Buffer. */
async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

describe('FilesService (jail + real filesystem)', () => {
  let service: FilesService;
  let jail: string;
  let outside: string;
  const prevEnv = process.env.FILES_ROOT;

  beforeEach(async () => {
    // A fresh scratch dir per test IS the `home` root for this run.
    jail = await fs.mkdtemp(join(os.tmpdir(), 'imb-jail-'));
    outside = await fs.mkdtemp(join(os.tmpdir(), 'imb-outside-'));
    process.env.FILES_ROOT = jail;
    service = new FilesService();
  });

  afterEach(async () => {
    process.env.FILES_ROOT = prevEnv;
    await fs.rm(jail, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  describe('real filesystem round-trips', () => {
    it('mkdir + createFile land on the real disk and list back', async () => {
      await service.createDirectory('home', 'projects');
      await service.createFile('home', 'projects/readme.txt', 'hi');

      // Confirm on the ACTUAL disk, not just via the API.
      const onDisk = await fs.readFile(join(jail, 'projects/readme.txt'), 'utf-8');
      expect(onDisk).toBe('hi');

      const listing = await service.list('home', 'projects');
      expect(listing.map((e) => e.name).sort()).toEqual(['readme.txt']);
    });

    it('a file created directly on disk shows up via list (and vice versa)', async () => {
      await fs.writeFile(join(jail, 'external.txt'), 'made outside the api');
      const listing = await service.list('home');
      expect(listing.find((e) => e.name === 'external.txt')).toBeTruthy();
    });

    it('round-trips a BINARY file byte-for-byte through upload + download', async () => {
      // Bytes, not a string: include NUL, 0xFF, and non-UTF-8 sequences.
      const bytes = Buffer.from([
        0x00, 0x01, 0x02, 0xff, 0xfe, 0x80, 0x7f, 0x00, 0xab, 0xcd,
      ]);
      await service.uploadFile('home', 'bin/blob.dat', bytes);

      const stream = await service.readFileStream('home', 'bin/blob.dat');
      const out = await collect(stream);
      expect(out.equals(bytes)).toBe(true);
      // And it really exists on disk with the same bytes.
      const onDisk = await fs.readFile(join(jail, 'bin/blob.dat'));
      expect(onDisk.equals(bytes)).toBe(true);
    });

    it('move renames on the real disk', async () => {
      await service.createFile('home', 'a.txt', 'x');
      await service.move('home', 'a.txt', 'b.txt');
      await expect(fs.stat(join(jail, 'a.txt'))).rejects.toBeTruthy();
      expect(await fs.readFile(join(jail, 'b.txt'), 'utf-8')).toBe('x');
    });

    it('delete removes from the real disk', async () => {
      await service.createFile('home', 'gone.txt', 'x');
      await service.delete('home', 'gone.txt');
      await expect(fs.stat(join(jail, 'gone.txt'))).rejects.toBeTruthy();
    });
  });

  describe('path-traversal jail', () => {
    it('refuses ../../etc/passwd', async () => {
      await expect(
        service.resolveSafe('home', '../../etc/passwd'),
      ).rejects.toThrow(/traversal/i);
      await expect(service.list('home', '../../etc')).rejects.toThrow(
        /traversal/i,
      );
    });

    it('refuses deeper ../ escapes and absolute re-rooting', async () => {
      await expect(
        service.resolveSafe('home', '../../../../../../etc/passwd'),
      ).rejects.toThrow(/traversal/i);
      // An absolute path must be treated as root-relative, never re-root.
      const { abs } = await service.resolveSafe('home', '/etc/passwd');
      expect(abs).toBe(join(jail, 'etc/passwd'));
    });

    it('refuses percent-encoded traversal (%2e%2e) including double-encoding', async () => {
      await expect(
        service.resolveSafe('home', '%2e%2e/%2e%2e/etc/passwd'),
      ).rejects.toThrow(/traversal/i);
      await expect(
        service.resolveSafe('home', '%2e%2e%2f%2e%2e%2fetc%2fpasswd'),
      ).rejects.toThrow(/traversal/i);
      // Double-encoded: %252e decodes to %2e decodes to '.'
      await expect(
        service.resolveSafe('home', '%252e%252e/%252e%252e/etc'),
      ).rejects.toThrow(/traversal/i);
    });

    it('refuses NUL byte injection', async () => {
      await expect(
        service.resolveSafe('home', 'ok\0/../../etc'),
      ).rejects.toThrow();
    });

    it('refuses a symlink that points outside the jail', async () => {
      // Plant a secret outside, then a symlink inside the jail pointing at it.
      await fs.writeFile(join(outside, 'secret.txt'), 'top secret');
      await fs.symlink(outside, join(jail, 'escape'), 'dir');

      // Traversing the symlink must be refused even though the link itself
      // lives inside the jail (lexical check passes; realpath does not).
      await expect(
        service.resolveSafe('home', 'escape/secret.txt'),
      ).rejects.toThrow(/traversal/i);
      await expect(service.list('home', 'escape')).rejects.toThrow(
        /traversal/i,
      );
      await expect(
        service.readFile('home', 'escape/secret.txt'),
      ).rejects.toThrow(/traversal/i);
    });

    it('refuses writing THROUGH a symlinked directory to escape the jail', async () => {
      await fs.symlink(outside, join(jail, 'link'), 'dir');
      // Target file does not exist yet — parent (the symlink) resolves out.
      await expect(
        service.createFile('home', 'link/planted.txt', 'nope'),
      ).rejects.toThrow(/traversal/i);
    });

    it('allows legitimate nested paths inside the jail', async () => {
      const { abs } = await service.resolveSafe('home', 'a/b/c.txt');
      expect(abs).toBe(join(jail, 'a/b/c.txt'));
    });

    it('refuses a mid-segment ../ that climbs out (a/../../etc)', async () => {
      await expect(
        service.resolveSafe('home', 'a/b/../../../etc/passwd'),
      ).rejects.toThrow(/traversal/i);
    });

    it('normalises an in-jail mid-segment ../ without escaping', async () => {
      // a/b/../c collapses to a/c — still inside the jail, so allowed.
      const { abs } = await service.resolveSafe('home', 'a/b/../c.txt');
      expect(abs).toBe(join(jail, 'a/c.txt'));
    });

    it('treats backslashes as literal filename chars on POSIX (no escape)', async () => {
      // On Linux `\` is NOT a path separator, so "..\..\etc" is a single
      // weird-but-contained segment, never a traversal. It must resolve inside
      // the jail rather than climb out.
      const { abs } = await service.resolveSafe('home', '..\\..\\etc');
      expect(abs.startsWith(jail)).toBe(true);
    });

    it('strips a leading backslash run so it cannot re-root', async () => {
      const { abs } = await service.resolveSafe('home', '\\\\etc\\passwd');
      expect(abs.startsWith(jail)).toBe(true);
    });
  });
});
