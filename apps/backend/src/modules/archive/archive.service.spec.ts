import { zipSync, type Zippable } from 'fflate';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import { join } from 'path';
import { FilesService } from '../files/files.service';
import { ArchiveService } from './archive.service';

// Build tar fixtures with the real tar binary (no shell), matching the service.
const execFileAsync = promisify(execFile);
const tar = async (args: string[]): Promise<void> => {
  await execFileAsync('tar', args);
};

/**
 * These are the point of the module: a malicious archive must never write
 * outside the destination jail, and a zip-bomb must trip the caps. Everything
 * runs against the REAL filesystem (a scratch dir standing in for `home`) and
 * the REAL `tar` binary, so the tests exercise the actual jail, not a mock.
 */
describe('ArchiveService (zip-slip jail + resource caps)', () => {
  let files: FilesService;
  let service: ArchiveService;
  let jail: string;
  let outside: string;
  const prevEnv = process.env.FILES_ROOT;

  beforeEach(async () => {
    jail = await fs.mkdtemp(join(os.tmpdir(), 'imb-arch-jail-'));
    outside = await fs.mkdtemp(join(os.tmpdir(), 'imb-arch-out-'));
    process.env.FILES_ROOT = jail;
    files = new FilesService();
    service = new ArchiveService(files);
  });

  afterEach(async () => {
    process.env.FILES_ROOT = prevEnv;
    await fs.rm(jail, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  /** Write a zip built from a raw name→bytes map to `home/<rel>`. */
  async function writeZip(rel: string, tree: Zippable): Promise<void> {
    const bytes = zipSync(tree);
    await fs.mkdir(join(jail, 'archives'), { recursive: true });
    await fs.writeFile(join(jail, rel), Buffer.from(bytes));
  }

  const enc = (s: string) => new TextEncoder().encode(s);

  // ── happy paths ────────────────────────────────────────────────────────────

  it('round-trips a zip: compress a tree then extract it back', async () => {
    await fs.mkdir(join(jail, 'src/nested'), { recursive: true });
    await fs.writeFile(join(jail, 'src/a.txt'), 'alpha');
    await fs.writeFile(join(jail, 'src/nested/b.txt'), 'bravo');

    await service.compress('home', ['src'], 'out.zip', 'zip');
    expect(await fs.stat(join(jail, 'out.zip'))).toBeTruthy();

    const res = await service.extract('home', 'out.zip', 'unpacked');
    expect(res.entries).toBe(2);
    expect(await fs.readFile(join(jail, 'unpacked/src/a.txt'), 'utf-8')).toBe(
      'alpha',
    );
    expect(
      await fs.readFile(join(jail, 'unpacked/src/nested/b.txt'), 'utf-8'),
    ).toBe('bravo');
  });

  it('round-trips a tar.gz through the real tar binary', async () => {
    await fs.mkdir(join(jail, 'data'), { recursive: true });
    await fs.writeFile(join(jail, 'data/x.txt'), 'x-ray');
    await fs.writeFile(join(jail, 'data/y.txt'), 'yankee');

    await service.compress('home', ['data'], 'bundle.tar.gz', 'targz');
    const res = await service.extract('home', 'bundle.tar.gz', 'restored');
    expect(res.entries).toBeGreaterThanOrEqual(2);
    expect(await fs.readFile(join(jail, 'restored/data/x.txt'), 'utf-8')).toBe(
      'x-ray',
    );
    expect(await fs.readFile(join(jail, 'restored/data/y.txt'), 'utf-8')).toBe(
      'yankee',
    );
  });

  it('derives a sibling dest folder when none is given', async () => {
    await writeZip('archives/pack.zip', { 'hello.txt': enc('hi') });
    const res = await service.extract('home', 'archives/pack.zip');
    expect(res.dest).toBe('archives/pack');
    expect(
      await fs.readFile(join(jail, 'archives/pack/hello.txt'), 'utf-8'),
    ).toBe('hi');
  });

  // ── zip-slip: name-based traversal ───────────────────────────────────────────

  it('rejects a zip-slip entry (../../escape)', async () => {
    await writeZip('archives/evil.zip', {
      '../../escape.txt': enc('pwned'),
    });
    await expect(
      service.extract('home', 'archives/evil.zip', 'dest'),
    ).rejects.toThrow(/escape|traversal/i);
    // Nothing was written outside the jail.
    await expect(fs.stat(join(jail, '../escape.txt'))).rejects.toBeTruthy();
    await expect(fs.stat(join(outside, 'escape.txt'))).rejects.toBeTruthy();
  });

  it('rejects an absolute-path entry', async () => {
    await writeZip('archives/abs.zip', {
      '/etc/cron.d/pwn': enc('* * * * * root sh'),
    });
    await expect(
      service.extract('home', 'archives/abs.zip', 'dest'),
    ).rejects.toThrow(/absolute|escape|traversal/i);
  });

  it('rejects a mid-path ../ climb (a/b/../../../etc)', async () => {
    await writeZip('archives/mid.zip', {
      'a/b/../../../../etc/x': enc('nope'),
    });
    await expect(
      service.extract('home', 'archives/mid.zip', 'dest'),
    ).rejects.toThrow(/escape|traversal/i);
  });

  // ── zip-slip: symlink escape (tar can actually store links) ──────────────────

  it('rejects a tar symlink entry that escapes the destination', async () => {
    // Build a tar that contains a symlink pointing at the secret outside.
    await fs.writeFile(join(outside, 'secret.txt'), 'top secret');
    const staging = await fs.mkdtemp(join(os.tmpdir(), 'imb-arch-stg-'));
    // A symlink whose target is an absolute path outside the jail.
    await fs.symlink(join(outside, 'secret.txt'), join(staging, 'link'));
    await tar([
      '-czf',
      join(jail, 'archives-link.tar.gz'),
      '-C',
      staging,
      'link',
    ]);
    await fs.rm(staging, { recursive: true, force: true });

    await expect(
      service.extract('home', 'archives-link.tar.gz', 'dest'),
    ).rejects.toThrow(/symlink/i);
    // The escaping link never reached the real destination.
    await expect(fs.stat(join(jail, 'dest/link'))).rejects.toBeTruthy();
  });

  it('rejects a tar symlink-then-write escape (l -> /outside, l/evil)', async () => {
    const staging = await fs.mkdtemp(join(os.tmpdir(), 'imb-arch-stg2-'));
    await fs.symlink(outside, join(staging, 'l'));
    await tar([
      '-czf',
      join(jail, 'archives-linkdir.tar.gz'),
      '-C',
      staging,
      'l',
    ]);
    await fs.rm(staging, { recursive: true, force: true });

    await expect(
      service.extract('home', 'archives-linkdir.tar.gz', 'dest'),
    ).rejects.toThrow(/symlink/i);
    await expect(fs.stat(join(outside, 'evil'))).rejects.toBeTruthy();
  });

  // ── resource caps ────────────────────────────────────────────────────────────

  it('trips the entry-count cap', async () => {
    const prev = process.env.ARCHIVE_MAX_ENTRIES;
    process.env.ARCHIVE_MAX_ENTRIES = '5';
    try {
      const tree: Zippable = {};
      for (let i = 0; i < 20; i++) tree[`f${i}.txt`] = enc('x');
      await writeZip('archives/many.zip', tree);
      await expect(
        service.extract('home', 'archives/many.zip', 'dest'),
      ).rejects.toThrow(/too many entries/i);
    } finally {
      process.env.ARCHIVE_MAX_ENTRIES = prev;
    }
  });

  it('trips the total-size cap (zip-bomb guard)', async () => {
    const prev = process.env.ARCHIVE_MAX_TOTAL_BYTES;
    process.env.ARCHIVE_MAX_TOTAL_BYTES = '1024'; // 1 KiB
    try {
      // A single highly-compressible ~1 MiB entry — inflates past the cap.
      const big = new Uint8Array(1024 * 1024); // all zeros -> tiny compressed
      await writeZip('archives/bomb.zip', { 'big.bin': big });
      await expect(
        service.extract('home', 'archives/bomb.zip', 'dest'),
      ).rejects.toThrow(/size cap/i);
      // The oversized entry was NOT fully written.
      await expect(fs.stat(join(jail, 'dest/big.bin'))).rejects.toBeTruthy();
    } finally {
      process.env.ARCHIVE_MAX_TOTAL_BYTES = prev;
    }
  });

  it('trips the compression-ratio cap (forged/amplified declared size)', async () => {
    // Bound declared uncompressed size to <= ratio × the actual archive bytes,
    // so a tiny archive can't force a huge pre-allocation. With ratio 1, a
    // highly-compressible entry (large uncompressed, tiny compressed archive)
    // must be rejected up front by inspectZip before unzipSync allocates.
    const prev = process.env.ARCHIVE_MAX_RATIO;
    process.env.ARCHIVE_MAX_RATIO = '1';
    try {
      const compressible = enc('A'.repeat(100_000)); // ~100 KB → tiny compressed
      await writeZip('archives/amp.zip', { 'a.txt': compressible });
      await expect(
        service.extract('home', 'archives/amp.zip', 'dest'),
      ).rejects.toThrow(/size cap/i);
      await expect(fs.stat(join(jail, 'dest/a.txt'))).rejects.toBeTruthy();
    } finally {
      process.env.ARCHIVE_MAX_RATIO = prev;
    }
  });

  it('rejects an unsupported archive format', async () => {
    await fs.writeFile(join(jail, 'file.rar'), 'not really a rar');
    await expect(service.extract('home', 'file.rar', 'dest')).rejects.toThrow(
      /unsupported/i,
    );
  });

  it('compress refuses a source outside the jail', async () => {
    await expect(
      service.compress('home', ['../../etc/passwd'], 'out.zip', 'zip'),
    ).rejects.toThrow(/traversal/i);
  });
});
