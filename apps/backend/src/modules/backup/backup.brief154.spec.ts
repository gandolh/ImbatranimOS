import { execFile } from 'child_process';
import { randomBytes } from 'crypto';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { FilesService } from '../files/files.service';
import { ArchiveService } from '../archive/archive.service';
import { DbService } from '../../db/db.service';
import { LogService } from '../logs/log.service';
import { LocalIdentityService } from '../local-identity/local-identity.service';
import { BackupService } from './backup.service';

const execFileAsync = promisify(execFile);

/**
 * Brief 154 — a restore whose database cannot be installed puts everything
 * back. Before it, a backup carrying a corrupt `db.sqlite` swapped the home
 * tree in, failed to open the database (a 500, not brief 110's 503), and
 * deleted the moved-aside pre-restore copy on the way out.
 */
describe('BackupService — a restore that cannot install its database (brief 154)', () => {
  let home: string;
  let outside: string;
  let db: DbService;
  let service: BackupService;
  const prevRoot = process.env.FILES_ROOT;
  const dbPath = () => join(home, '.imbatranim', 'db.sqlite');

  beforeEach(async () => {
    home = await fs.mkdtemp(join(os.tmpdir(), 'imb-b154-home-'));
    outside = await fs.mkdtemp(join(os.tmpdir(), 'imb-b154-out-'));
    process.env.FILES_ROOT = home;
    await fs.mkdir(join(home, '.imbatranim'), { recursive: true });
    await fs.mkdir(join(home, 'Documents'), { recursive: true });
    await fs.writeFile(join(home, 'Documents', 'letter.txt'), 'dear world');

    const config = {
      get: (key: string) => (key === 'DB_PATH' ? dbPath() : 24),
    } as unknown as ConfigService<never, true>;
    db = new DbService(config);
    db.onModuleInit();
    const files = new FilesService();
    const logs = new LogService();
    await logs.onModuleInit();
    service = new BackupService(
      files,
      new ArchiveService(files),
      db,
      logs,
      new LocalIdentityService(db),
    );
  });

  afterEach(async () => {
    process.env.FILES_ROOT = prevRoot;
    try {
      db.db.close();
    } catch {
      /* already closed */
    }
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  const takeBackup = async (): Promise<string> => {
    const stream = await service.openBackupStream();
    const chunks: Buffer[] = [];
    stream.stream.on('data', (c: Buffer) => chunks.push(c));
    await stream.done;
    await stream.dispose();
    const dest = join(outside, 'backup.tar.gz');
    await fs.writeFile(dest, Buffer.concat(chunks));
    return dest;
  };

  /** Rewrite the backup's database snapshot with `mutate`, and re-pack it. */
  const tamper = async (
    tarball: string,
    mutate: (snapshotPath: string) => Promise<void>,
  ): Promise<string> => {
    const dir = join(outside, 'unpacked');
    await fs.mkdir(dir, { recursive: true });
    await execFileAsync('tar', ['-xzf', tarball, '-C', dir]);
    await mutate(join(dir, '.imbatranim', 'backup-staging', 'db.sqlite'));
    const out = join(outside, 'tampered.tar.gz');
    await execFileAsync('tar', ['-czf', out, '-C', dir, '.']);
    return out;
  };

  /** Every file under the home, with its contents: "nothing changed" made checkable. */
  const snapshotHome = async (): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    const walk = async (abs: string, rel: string) => {
      for (const d of await fs.readdir(abs, { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${d.name}` : d.name;
        // The live database is compared through queries; its bytes move with WAL.
        if (childRel.startsWith('.imbatranim/db.sqlite')) continue;
        if (childRel.startsWith('.imbatranim/logs')) continue;
        if (d.isDirectory()) await walk(join(abs, d.name), childRel);
        else out[childRel] = await fs.readFile(join(abs, d.name), 'utf-8');
      }
    };
    await walk(home, '');
    return out;
  };

  const todoTexts = () =>
    (
      db.db.prepare('SELECT text FROM todos ORDER BY id').all() as {
        text: string;
      }[]
    ).map((r) => r.text);

  /** A backup, then work done after it that a failed restore must not lose. */
  const backupThenWork = async () => {
    db.db.prepare("INSERT INTO todos (text) VALUES ('in the backup')").run();
    const tarball = await takeBackup();
    db.db.prepare("INSERT INTO todos (text) VALUES ('after the backup')").run();
    await fs.writeFile(join(home, 'Documents', 'letter.txt'), 'edited since');
    await fs.writeFile(join(home, 'Documents', 'new.txt'), 'created since');
    return tarball;
  };

  it('refuses a backup whose database is random bytes, with nothing moved', async () => {
    const tarball = await tamper(await backupThenWork(), (p) =>
      fs.writeFile(p, randomBytes(64 * 1024)),
    );
    const before = await snapshotHome();

    const preview = await service.inspect(tarball);
    await expect(service.apply(preview.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(await snapshotHome()).toEqual(before);
    expect(todoTexts()).toEqual(['in the backup', 'after the backup']);
    expect(db.migrationFailure).toBeNull();
  });

  it('refuses a database from a newer build than this one', async () => {
    const tarball = await tamper(await backupThenWork(), (p) => {
      const snap = new Database(p);
      snap.pragma('user_version = 999');
      snap.close();
      return Promise.resolve();
    });
    const preview = await service.inspect(tarball);
    await expect(service.apply(preview.id)).rejects.toThrow(/newer/);
    expect(todoTexts()).toEqual(['in the backup', 'after the backup']);
  });

  it('puts the home tree and the database back when installing the database fails', async () => {
    const tarball = await backupThenWork();
    const before = await snapshotHome();
    jest.spyOn(db, 'replaceWith').mockImplementationOnce(() => {
      throw new Error('injected: the snapshot would not open');
    });

    const preview = await service.inspect(tarball);
    await expect(service.apply(preview.id)).rejects.toThrow('injected');

    expect(await snapshotHome()).toEqual(before);
    expect(
      await fs.readFile(join(home, 'Documents', 'letter.txt'), 'utf-8'),
    ).toBe('edited since');
    expect(todoTexts()).toEqual(['in the backup', 'after the backup']);
    const leftovers = (await fs.readdir(home)).filter(
      (n) =>
        n.startsWith('.imbatranim-restore-') ||
        n.startsWith('.imbatranim-rollback-'),
    );
    expect(leftovers).toEqual([]);
  });
});
