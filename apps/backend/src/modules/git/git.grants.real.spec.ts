import * as fs from 'fs/promises';
import * as os from 'os';
import { join } from 'path';

// Same stand-in as git.service.spec.ts: REAL git runs via execFile; only the ESM
// module Jest cannot parse is swapped out. Nothing under test is simulated.
jest.mock('execa', () => {
  const { execFile } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:child_process') as typeof import('node:child_process');
  return {
    __esModule: true,
    execa: (
      file: string,
      args: string[],
      opts: {
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        maxBuffer?: number;
        timeout?: number;
        input?: string;
      } = {},
    ) =>
      new Promise((resolve) => {
        const child = execFile(
          file,
          args,
          {
            cwd: opts.cwd,
            env: { ...process.env, ...(opts.env ?? {}) },
            maxBuffer: opts.maxBuffer,
            timeout: opts.timeout,
            encoding: 'utf8',
          },
          (
            err: (Error & { code?: number | string }) | null,
            stdout: string,
            stderr: string,
          ) => {
            resolve({
              stdout: stdout ?? '',
              stderr: stderr ?? '',
              exitCode:
                err && typeof err.code === 'number' ? err.code : err ? 1 : 0,
            });
          },
        );
        // execa's `input` option, reproduced: the patch reaches git on stdin.
        if (opts.input !== undefined) child.stdin?.end(opts.input);
      }),
  };
});

import { GitService } from './git.service';
import { FilesService } from '../files/files.service';
import { FILE_NOT_GRANTED, FileAccess } from '../files/file-access';
import { FileGrants } from '../app-identity/file-grants.service';
import { ModeStore } from '../app-identity/mode-store.service';
import type { AppIdentity } from '../app-identity/app-identity.types';
import { DbService } from '../../db/db.service';

function testDb(): DbService {
  const db = new DbService({
    get: () => ':memory:',
  } as unknown as ConstructorParameters<typeof DbService>[0]);
  db.onModuleInit();
  return db;
}

/** Git GUI as an installed app: not in group `system`, so it reaches only what it was given. */
const gitGui: AppIdentity = {
  appId: 'git-gui',
  instanceId: 'w1',
  windowId: 'w1',
  groups: ['git-gui'],
};

/** A repo opened as an app: it reaches a work tree it was given, whole. */
describe('git as an app, against a real repository', () => {
  let service: GitService;
  let grants: FileGrants;
  let jail: string;
  const prevEnv = process.env.FILES_ROOT;

  beforeEach(async () => {
    jail = await fs.mkdtemp(join(os.tmpdir(), 'imb-git-grants-'));
    process.env.FILES_ROOT = jail;
    const db = testDb();
    const modes = new ModeStore(db);
    grants = new FileGrants(db, modes);
    service = new GitService(new FilesService(new FileAccess(modes, grants)));
    const repo = join(jail, 'repo');
    await fs.mkdir(join(repo, 'src'), { recursive: true });
    await service.exec(repo, ['init', '-q', '-b', 'main']);
  }, 30000);

  afterEach(async () => {
    process.env.FILES_ROOT = prevEnv;
    await fs.rm(jail, { recursive: true, force: true });
  });

  it('is refused a repo it was not given, by name', async () => {
    await expect(
      service.as(gitGui).status('home', 'repo'),
    ).rejects.toMatchObject({
      response: { code: FILE_NOT_GRANTED },
    });
    // The user opens any repo in the jail.
    await expect(service.as(null).status('home', 'repo')).resolves.toEqual({
      entries: [],
    });
  });

  it('opens a repo whose folder was picked, from anywhere inside it', async () => {
    grants.grant(gitGui, join(jail, 'repo'), 'folder');
    await expect(service.as(gitGui).status('home', 'repo')).resolves.toEqual({
      entries: [],
    });
    await expect(
      service.as(gitGui).status('home', 'repo/src'),
    ).resolves.toEqual({ entries: [] });
    // Another window of the app holds nothing.
    await expect(
      service.as({ ...gitGui, instanceId: 'w2' }).status('home', 'repo'),
    ).rejects.toMatchObject({ response: { code: FILE_NOT_GRANTED } });
  });

  it('a folder picked inside a repo does not open the repo around it', async () => {
    grants.grant(gitGui, join(jail, 'repo/src'), 'folder');
    await expect(
      service.as(gitGui).status('home', 'repo/src'),
    ).rejects.toMatchObject({ response: { code: FILE_NOT_GRANTED } });
  });
});
