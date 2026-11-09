import type { InstalledRow } from './marketplace.service';
import { deriveAppId } from './source-url';
import { readNativeUrlRow, readUrlAppRow } from './url-app-record';

const APPS = '/home/u/.imbatranim/apps';
const REPO = 'https://github.com/o/r';
const COMMIT = 'c'.repeat(40);
const SUBDIR = 'games/hollow';
const ID = deriveAppId(REPO, SUBDIR);

const manifest = {
  schemaVersion: 1,
  name: 'Hollow',
  description: '',
  meta: [],
  entry: 'dist/hollow.mjs',
  window: { defaultSize: { w: 960, h: 640 }, minSize: { w: 640, h: 400 } },
  capabilities: ['notify'],
  icon: 'gamepad-2',
  minSystemVersion: 2,
};

const source = {
  url: `${REPO}/tree/main/${SUBDIR}`,
  repo: REPO,
  ref: 'main',
  commit: COMMIT,
  subdir: SUBDIR,
};

/** A row as `MarketplaceUrlApps.install` writes it. */
function row(extra: Partial<Record<keyof InstalledRow, unknown>> = {}) {
  return {
    id: ID,
    ref: COMMIT,
    build_id: `${COMMIT.slice(0, 12)}-0123abcd`,
    root: SUBDIR,
    entry: 'dist/hollow.mjs',
    installed_at: 1,
    runtime: 'sandboxed',
    source: JSON.stringify(source),
    manifest: JSON.stringify(manifest),
    ...extra,
  } as InstalledRow;
}

const damaged = (r: InstalledRow) => {
  const read = readUrlAppRow(r, APPS);
  return read.ok ? null : read.damaged;
};

describe('readUrlAppRow', () => {
  it('reads back a row as install writes it', () => {
    expect(readUrlAppRow(row(), APPS)).toEqual({ ok: true, manifest, source });
  });

  it('reads back an app at the top of its repository, on the default branch', () => {
    const top = { ...source, url: REPO, ref: null, subdir: null };
    const r = row({
      id: deriveAppId(REPO, null),
      root: '',
      source: JSON.stringify(top),
    });
    expect(readUrlAppRow(r, APPS)).toEqual({ ok: true, manifest, source: top });
  });

  it.each([
    ['null', 'null'],
    ['not JSON', '{'],
    ['an empty object', '{}'],
    ['a number', 5],
    ['missing', null],
    ['an unknown key', JSON.stringify({ ...manifest, build: ['sh'] })],
    [
      'a refused capability',
      JSON.stringify({ ...manifest, capabilities: ['fs'] }),
    ],
    [
      'a window past the caps',
      JSON.stringify({
        ...manifest,
        window: {
          defaultSize: { w: 4000, h: 4000 },
          minSize: { w: 640, h: 400 },
        },
      }),
    ],
  ])('finds the manifest damaged when it is %s', (_label, value) => {
    expect(damaged(row({ manifest: value }))).toBe('manifest');
  });

  it.each([
    ['null', 'null'],
    ['not JSON', 'nope'],
    ['missing a commit', JSON.stringify({ ...source, commit: undefined })],
    ['a short commit', JSON.stringify({ ...source, commit: 'c'.repeat(12) })],
    ['an unknown key', JSON.stringify({ ...source, extra: 1 })],
    ['a climbing subdir', JSON.stringify({ ...source, subdir: '../x' })],
    ['an absolute subdir', JSON.stringify({ ...source, subdir: '/etc' })],
    // Another repository's source: the id would not be the one it derives.
    [
      'another repository',
      JSON.stringify({ ...source, repo: 'https://github.com/evil/r' }),
    ],
  ])('finds the source damaged when it is %s', (_label, value) => {
    expect(damaged(row({ source: value }))).toBe('source');
  });

  it('finds the id damaged when it is not a URL app', () => {
    expect(damaged(row({ id: 'demo' }))).toBe('id');
    expect(damaged(row({ runtime: 'native' }))).toBe('id');
  });

  it('finds the commit damaged when the row and its source disagree', () => {
    expect(damaged(row({ ref: 'd'.repeat(40) }))).toBe('commit');
  });

  it.each([
    ['a climb', '../../../../etc'],
    ['a slash', 'cccccccccccc-0123abcd/x'],
    ['another commit', `${'d'.repeat(12)}-0123abcd`],
    ['too short', 'cccccccccccc-0123'],
    ['a number', 7],
    ['null', null],
  ])('finds the build id damaged when it is %s', (_label, value) => {
    expect(damaged(row({ build_id: value }))).toBe('build id');
  });

  it.each([
    ['a climb', '../x.mjs'],
    ['absolute', '/etc/passwd'],
    ['another file than the manifest names', 'dist/other.mjs'],
    ['a dotfile', 'dist/.hollow.mjs'],
    ['not a module', 'dist/hollow.html'],
    ['null', null],
  ])('finds the entry damaged when it is %s', (_label, value) => {
    expect(damaged(row({ entry: value }))).toBe('entry');
  });

  it.each([
    ['a climb', '../../..'],
    ['absolute', '/'],
    ['another folder than the source names', 'games'],
    ['the top, when the source names a folder', ''],
    ['null', null],
  ])('finds the folder damaged when it is %s', (_label, value) => {
    expect(damaged(row({ root: value }))).toBe('folder');
  });
});

describe('readNativeUrlRow', () => {
  const native = {
    schemaVersion: 2,
    name: 'Hollow',
    type: 'static',
    build: { command: ['npm', 'run', 'build'], entry: 'dist/hollow.mjs' },
    capabilities: ['fs'],
    minSystemVersion: 2,
  };
  const trust = { by: 'owner', at: 5 };
  /** A row as a native URL app's build writes it. */
  const nativeRow = (
    extra: Partial<Record<keyof InstalledRow, unknown>> = {},
  ) =>
    row({
      runtime: 'native',
      source: JSON.stringify({ ...source, trust }),
      manifest: JSON.stringify(native),
      ...extra,
    });
  const options = { allowLocalRepos: false };
  const nativeDamage = (r: InstalledRow) => {
    const read = readNativeUrlRow(r, options);
    return read.ok ? null : read.damaged;
  };

  it('reads the descriptor, the source and the trust record back', () => {
    const read = readNativeUrlRow(nativeRow(), options);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.source).toEqual(source);
    expect(read.trust).toEqual(trust);
    expect(read.descriptor.id).toBe(ID);
    expect(read.descriptor.apps[0]).toMatchObject({
      id: ID,
      capabilities: ['fs'],
    });
  });

  it.each<[string, Partial<Record<keyof InstalledRow, unknown>>]>([
    ['id', { runtime: 'sandboxed' }],
    ['source', { source: JSON.stringify(source) }],
    [
      'source',
      { source: JSON.stringify({ ...source, trust: { by: 'anyone', at: 1 } }) },
    ],
    [
      'source',
      { source: JSON.stringify({ ...source, subdir: 'games', trust }) },
    ],
    ['commit', { ref: 'd'.repeat(40) }],
    ['build id', { build_id: 'nope' }],
    ['folder', { root: '' }],
    ['manifest', { manifest: 'null' }],
    [
      'manifest',
      { manifest: JSON.stringify({ ...native, capabilities: ['root'] }) },
    ],
    ['manifest', { manifest: JSON.stringify(manifest) }],
  ])('names a damaged %s', (what, extra) => {
    expect(nativeDamage(nativeRow(extra))).toBe(what);
  });
});
