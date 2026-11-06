import type { DbService } from '../../db/db.service';
import { makeTestDb } from '../identity/testing';
import type { AppIdentity } from './app-identity.types';
import {
  ancestorsOf,
  ModeStore,
  modeKey,
  MODE_REFUSED,
} from './mode-store.service';
import { IMPLIED_DIRECTORY, IMPLIED_FILE } from './modes';

function app(appId: string, install: string): AppIdentity {
  return {
    appId,
    instanceId: `${appId}-1`,
    windowId: null,
    groups: [appId, install],
  };
}

const HOME = '/home/imbatranim';
const DATA = `${HOME}/.local/share/imbatranim`;

const docs = app('office-docs', 'imbatranim-office');
const sheets = app('office-sheets', 'imbatranim-office');
const hollow = app('hollow', 'hollow');
const notepad = app('notepad', 'system');

describe('ModeStore', () => {
  let dbs: DbService;
  let store: ModeStore;

  beforeEach(() => {
    dbs = makeTestDb();
    store = new ModeStore(dbs);
  });

  afterEach(() => dbs.onModuleDestroy());

  it('keys paths absolute and normalised', () => {
    expect(modeKey('/a//b/./c/')).toBe('/a/b/c');
    expect(modeKey('/')).toBe('/');
    expect(() => modeKey('a/b')).toThrow(/absolute/);
    expect(() => modeKey('/a\0b')).toThrow(/absolute/);
    expect(ancestorsOf('/a/b/c')).toEqual(['/', '/a', '/a/b']);
    expect(ancestorsOf('/')).toEqual([]);
  });

  it('a path with no row is the user’s', () => {
    expect(store.stat(`${HOME}/notes.txt`)).toBeNull();
    expect(store.effective(`${HOME}/notes.txt`, 'file')).toEqual(IMPLIED_FILE);
    expect(store.effective(HOME, 'directory')).toEqual(IMPLIED_DIRECTORY);
  });

  it('the user (no token) reads, writes and lists everything', () => {
    store.create(hollow, `${DATA}/hollow`, 'directory');
    store.create(hollow, `${DATA}/hollow/save.json`, 'file');
    store.chmod(`${DATA}/hollow`, 'directory', 0);
    for (const op of ['read', 'write', 'delete', 'chmod'] as const) {
      expect(store.may(null, op, `${DATA}/hollow/save.json`)).toBe(true);
    }
    expect(store.may(null, 'list', `${DATA}/hollow`)).toBe(true);
  });

  it('an app reaches its own private folder through the user’s, and nothing else', () => {
    store.create(null, `${DATA}/hollow`, 'directory');
    store.chown(`${DATA}/hollow`, 'directory', 'hollow', 'hollow');
    store.chmod(`${DATA}/hollow`, 'directory', 0o700);
    expect(store.create(hollow, `${DATA}/hollow/save.json`, 'file')).toEqual({
      owner: 'hollow',
      group: 'hollow',
      mode: 0o600,
    });

    expect(store.may(hollow, 'read', `${DATA}/hollow/save.json`)).toBe(true);
    expect(store.may(hollow, 'write', `${DATA}/hollow/save.json`)).toBe(true);
    expect(store.may(hollow, 'list', `${DATA}/hollow`)).toBe(true);
    expect(store.may(hollow, 'create', `${DATA}/hollow/new.json`)).toBe(true);
    // The user's folders on the way: through, but not into.
    expect(store.may(hollow, 'traverse', HOME)).toBe(true);
    expect(store.may(hollow, 'list', HOME)).toBe(false);
    expect(store.may(hollow, 'read', `${HOME}/diary.txt`)).toBe(false);
    expect(store.may(hollow, 'create', `${HOME}/dropped.txt`)).toBe(false);
  });

  it('owner, group and others each read and write per mode', () => {
    const file = `${DATA}/plan.txt`;
    store.create(docs, file, 'file', 0o640);
    store.chown(file, 'file', 'office-docs', 'imbatranim-office');

    expect(store.may(docs, 'read', file)).toBe(true);
    expect(store.may(docs, 'write', file)).toBe(true);
    expect(store.may(sheets, 'read', file)).toBe(true);
    expect(store.may(sheets, 'write', file)).toBe(false);
    expect(store.may(hollow, 'read', file)).toBe(false);
    expect(store.may(hollow, 'write', file)).toBe(false);

    store.chmod(file, 'file', 0o606);
    expect(store.may(sheets, 'read', file)).toBe(false);
    expect(store.may(hollow, 'read', file)).toBe(true);
    expect(store.may(hollow, 'write', file)).toBe(true);
  });

  it('a folder without execute stops everything below it', () => {
    store.create(docs, `${DATA}/locked`, 'directory', 0o766);
    store.create(docs, `${DATA}/locked/a.txt`, 'file', 0o666);
    expect(store.may(docs, 'read', `${DATA}/locked/a.txt`)).toBe(true);
    expect(store.may(sheets, 'read', `${DATA}/locked/a.txt`)).toBe(false);
    expect(store.may(sheets, 'list', `${DATA}/locked`)).toBe(false);
  });

  it('a setgid folder passes its group on to what is made in it', () => {
    const suite = `${DATA}/imbatranim-office`;
    store.set(suite, {
      owner: null,
      group: 'imbatranim-office',
      mode: 0o2770,
    });
    const made = store.create(docs, `${suite}/shared.json`, 'file', 0o660);
    expect(made.group).toBe('imbatranim-office');
    expect(store.may(sheets, 'read', `${suite}/shared.json`)).toBe(true);
    expect(store.may(sheets, 'write', `${suite}/shared.json`)).toBe(true);
    expect(store.may(hollow, 'read', `${suite}/shared.json`)).toBe(false);
    expect(store.may(hollow, 'list', suite)).toBe(false);

    const sub = store.create(sheets, `${suite}/drafts`, 'directory', 0o770);
    expect(sub).toEqual({
      owner: 'office-sheets',
      group: 'imbatranim-office',
      mode: 0o2770,
    });
    expect(store.create(docs, `${suite}/drafts/one.json`, 'file').group).toBe(
      'imbatranim-office',
    );
  });

  it('built-in apps keep their reach into the user’s files, not into an app’s private data', () => {
    expect(store.may(notepad, 'read', `${HOME}/todo.txt`)).toBe(true);
    expect(store.may(notepad, 'write', `${HOME}/todo.txt`)).toBe(true);
    expect(store.may(notepad, 'list', HOME)).toBe(true);
    expect(store.may(null, 'read', `${HOME}/todo.txt`)).toBe(true);
    store.create(hollow, `${DATA}/hollow`, 'directory');
    expect(store.may(notepad, 'list', `${DATA}/hollow`)).toBe(false);
    expect(store.may(hollow, 'list', `${DATA}/hollow`)).toBe(true);
  });

  it('a folder in group system admits the built-ins, not an installed app', () => {
    store.set(`${HOME}/Shared`, { owner: null, group: 'system', mode: 0o770 });
    expect(store.may(notepad, 'list', `${HOME}/Shared`)).toBe(true);
    expect(store.may(hollow, 'list', `${HOME}/Shared`)).toBe(false);
  });

  it('in a sticky folder only the entry’s owner deletes it', () => {
    store.set(`${DATA}/drop`, { owner: null, group: 'system', mode: 0o1777 });
    store.create(docs, `${DATA}/drop/a.txt`, 'file', 0o666);
    expect(store.may(sheets, 'delete', `${DATA}/drop/a.txt`)).toBe(false);
    expect(store.may(docs, 'delete', `${DATA}/drop/a.txt`)).toBe(true);
    store.chmod(`${DATA}/drop`, 'directory', 0o777);
    expect(store.may(sheets, 'delete', `${DATA}/drop/a.txt`)).toBe(true);
  });

  it('only the owner may change a mode', () => {
    store.create(docs, `${DATA}/mine.txt`, 'file');
    expect(store.may(docs, 'chmod', `${DATA}/mine.txt`)).toBe(true);
    expect(store.may(sheets, 'chmod', `${DATA}/mine.txt`)).toBe(false);
    expect(store.may(notepad, 'chmod', `${HOME}/todo.txt`)).toBe(false);
  });

  it('assert refuses with a 403 a client can tell apart', () => {
    store.create(docs, `${DATA}/mine.txt`, 'file');
    let thrown: unknown;
    try {
      store.assert(hollow, 'read', `${DATA}/mine.txt`);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({
      status: 403,
      response: { code: MODE_REFUSED },
    });
    expect(() => store.assert(docs, 'read', `${DATA}/mine.txt`)).not.toThrow();
  });

  it('forgets a path and everything under it, and nothing beside it', () => {
    store.create(docs, `${DATA}/a`, 'directory');
    store.create(docs, `${DATA}/a/b.txt`, 'file');
    store.create(docs, `${DATA}/ab`, 'directory');
    store.remove(`${DATA}/a`);
    expect(store.stat(`${DATA}/a`)).toBeNull();
    expect(store.stat(`${DATA}/a/b.txt`)).toBeNull();
    expect(store.stat(`${DATA}/ab`)).not.toBeNull();
  });

  it('moves a path’s rows with it, replacing what the destination had', () => {
    store.create(docs, `${DATA}/old`, 'directory');
    store.create(docs, `${DATA}/old/x.txt`, 'file', 0o640);
    store.create(sheets, `${DATA}/new`, 'directory');
    store.create(sheets, `${DATA}/new/stale.txt`, 'file');
    store.create(docs, `${DATA}/older`, 'directory');

    store.move(`${DATA}/old`, `${DATA}/new`);
    expect(store.stat(`${DATA}/old`)).toBeNull();
    expect(store.stat(`${DATA}/new`)?.owner).toBe('office-docs');
    expect(store.stat(`${DATA}/new/x.txt`)?.mode).toBe(0o640);
    expect(store.stat(`${DATA}/new/stale.txt`)).toBeNull();
    expect(store.stat(`${DATA}/older`)).not.toBeNull();
    expect(() => store.move(`${DATA}/new`, `${DATA}/new/inner`)).toThrow(
      /inside itself/,
    );
  });

  it('the user making something outside a setgid folder leaves no row', () => {
    store.create(docs, `${HOME}/report.txt`, 'file');
    expect(store.create(null, `${HOME}/report.txt`, 'file')).toEqual(
      IMPLIED_FILE,
    );
    expect(store.stat(`${HOME}/report.txt`)).toBeNull();
  });
});
