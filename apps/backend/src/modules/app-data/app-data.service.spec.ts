import { ConflictException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import { join } from 'path';

import type { DbService } from '../../db/db.service';
import { makeTestDb } from '../identity/testing';
import type { AppIdentity } from '../app-identity/app-identity.types';
import type { InstalledApps } from '../app-identity/installed-apps';
import { ModeStore } from '../app-identity/mode-store.service';
import { AppDataService, dataVersion } from './app-data.service';
import { DATA_KINDS, normaliseDataPath } from './app-data.paths';

function app(appId: string, install: string): AppIdentity {
  return {
    appId,
    instanceId: `${appId}-1`,
    windowId: null,
    groups: [appId, install],
  };
}

const hollow = app('hollow', 'hollow');
const other = app('other', 'other');
const notepad = app('notepad', 'system');

/** The status and body of a Nest HTTP exception, for the refusals. */
async function refusal(work: Promise<unknown>) {
  try {
    await work;
  } catch (err) {
    const e = err as { getStatus?: () => number; getResponse?: () => unknown };
    if (!e.getStatus) throw err;
    return {
      status: e.getStatus(),
      body: e.getResponse?.() as Record<string, unknown>,
    };
  }
  throw new Error('expected a refusal');
}

describe('AppDataService', () => {
  let home: string;
  let outside: string;
  let dbs: DbService;
  let modes: ModeStore;
  let data: AppDataService;
  /** The apps the stand-in for the catalog check calls gone. */
  let gone: Set<string>;
  const prevRoot = process.env.FILES_ROOT;

  beforeEach(async () => {
    home = await fs.mkdtemp(join(os.tmpdir(), 'imb-data-home-'));
    outside = await fs.mkdtemp(join(os.tmpdir(), 'imb-data-out-'));
    process.env.FILES_ROOT = home;
    dbs = makeTestDb();
    modes = new ModeStore(dbs);
    gone = new Set();
    const installed = {
      isGone: (id: string) => gone.has(id),
    } as unknown as InstalledApps;
    data = new AppDataService(modes, installed);
  });

  afterEach(async () => {
    process.env.FILES_ROOT = prevRoot;
    dbs.onModuleDestroy();
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  const shared = (rest = '') =>
    join(home, '.local', 'share', 'imbatranim', 'hollow', rest);

  describe('kinds', () => {
    it('puts each kind in its XDG place, under imbatranim/<app-id>', async () => {
      for (const kind of DATA_KINDS) {
        await data.write(hollow, kind, 'k.json', kind);
      }
      const at = (dir: string) =>
        fs.readFile(join(home, dir, 'imbatranim', 'hollow', 'k.json'), 'utf8');
      expect(await at('.config')).toBe('config');
      expect(await at('.local/share')).toBe('data');
      expect(await at('.local/state')).toBe('state');
      expect(await at('.cache')).toBe('cache');
    });

    it('keeps one kind apart from another', async () => {
      await data.write(hollow, 'config', 'same.json', 'settings');
      expect(await data.read(hollow, 'data', 'same.json')).toBeNull();
      expect((await data.read(hollow, 'config', 'same.json'))?.content).toBe(
        'settings',
      );
    });
  });

  describe('the folder and its modes', () => {
    it('makes the folder on the first write, owned by the app and private', async () => {
      expect(await data.read(hollow, 'data', 'a.json')).toBeNull();
      await expect(fs.stat(shared())).rejects.toThrow();

      await data.write(hollow, 'data', 'saves/one.json', '{}');
      expect(modes.stat(shared())).toEqual({
        owner: 'hollow',
        group: 'hollow',
        mode: 0o700,
      });
      expect(modes.stat(shared('saves'))).toEqual({
        owner: 'hollow',
        group: 'hollow',
        mode: 0o700,
      });
      expect(modes.stat(shared('saves/one.json'))).toEqual({
        owner: 'hollow',
        group: 'hollow',
        mode: 0o600,
      });
      // `imbatranim/` above stays the user's.
      expect(modes.stat(join(home, '.local/share/imbatranim'))).toBeNull();
    });

    it('takes a folder that has no mode row yet as the app’s', async () => {
      await fs.mkdir(shared(), { recursive: true });
      expect(await data.list(hollow, 'data')).toEqual([]);
      expect(modes.stat(shared())?.owner).toBe('hollow');
    });

    it('keeps a mode the owner set on the folder', async () => {
      await data.write(hollow, 'data', 'a.json', '1');
      modes.chmod(shared(), 'directory', 0o500);
      const res = await refusal(data.write(hollow, 'data', 'b.json', '2'));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MODE_REFUSED');
      expect(modes.stat(shared())?.mode).toBe(0o500);
    });

    it('refuses a write to a file the owner made read-only', async () => {
      const { version } = await data.write(hollow, 'data', 'a.json', '1');
      modes.chmod(shared('a.json'), 'file', 0o400);
      const res = await refusal(
        data.write(hollow, 'data', 'a.json', '2', version),
      );
      expect(res.status).toBe(403);
      expect(await fs.readFile(shared('a.json'), 'utf8')).toBe('1');
    });

    it('a file the user put there is the user’s: an installed app may not read it', async () => {
      await data.write(hollow, 'data', 'a.json', '1');
      await fs.writeFile(shared('dropped.txt'), 'from the Terminal');
      await expect(data.read(hollow, 'data', 'dropped.txt')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('scoping', () => {
    it.each(['../other/x.json', 'a/../../x.json', '..', 'a\\b', 'a\0b'])(
      'refuses %j',
      async (path) => {
        const res = await refusal(data.write(hollow, 'data', path, 'x'));
        expect(res.status).toBe(400);
      },
    );

    it('reads a leading slash as inside the folder', async () => {
      const { path } = await data.write(hollow, 'data', '/top.json', 'x');
      expect(path).toBe('top.json');
      expect(await fs.readFile(shared('top.json'), 'utf8')).toBe('x');
    });

    it('names the folder from the identity, so one app never reaches another’s', async () => {
      await data.write(other, 'data', 'secret.json', 'other’s');
      expect(await data.read(hollow, 'data', 'secret.json')).toBeNull();
      await refusal(data.read(hollow, 'data', '../other/secret.json'));
      expect(await data.list(hollow, 'data')).toEqual([]);
    });

    it('refuses an id that is no app’s', async () => {
      const bad = { ...hollow, appId: '../evil' };
      await expect(data.write(bad, 'data', 'a', 'x')).rejects.toThrow(
        /Not an app id/,
      );
      const system = { ...hollow, appId: 'system' };
      await expect(data.write(system, 'data', 'a', 'x')).rejects.toThrow(
        /Not an app id/,
      );
    });

    it('refuses a link inside the folder that leads out', async () => {
      await fs.writeFile(join(outside, 'passwd'), 'root:x:0:0');
      await data.write(hollow, 'data', 'a.json', '1');
      await fs.symlink(join(outside, 'passwd'), shared('link'));
      await fs.symlink(outside, shared('dir-link'));

      expect((await refusal(data.read(hollow, 'data', 'link'))).status).toBe(
        400,
      );
      expect(
        (await refusal(data.write(hollow, 'data', 'link', 'owned'))).status,
      ).toBe(400);
      expect(
        (await refusal(data.write(hollow, 'data', 'dir-link/new.json', 'x')))
          .status,
      ).toBe(400);
      expect(
        (await refusal(data.list(hollow, 'data', 'dir-link'))).status,
      ).toBe(400);
      expect(await fs.readFile(join(outside, 'passwd'), 'utf8')).toBe(
        'root:x:0:0',
      );
      await expect(fs.stat(join(outside, 'new.json'))).rejects.toThrow();
    });

    it('removes a link as the link, never what it points at', async () => {
      await fs.writeFile(join(outside, 'keep.txt'), 'keep');
      await data.write(hollow, 'data', 'a.json', '1');
      await fs.symlink(join(outside, 'keep.txt'), shared('link'));
      expect(await data.remove(hollow, 'data', 'link')).toBe(true);
      expect(await fs.readFile(join(outside, 'keep.txt'), 'utf8')).toBe('keep');
    });

    it('refuses a folder that is itself a link', async () => {
      // Pointing hollow's folder at another app's would hand it that app's files.
      await data.write(other, 'data', 'secret.json', 'other’s');
      await fs.symlink(
        join(home, '.local/share/imbatranim/other'),
        shared().replace(/\/$/, ''),
      );
      expect(
        (await refusal(data.read(hollow, 'data', 'secret.json'))).status,
      ).toBe(400);
    });

    it('never lists links or staged copies', async () => {
      await data.write(hollow, 'data', 'b.json', '22');
      await data.write(hollow, 'data', 'a/c.json', '1');
      await fs.symlink(outside, shared('away'));
      await fs.writeFile(
        shared('.b.json.imbatranim-0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f.part'),
        'half',
      );
      const list = await data.list(hollow, 'data');
      expect(list.map((e) => [e.path, e.type, e.size])).toEqual([
        ['a', 'directory', 0],
        ['b.json', 'file', 2],
      ]);
      expect((await data.list(hollow, 'data', 'a')).map((e) => e.path)).toEqual(
        ['a/c.json'],
      );
    });

    it('clears a staged copy left over from an unfinished write, not a fresh one', async () => {
      await data.write(hollow, 'data', 'b.json', '1');
      const stale = shared(
        '.b.json.imbatranim-1f1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f.part',
      );
      const fresh = shared(
        '.b.json.imbatranim-2f2f2f2f-2f2f-2f2f-2f2f-2f2f2f2f2f2f.part',
      );
      await fs.writeFile(stale, 'half');
      await fs.writeFile(fresh, 'half');
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await fs.utimes(stale, twoHoursAgo, twoHoursAgo);
      expect((await data.list(hollow, 'data')).map((e) => e.path)).toEqual([
        'b.json',
      ]);
      await expect(fs.stat(stale)).rejects.toThrow();
      await expect(fs.stat(fresh)).resolves.toBeTruthy();
    });
  });

  describe('versions', () => {
    it('reads the version of what it wrote', async () => {
      const written = await data.write(hollow, 'data', 'a.json', '{"n":1}');
      const read = await data.read(hollow, 'data', 'a.json');
      expect(read).toEqual({
        path: 'a.json',
        content: '{"n":1}',
        version: written.version,
      });
      expect(written.version).toBe(dataVersion('{"n":1}'));
    });

    it('refuses a stale write with the current version, and writes nothing', async () => {
      const first = await data.write(hollow, 'data', 'a.json', '{"n":1}');
      const second = await data.write(
        hollow,
        'data',
        'a.json',
        '{"n":2}',
        first.version,
      );
      const res = await refusal(
        data.write(hollow, 'data', 'a.json', '{"n":3}', first.version),
      );
      expect(res.status).toBe(409);
      expect(res.body.current).toBe(second.version);
      expect(await fs.readFile(shared('a.json'), 'utf8')).toBe('{"n":2}');
    });

    it('a write expecting no file is refused once there is one', async () => {
      await data.write(hollow, 'data', 'a.json', 'first', null);
      const res = await refusal(
        data.write(hollow, 'data', 'a.json', 'second', null),
      );
      expect(res.status).toBe(409);
      expect(res.body.current).toBe(dataVersion('first'));
    });

    it('a write expecting a file that is gone is refused with current null', async () => {
      const { version } = await data.write(hollow, 'data', 'a.json', '1');
      await data.remove(hollow, 'data', 'a.json');
      const res = await refusal(
        data.write(hollow, 'data', 'a.json', '2', version),
      );
      expect(res.body.current).toBeNull();
    });

    it('catches two saves of the same length in one millisecond', async () => {
      const first = await data.write(hollow, 'data', 'a.json', '{"on":1}');
      await data.write(hollow, 'data', 'a.json', '{"on":0}', first.version);
      await expect(
        data.write(hollow, 'data', 'a.json', '{"on":2}', first.version),
      ).rejects.toThrow(ConflictException);
    });

    it('two writers from one version: one wins, the other is refused', async () => {
      const { version } = await data.write(hollow, 'data', 'a.json', 'v1');
      const results = await Promise.allSettled([
        data.write(hollow, 'data', 'a.json', 'tab one', version),
        data.write(hollow, 'data', 'a.json', 'tab two', version),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      const won = results.findIndex((r) => r.status === 'fulfilled');
      expect(await fs.readFile(shared('a.json'), 'utf8')).toBe(
        won === 0 ? 'tab one' : 'tab two',
      );
    });

    it('two fresh tabs creating one file: one creates, the other is refused', async () => {
      const results = await Promise.allSettled([
        data.write(hollow, 'data', 'a.json', 'one', null),
        data.write(hollow, 'data', 'a.json', 'two', null),
      ]);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    });

    it('a write without a version replaces whatever is there', async () => {
      await data.write(hollow, 'data', 'a.json', 'one');
      await data.write(hollow, 'data', 'a.json', 'two');
      expect((await data.read(hollow, 'data', 'a.json'))?.content).toBe('two');
    });
  });

  describe('remove', () => {
    it('removes a file or a folder, and their mode rows', async () => {
      await data.write(hollow, 'data', 'dir/a.json', '1');
      await data.write(hollow, 'data', 'b.json', '2');
      expect(await data.remove(hollow, 'data', 'dir')).toBe(true);
      expect(await data.remove(hollow, 'data', 'b.json')).toBe(true);
      expect(await data.list(hollow, 'data')).toEqual([]);
      expect(modes.stat(shared('dir/a.json'))).toBeNull();
      expect(modes.stat(shared('dir'))).toBeNull();
    });

    it('answers false for nothing there, and never removes the folder itself', async () => {
      expect(await data.remove(hollow, 'data', 'nothing.json')).toBe(false);
      expect((await refusal(data.remove(hollow, 'data', ''))).status).toBe(400);
      expect((await refusal(data.remove(hollow, 'data', '/'))).status).toBe(
        400,
      );
    });
  });

  describe('removeFolders', () => {
    beforeEach(async () => {
      for (const kind of DATA_KINDS) {
        await data.write(hollow, kind, 'f.json', kind);
        await data.write(other, kind, 'f.json', kind);
      }
    });

    it('takes only the caches when asked for the caches', async () => {
      await data.removeCaches(['hollow']);
      expect(await data.read(hollow, 'cache', 'f.json')).toBeNull();
      for (const kind of ['config', 'data', 'state'] as const) {
        expect((await data.read(hollow, kind, 'f.json'))?.content).toBe(kind);
      }
      expect((await data.read(other, 'cache', 'f.json'))?.content).toBe(
        'cache',
      );
    });

    it('takes every kind and its rows, and leaves other apps alone', async () => {
      await data.removeFolders(['hollow']);
      for (const kind of DATA_KINDS) {
        await expect(fs.stat(data.folder('hollow', kind))).rejects.toThrow();
        expect(modes.stat(data.folder('hollow', kind))).toBeNull();
        expect((await data.read(other, kind, 'f.json'))?.content).toBe(kind);
      }
      // A reinstall starts with folders of its own again.
      await data.write(hollow, 'data', 'f.json', 'again');
      expect(modes.stat(shared())?.owner).toBe('hollow');
    });

    it('refuses a write or a removal from an app that is gone, and makes no folder', async () => {
      await data.removeFolders(['hollow']);
      gone.add('hollow');
      expect(
        (await refusal(data.write(hollow, 'data', 'f.json', 'back'))).status,
      ).toBe(403);
      expect(
        (await refusal(data.remove(hollow, 'data', 'f.json'))).status,
      ).toBe(403);
      await expect(fs.stat(data.folder('hollow', 'data'))).rejects.toThrow();
      // Another app is not touched by it.
      expect((await data.write(other, 'data', 'g.json', 'x')).path).toBe(
        'g.json',
      );
    });

    it('makes a write that waited behind the removal find the app gone', async () => {
      // The uninstall marks the app leaving, then takes its folders; a write
      // from a window still open queues on the same folder and comes after.
      gone.add('hollow');
      const removal = data.removeFolders(['hollow']);
      const write = data.write(hollow, 'data', 'f.json', 'back');
      await removal;
      expect((await refusal(write)).status).toBe(403);
      for (const kind of DATA_KINDS) {
        await expect(fs.stat(data.folder('hollow', kind))).rejects.toThrow();
      }
    });

    it('removes a folder that is a link without following it', async () => {
      await fs.writeFile(join(outside, 'keep.txt'), 'keep');
      await data.removeFolders(['hollow']);
      await fs.mkdir(join(home, '.local/share/imbatranim'), {
        recursive: true,
      });
      await fs.symlink(outside, shared().replace(/\/$/, ''));
      await data.removeFolders(['hollow'], ['data']);
      expect(await fs.readFile(join(outside, 'keep.txt'), 'utf8')).toBe('keep');
    });
  });

  it('a built-in app gets folders too, in its own group', async () => {
    await data.write(notepad, 'state', 'recent.json', '[]');
    expect(
      modes.stat(join(home, '.local/state/imbatranim/notepad/recent.json')),
    ).toEqual({ owner: 'notepad', group: 'notepad', mode: 0o600 });
  });

  it('normalises paths without resolving them', () => {
    expect(normaliseDataPath('a//b/./c/')).toBe('a/b/c');
    expect(normaliseDataPath('', true)).toBe('');
    expect(() => normaliseDataPath('')).toThrow();
    expect(() => normaliseDataPath('x'.repeat(513))).toThrow();
    expect(() => normaliseDataPath(42)).toThrow();
  });

  it('refuses a name too long to stage beside, in bytes', () => {
    expect(normaliseDataPath('a'.repeat(200) + '/b')).toBe(
      'a'.repeat(200) + '/b',
    );
    expect(() => normaliseDataPath('a'.repeat(201))).toThrow(
      /at most 200 bytes/,
    );
    // 101 two-byte letters are 202 bytes, though only 101 characters.
    expect(() => normaliseDataPath('ș'.repeat(101))).toThrow(
      /at most 200 bytes/,
    );
  });
});
