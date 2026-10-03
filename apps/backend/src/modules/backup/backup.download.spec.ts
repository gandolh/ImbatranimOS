import type { ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs/promises';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { FilesService } from '../files/files.service';
import { ArchiveService } from '../archive/archive.service';
import { DbService } from '../../db/db.service';
import { LogService } from '../logs/log.service';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';

/** Every child the service spawns, so the test can see tar's fate. */
const children: ChildProcess[] = [];
// Builtin exports cannot be spied on in Node 24; wrap `spawn` instead.
jest.mock('child_process', () => {
  const actual =
    jest.requireActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      const child = actual.spawn(...args);
      children.push(child);
      return child;
    },
  };
});

/**
 * Brief 142 — a download the client abandons must free the backup slot.
 *
 * Real HTTP, real `tar`, real SQLite. The home holds 8 MB of incompressible
 * bytes so tar is still writing when the client leaves: with `.pipe()` it then
 * blocked on a full pipe forever and every later backup answered 409.
 */
describe('BackupController.download — an interrupted download', () => {
  let home: string;
  let db: DbService;
  let service: BackupService;
  let server: http.Server;
  let port: number;
  const prevRoot = process.env.FILES_ROOT;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (
    check: () => boolean | Promise<boolean>,
    what: string,
  ) => {
    for (const end = Date.now() + 10_000; Date.now() < end; await sleep(50)) {
      if (await check()) return;
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const exists = (p: string) =>
    fs.access(p).then(
      () => true,
      () => false,
    );

  beforeEach(async () => {
    home = await fs.mkdtemp(join(os.tmpdir(), 'imb-b142-home-'));
    process.env.FILES_ROOT = home;
    await fs.mkdir(join(home, '.imbatranim'), { recursive: true });
    await fs.writeFile(join(home, 'big.bin'), randomBytes(8 * 1024 * 1024));

    const config = {
      get: (key: string) =>
        key === 'DB_PATH' ? join(home, '.imbatranim', 'db.sqlite') : 24,
    } as unknown as ConfigService<never, true>;
    db = new DbService(config);
    db.onModuleInit();
    const files = new FilesService();
    const logs = new LogService();
    await logs.onModuleInit();
    service = new BackupService(files, new ArchiveService(files), db, logs);
    const controller = new BackupController(service);

    children.length = 0;
    server = http.createServer((_req, res) => {
      controller.download(res as unknown as Response).catch((err: Error) => {
        res.statusCode = (err as { status?: number }).status ?? 500;
        res.end(err.message);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const child of children) child.kill('SIGKILL');
    await new Promise((r) => server.close(r));
    db.db.close();
    process.env.FILES_ROOT = prevRoot;
    await fs.rm(home, { recursive: true, force: true });
  });

  /** GET the backup and return its status and full body length. */
  const download = () =>
    new Promise<{ status: number; bytes: number }>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/`, (res) => {
          let bytes = 0;
          res.on('data', (chunk: Buffer) => (bytes += chunk.length));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, bytes }));
          res.on('error', reject);
        })
        .on('error', reject);
    });

  it('kills tar, frees the slot and removes the staging copy when the client leaves', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.once('data', () => {
          // The first chunk is in: the client goes away mid-download.
          req.destroy();
          resolve();
        });
      });
      req.on('error', () => undefined);
      req.setTimeout(10_000, () => reject(new Error('no first chunk')));
    });

    const tarChild = children.find((c) => c.spawnfile === 'tar');
    expect(tarChild).toBeDefined();
    await waitFor(
      () => tarChild!.exitCode !== null || tarChild!.signalCode !== null,
      'tar to exit',
    );
    await waitFor(
      async () => !(await exists(join(home, '.imbatranim', 'backup-staging'))),
      'the staging directory to be removed',
    );
    await waitFor(
      () => !(service as unknown as { backupInFlight: boolean }).backupInFlight,
      'the backup slot to be freed',
    );

    const second = await download();
    expect(second.status).toBe(200);
    expect(second.bytes).toBeGreaterThan(8 * 1024 * 1024);
  }, 30_000);
});
