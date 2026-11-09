import {
  BadRequestException,
  InternalServerErrorException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';
import { gzipSync } from 'zlib';
import * as fs from 'fs/promises';
import * as os from 'os';
import { join } from 'path';
import { FilesService } from '../files/files.service';
import {
  ArchiveService,
  loneOutputName,
  numberedName,
} from './archive.service';

const execFileAsync = promisify(execFile);

/** Compress `data` with the host's own `xz` or `bzip2` CLI. */
function compressWith(tool: 'xz' | 'bzip2', data: Buffer): Buffer {
  const run = spawnSync(tool, ['-c'], { input: data });
  if (run.status !== 0)
    throw new Error(`${tool} failed: ${run.stderr.toString()}`);
  return run.stdout;
}

const COMPRESS: Record<'gz' | 'xz' | 'bz2', (data: Buffer) => Buffer> = {
  gz: (data) => gzipSync(data),
  xz: (data) => compressWith('xz', data),
  bz2: (data) => compressWith('bzip2', data),
};

/**
 * One compressed file that is not a tarball (`notes.txt.gz`): it unpacks to
 * one file beside itself, named without the suffix, numbered on a clash, and
 * the compressed file stays. Real files, real zlib, and the host's real
 * `xzcat`/`bzcat` (the image's are busybox applets that read the same way).
 */
describe('ArchiveService — a lone compressed file', () => {
  let files: FilesService;
  let service: ArchiveService;
  let jail: string;
  let outside: string;
  const prevRoot = process.env.FILES_ROOT;
  const prevCap = process.env.ARCHIVE_MAX_TOTAL_BYTES;

  beforeEach(async () => {
    jail = await fs.mkdtemp(join(os.tmpdir(), 'imb-lone-jail-'));
    outside = await fs.mkdtemp(join(os.tmpdir(), 'imb-lone-out-'));
    process.env.FILES_ROOT = jail;
    files = new FilesService();
    service = new ArchiveService(files);
    await fs.mkdir(join(jail, 'docs'));
  });

  afterEach(async () => {
    process.env.FILES_ROOT = prevRoot;
    if (prevCap === undefined) delete process.env.ARCHIVE_MAX_TOTAL_BYTES;
    else process.env.ARCHIVE_MAX_TOTAL_BYTES = prevCap;
    await fs.rm(jail, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  const text = Buffer.from('line one\nline two\n'.repeat(50));
  const docs = () => fs.readdir(join(jail, 'docs')).then((n) => n.sort());

  describe.each(['gz', 'xz', 'bz2'] as const)('a .%s file', (kind) => {
    it('unpacks next to itself without the suffix, and stays', async () => {
      const packed = COMPRESS[kind](text);
      await fs.writeFile(join(jail, `docs/notes.txt.${kind}`), packed);

      const res = await service.extract('home', `docs/notes.txt.${kind}`);

      expect(res).toEqual({
        dest: 'docs/notes.txt',
        entries: 1,
        totalBytes: text.length,
      });
      expect(await fs.readFile(join(jail, 'docs/notes.txt'))).toEqual(text);
      expect(await fs.readFile(join(jail, `docs/notes.txt.${kind}`))).toEqual(
        packed,
      );
      // Nothing else: no staging file left behind.
      expect(await docs()).toEqual(['notes.txt', `notes.txt.${kind}`]);
    });

    it('takes a number when the name is taken, and leaves the taken file alone', async () => {
      await fs.writeFile(
        join(jail, `docs/notes.txt.${kind}`),
        COMPRESS[kind](text),
      );
      await fs.writeFile(join(jail, 'docs/notes.txt'), 'mine');

      const first = await service.extract('home', `docs/notes.txt.${kind}`);
      const second = await service.extract('home', `docs/notes.txt.${kind}`);

      expect(first.dest).toBe('docs/notes (2).txt');
      expect(second.dest).toBe('docs/notes (3).txt');
      expect(await fs.readFile(join(jail, 'docs/notes.txt'), 'utf8')).toBe(
        'mine',
      );
      expect(await fs.readFile(join(jail, 'docs/notes (3).txt'))).toEqual(text);
    });

    it('refuses past the size cap and leaves nothing behind', async () => {
      process.env.ARCHIVE_MAX_TOTAL_BYTES = '4096';
      // A few hundred bytes that expand to 1 MiB: a small bomb.
      await fs.writeFile(
        join(jail, `docs/zeros.${kind}`),
        COMPRESS[kind](Buffer.alloc(1024 * 1024)),
      );

      await expect(
        service.extract('home', `docs/zeros.${kind}`),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(await docs()).toEqual([`zeros.${kind}`]);
    });

    it('refuses a damaged file and leaves nothing behind', async () => {
      const packed = COMPRESS[kind](Buffer.from(text.toString().repeat(20)));
      // The header survives (so it is still recognised); the rest is cut.
      await fs.writeFile(
        join(jail, `docs/cut.txt.${kind}`),
        packed.subarray(0, Math.floor(packed.length / 2)),
      );

      await expect(
        service.extract('home', `docs/cut.txt.${kind}`),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await docs()).toEqual([`cut.txt.${kind}`]);
    });
  });

  it('reads the format from the content, not the suffix', async () => {
    // xz bytes under a .gz name still unpack (with xzcat).
    await fs.writeFile(join(jail, 'docs/odd.txt.gz'), COMPRESS.xz(text));
    const res = await service.extract('home', 'docs/odd.txt.gz');
    expect(res.dest).toBe('docs/odd.txt');
    expect(await fs.readFile(join(jail, 'docs/odd.txt'))).toEqual(text);
  });

  it('refuses a file whose content is not compressed, writing nothing', async () => {
    await fs.writeFile(join(jail, 'docs/fake.gz'), 'plain text, not gzip');
    await expect(service.extract('home', 'docs/fake.gz')).rejects.toThrow(
      /not a gzip, xz or bzip2 file/,
    );
    expect(await docs()).toEqual(['fake.gz']);
  });

  it('a .gz holding a tar still extracts as a tarball, into a folder', async () => {
    await fs.mkdir(join(jail, 'src'));
    await fs.writeFile(join(jail, 'src/a.txt'), 'alpha');
    await execFileAsync('tar', [
      '-czf',
      join(jail, 'docs/bundle.gz'),
      '-C',
      jail,
      'src',
    ]);

    const res = await service.extract('home', 'docs/bundle.gz');

    expect(res.dest).toBe('docs/bundle');
    expect(await fs.readFile(join(jail, 'docs/bundle/src/a.txt'), 'utf8')).toBe(
      'alpha',
    );
  });

  it('a .tar.gz is still a tarball', async () => {
    await fs.mkdir(join(jail, 'src'));
    await fs.writeFile(join(jail, 'src/a.txt'), 'alpha');
    await execFileAsync('tar', [
      '-czf',
      join(jail, 'docs/bundle.tar.gz'),
      '-C',
      jail,
      'src',
    ]);

    const res = await service.extract('home', 'docs/bundle.tar.gz');

    expect(res.dest).toBe('docs/bundle');
    expect(await fs.readFile(join(jail, 'docs/bundle/src/a.txt'), 'utf8')).toBe(
      'alpha',
    );
  });

  it('unpacks into a chosen folder', async () => {
    await fs.writeFile(join(jail, 'docs/notes.txt.gz'), COMPRESS.gz(text));
    await fs.mkdir(join(jail, 'elsewhere'));

    const res = await service.extract('home', 'docs/notes.txt.gz', 'elsewhere');

    expect(res.dest).toBe('elsewhere/notes.txt');
    expect(await fs.readFile(join(jail, 'elsewhere/notes.txt'))).toEqual(text);
  });

  it('does not write through a symlink at the name: it takes the next number', async () => {
    await fs.writeFile(join(jail, 'docs/notes.txt.gz'), COMPRESS.gz(text));
    // A dangling link pointing out of the jail, sitting on the output name.
    await fs.symlink(join(outside, 'planted'), join(jail, 'docs/notes.txt'));

    const res = await service.extract('home', 'docs/notes.txt.gz');

    expect(res.dest).toBe('docs/notes (2).txt');
    await expect(fs.stat(join(outside, 'planted'))).rejects.toThrow();
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it('refuses a folder outside the jail, or one that is a link out of it', async () => {
    await fs.writeFile(join(jail, 'docs/notes.txt.gz'), COMPRESS.gz(text));
    await fs.symlink(outside, join(jail, 'out-link'));

    await expect(
      service.extract('home', 'docs/notes.txt.gz', '../escape'),
    ).rejects.toThrow(/traversal/i);
    await expect(
      service.extract('home', 'docs/notes.txt.gz', 'out-link'),
    ).rejects.toThrow(/traversal/i);
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it('refuses entries it does not have', async () => {
    await fs.writeFile(join(jail, 'docs/notes.txt.gz'), COMPRESS.gz(text));
    await expect(
      service.extract('home', 'docs/notes.txt.gz', undefined, ['../x']),
    ).rejects.toThrow(/does not contain an entry named \.\.\/x/);
    // Its one entry, by the listed name, is fine.
    const res = await service.extract('home', 'docs/notes.txt.gz', undefined, [
      'notes.txt',
    ]);
    expect(res.dest).toBe('docs/notes.txt');
  });

  it('lists as one file named without the suffix', async () => {
    const packed = COMPRESS.bz2(text);
    await fs.writeFile(join(jail, 'docs/notes.txt.bz2'), packed);

    const listing = await service.list('home', 'docs/notes.txt.bz2');

    expect(listing.format).toBe('bz2');
    expect(listing.entries).toEqual([
      expect.objectContaining({
        name: 'notes.txt',
        compressedSize: packed.length,
        directory: false,
      }),
    ]);
    expect(await docs()).toEqual(['notes.txt.bz2']);
  });

  it('says so when the decompressor is missing, instead of crashing', async () => {
    class NoXz extends ArchiveService {
      protected decompressorCommand(): string {
        return 'imbatranim-no-such-xzcat';
      }
    }
    await fs.writeFile(join(jail, 'docs/notes.txt.xz'), COMPRESS.xz(text));

    const err = await new NoXz(files)
      .extract('home', 'docs/notes.txt.xz')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InternalServerErrorException);
    expect((err as Error).message).toMatch(
      /imbatranim-no-such-xzcat is not available/,
    );
    expect(await docs()).toEqual(['notes.txt.xz']);
  });

  it('still refuses an unknown format, and leaves no folder for it', async () => {
    await fs.writeFile(join(jail, 'docs/thing.rar'), 'x');
    await expect(service.extract('home', 'docs/thing.rar')).rejects.toThrow(
      /Unsupported archive format/,
    );
    expect(await docs()).toEqual(['thing.rar']);
  });

  it('runs as a job, like any extraction', async () => {
    await fs.writeFile(join(jail, 'docs/notes.txt.gz'), COMPRESS.gz(text));
    const { id } = service.startExtractJob('home', 'docs/notes.txt.gz');
    for (let i = 0; i < 100 && service.getJob(id).state === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(service.getJob(id)).toMatchObject({
      state: 'done',
      result: { dest: 'docs/notes.txt', entries: 1 },
    });
  });
});

describe('naming a lone compressed file’s output', () => {
  it.each([
    ['notes.txt.gz', 'notes.txt'],
    ['NOTES.TXT.XZ', 'NOTES.TXT'],
    ['data.bz2', 'data'],
    ['.bashrc.gz', '.bashrc'],
    ['.gz', null],
  ])('%s → %s', (archive, out) => {
    expect(loneOutputName(archive)).toBe(out);
  });

  it.each([
    ['notes.txt', 2, 'notes (2).txt'],
    ['archive.tar', 3, 'archive (3).tar'],
    ['data', 2, 'data (2)'],
    ['.bashrc', 2, '.bashrc (2)'],
    ['notes.txt', 1, 'notes.txt'],
  ])('%s, number %d → %s', (name, n, out) => {
    expect(numberedName(name, n)).toBe(out);
  });
});
