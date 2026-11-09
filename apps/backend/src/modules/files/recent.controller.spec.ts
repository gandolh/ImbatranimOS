import * as fs from 'fs/promises';
import * as os from 'os';
import { join } from 'path';
import { ForbiddenException } from '@nestjs/common';

import type { DbService } from '../../db/db.service';
import { makeTestDb } from '../identity/testing';
import type { AppIdentity } from '../app-identity/app-identity.types';
import type { ModeOp } from '../app-identity/mode-store.service';
import type { FilesService } from './files.service';
import { RecentController } from './recent.controller';
import { RecentService } from './recent.service';

const app: AppIdentity = {
  appId: 'git-gui',
  instanceId: 'w1',
  windowId: 'w1',
  groups: ['git-gui'],
};

describe('RecentController, recording a folder', () => {
  let home: string;
  let db: DbService;
  let recent: RecentService;

  beforeEach(async () => {
    home = await fs.mkdtemp(join(os.tmpdir(), 'imb-recent-'));
    await fs.mkdir(join(home, 'repo'));
    db = makeTestDb();
    recent = new RecentService(db);
  });
  afterEach(async () => {
    db.onModuleDestroy();
    await fs.rm(home, { recursive: true, force: true });
  });

  /** A files service whose app may do `allowed` to anything. */
  function controller(allowed: ModeOp[]): RecentController {
    const files = {
      resolveSafe: (_root: string, path: string) =>
        Promise.resolve({
          rootDir: home,
          abs: join(home, path),
          key: join(home, path),
        }),
      check: (_who: unknown, op: ModeOp, _root: string, path: string) =>
        allowed.includes(op)
          ? Promise.resolve({
              rootDir: home,
              abs: join(home, path),
              key: join(home, path),
            })
          : Promise.reject(new ForbiddenException(`no ${op}`)),
      can: (_who: unknown, op: ModeOp) =>
        allowed.includes(op) ? 'grant' : null,
    } as unknown as FilesService;
    return new RecentController(recent, files);
  }

  const body = { root: 'home', path: 'repo', appId: 'git-gui' };

  it('is refused to an app that may read and list the folder but not write in it', async () => {
    await expect(
      controller(['read', 'list']).record(app, body),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(recent.list()).toEqual([]);
  });

  it('is recorded as a folder for an app that holds it whole', async () => {
    await controller(['read', 'list', 'write']).record(app, body);
    expect(recent.ownRecent('home', 'repo', 'git-gui')).toEqual({
      writable: true,
      kind: 'folder',
    });
  });
});
