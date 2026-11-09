import type { DbService } from '../../db/db.service';
import { makeTestDb } from '../identity/testing';
import type { AppIdentity } from './app-identity.types';
import {
  FileGrants,
  GRANT_MAX_AGE_MS,
  MAX_GRANTS_PER_INSTANCE,
  type GrantKind,
} from './file-grants.service';
import { ModeStore } from './mode-store.service';

function copy(appId: string, instanceId: string, install = appId): AppIdentity {
  return { appId, instanceId, windowId: instanceId, groups: [appId, install] };
}

const HOME = '/home/imbatranim';
const DATA = `${HOME}/.local/share/imbatranim`;

describe('FileGrants', () => {
  let dbs: DbService;
  let modes: ModeStore;
  let grants: FileGrants;

  beforeEach(() => {
    dbs = makeTestDb();
    modes = new ModeStore(dbs);
    grants = new FileGrants(dbs, modes);
  });

  afterEach(() => dbs.onModuleDestroy());

  const docs = copy('office-docs', 'w1', 'imbatranim-office');

  it('a file grant covers reading, writing and making that one path', () => {
    grants.grant(docs, `${HOME}/Documents/plan.docx`, 'file');
    const at = `${HOME}/Documents/plan.docx`;
    expect(grants.covers(docs, 'read', at)).toBe(true);
    expect(grants.covers(docs, 'write', at)).toBe(true);
    expect(grants.covers(docs, 'create', at)).toBe(true);
    expect(grants.covers(docs, 'delete', at)).toBe(false);
    expect(grants.covers(docs, 'chmod', at)).toBe(false);
    expect(grants.covers(docs, 'list', `${HOME}/Documents`)).toBe(false);
    expect(grants.covers(docs, 'read', `${HOME}/Documents/other.docx`)).toBe(
      false,
    );
    expect(grants.covers(docs, 'read', `${at}.bak`)).toBe(false);
  });

  it('holds for the window it was given to, and that app, only', () => {
    grants.grant(docs, `${HOME}/a.txt`, 'file');
    expect(
      grants.covers(copy('office-docs', 'w2'), 'read', `${HOME}/a.txt`),
    ).toBe(false);
    expect(grants.covers(copy('hollow', 'w1'), 'read', `${HOME}/a.txt`)).toBe(
      false,
    );
  });

  it('a folder grant covers what is under it, but not the folder’s own entry', () => {
    const music = `${HOME}/Music`;
    grants.grant(docs, music, 'folder');
    expect(grants.covers(docs, 'list', music)).toBe(true);
    expect(grants.covers(docs, 'traverse', music)).toBe(true);
    expect(grants.covers(docs, 'read', `${music}/a/b.mp3`)).toBe(true);
    expect(grants.covers(docs, 'create', `${music}/new.mp3`)).toBe(true);
    expect(grants.covers(docs, 'delete', `${music}/a`)).toBe(true);
    expect(grants.covers(docs, 'delete', music)).toBe(false);
    expect(grants.covers(docs, 'create', music)).toBe(false);
    expect(grants.covers(docs, 'chmod', `${music}/a`)).toBe(false);
    expect(grants.covers(docs, 'read', `${HOME}/Musical.txt`)).toBe(false);
    expect(grants.covers(docs, 'list', HOME)).toBe(false);
  });

  it('a picked folder stops at another app’s data folder; a file given by itself does not', () => {
    grants.grant(docs, HOME, 'folder');
    modes.create(copy('notes', 'n1'), `${DATA}/notes`, 'directory');
    modes.create(copy('notes', 'n1'), `${DATA}/notes/secret.txt`, 'file');
    expect(grants.covers(docs, 'list', DATA)).toBe(true);
    expect(grants.covers(docs, 'list', `${DATA}/notes`)).toBe(false);
    expect(grants.covers(docs, 'read', `${DATA}/notes/secret.txt`)).toBe(false);
    expect(grants.covers(docs, 'delete', `${DATA}/notes`)).toBe(false);

    // Its own folder is not another app's.
    modes.create(docs, `${DATA}/office-docs`, 'directory');
    expect(grants.covers(docs, 'list', `${DATA}/office-docs`)).toBe(true);

    grants.grant(docs, `${DATA}/notes/secret.txt`, 'file');
    expect(grants.covers(docs, 'read', `${DATA}/notes/secret.txt`)).toBe(true);
  });

  it('a listing grant lists the folder and reads the files directly in it, nothing more', () => {
    const music = `${HOME}/Music`;
    grants.grant(docs, music, 'listing');
    expect(grants.covers(docs, 'list', music)).toBe(true);
    expect(grants.covers(docs, 'traverse', music)).toBe(true);
    expect(grants.covers(docs, 'read', `${music}/b.mp3`)).toBe(true);
    expect(grants.covers(docs, 'read', `${music}/a/b.mp3`)).toBe(false);
    expect(grants.covers(docs, 'list', `${music}/a`)).toBe(false);
    expect(grants.covers(docs, 'write', `${music}/b.mp3`)).toBe(false);
    expect(grants.covers(docs, 'create', `${music}/new.mp3`)).toBe(false);
    expect(grants.covers(docs, 'delete', `${music}/b.mp3`)).toBe(false);
    expect(grants.covers(docs, 'read', music)).toBe(false);
    expect(grants.covers(docs, 'read', `${HOME}/Musical.txt`)).toBe(false);
  });

  it('a listing grant stops at another app’s file in the folder', () => {
    modes.create(copy('notes', 'n1'), `${DATA}/notes`, 'directory');
    modes.create(copy('notes', 'n1'), `${DATA}/notes/secret.txt`, 'file');
    grants.grant(docs, `${DATA}/notes`, 'listing');
    expect(grants.covers(docs, 'read', `${DATA}/notes/secret.txt`)).toBe(false);
  });

  it('a read grant reads that one file, and never narrows a file grant', () => {
    const at = `${HOME}/Documents/b.md`;
    grants.grant(docs, at, 'read');
    expect(grants.covers(docs, 'read', at)).toBe(true);
    expect(grants.covers(docs, 'write', at)).toBe(false);
    expect(grants.covers(docs, 'create', at)).toBe(false);
    grants.grant(docs, `${HOME}/a.md`, 'file');
    grants.grant(docs, `${HOME}/a.md`, 'read');
    expect(grants.covers(docs, 'write', `${HOME}/a.md`)).toBe(true);
  });

  it('a listing never narrows a folder already given', () => {
    grants.grant(docs, `${HOME}/Music`, 'folder');
    grants.grant(docs, `${HOME}/Music`, 'listing');
    expect(grants.held('w1', 'office-docs')).toEqual([
      expect.objectContaining({ kind: 'folder' }),
    ]);
    grants.grant(docs, `${HOME}/Pictures`, 'listing');
    grants.grant(docs, `${HOME}/Pictures`, 'folder');
    expect(
      grants.held('w1', 'office-docs').find((g) => g.path.endsWith('Pictures')),
    ).toEqual(expect.objectContaining({ kind: 'folder' }));
  });

  it('an assets grant makes, lists, reads and adds to its folder, never writes over or removes', () => {
    const assets = `${HOME}/Documents/assets`;
    grants.grant(docs, assets, 'assets');
    expect(grants.covers(docs, 'create', assets)).toBe(true);
    expect(grants.covers(docs, 'list', assets)).toBe(true);
    expect(grants.covers(docs, 'traverse', assets)).toBe(true);
    expect(grants.covers(docs, 'create', `${assets}/shot.png`)).toBe(true);
    expect(grants.covers(docs, 'read', `${assets}/shot.png`)).toBe(true);
    expect(grants.covers(docs, 'write', `${assets}/shot.png`)).toBe(false);
    expect(grants.covers(docs, 'delete', `${assets}/shot.png`)).toBe(false);
    expect(grants.covers(docs, 'chmod', `${assets}/shot.png`)).toBe(false);
    expect(grants.covers(docs, 'delete', assets)).toBe(false);
    expect(grants.covers(docs, 'write', assets)).toBe(false);
    expect(grants.covers(docs, 'read', assets)).toBe(false);
    // Nothing deeper, and nothing beside it.
    expect(grants.covers(docs, 'create', `${assets}/a/b.png`)).toBe(false);
    expect(grants.covers(docs, 'read', `${assets}/a/b.png`)).toBe(false);
    expect(grants.covers(docs, 'list', `${assets}/a`)).toBe(false);
    expect(grants.covers(docs, 'create', `${HOME}/Documents/b.png`)).toBe(
      false,
    );
    expect(grants.covers(docs, 'read', `${HOME}/Documents/b.md`)).toBe(false);
    expect(grants.covers(docs, 'create', `${HOME}/Documents/assets2`)).toBe(
      false,
    );
  });

  it('an assets grant stops at another app’s file in the folder', () => {
    const assets = `${HOME}/Documents/assets`;
    modes.create(copy('notes', 'n1'), `${assets}/secret.txt`, 'file');
    grants.grant(docs, assets, 'assets');
    expect(grants.covers(docs, 'read', `${assets}/secret.txt`)).toBe(false);
  });

  it('an assets grant never narrows a folder, and a listing never narrows it', () => {
    const assets = `${HOME}/Documents/assets`;
    grants.grant(docs, assets, 'folder');
    grants.grant(docs, assets, 'assets');
    expect(grants.held('w1', 'office-docs')).toEqual([
      expect.objectContaining({ kind: 'folder' }),
    ]);
    grants.revokeInstance('w1');
    grants.grant(docs, assets, 'assets');
    grants.grant(docs, assets, 'listing');
    expect(grants.held('w1', 'office-docs')).toEqual([
      expect.objectContaining({ kind: 'assets' }),
    ]);
    grants.grant(docs, assets, 'folder');
    expect(grants.held('w1', 'office-docs')).toEqual([
      expect.objectContaining({ kind: 'folder' }),
    ]);
  });

  it('says what an assets grant lets the copy make where', () => {
    const assets = `${HOME}/Documents/assets`;
    grants.grant(docs, assets, 'assets');
    expect(grants.addsAt(docs, assets)).toBe('folder');
    expect(grants.addsAt(docs, `${assets}/shot.png`)).toBe('file');
    expect(grants.addsAt(docs, `${assets}/a/b.png`)).toBeNull();
    expect(grants.addsAt(docs, `${HOME}/Documents/b.png`)).toBeNull();
    expect(grants.addsAt(copy('office-docs', 'w2'), assets)).toBeNull();
  });

  it('a kind this build doesn’t know gives nothing', () => {
    jest.spyOn(grants, 'held').mockReturnValue([
      {
        instanceId: 'w1',
        appId: 'office-docs',
        path: `${HOME}/Music`,
        kind: 'shared' as GrantKind,
        createdAt: 1,
      },
    ]);
    expect(grants.covers(docs, 'read', `${HOME}/Music/a.mp3`)).toBe(false);
    expect(grants.covers(docs, 'list', `${HOME}/Music`)).toBe(false);
  });

  it('ends with its window, and the same path given again replaces it', () => {
    grants.grant(docs, `${HOME}/a`, 'file');
    grants.grant(docs, `${HOME}/a`, 'folder');
    expect(grants.held('w1', 'office-docs')).toEqual([
      expect.objectContaining({ path: `${HOME}/a`, kind: 'folder' }),
    ]);
    grants.revokeInstance('w1');
    expect(grants.held('w1', 'office-docs')).toEqual([]);
    expect(grants.covers(docs, 'read', `${HOME}/a/b`)).toBe(false);
  });

  it('sweeps old grants and keeps the newest of a window past the cap', () => {
    grants.grant(copy('hollow', 'old'), `${HOME}/old`, 'file', 1);
    const now = 1 + GRANT_MAX_AGE_MS + 1;
    for (let i = 0; i <= MAX_GRANTS_PER_INSTANCE; i++) {
      grants.grant(docs, `${HOME}/f${i}`, 'file', now + i);
    }
    expect(grants.held('old', 'hollow')).toEqual([]);
    const held = grants.held('w1', 'office-docs');
    expect(held).toHaveLength(MAX_GRANTS_PER_INSTANCE);
    expect(held.some((g) => g.path === `${HOME}/f0`)).toBe(false);
    expect(
      held.some((g) => g.path === `${HOME}/f${MAX_GRANTS_PER_INSTANCE}`),
    ).toBe(true);
  });
});
