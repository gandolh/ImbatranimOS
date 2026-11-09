import type { InstalledRow } from './marketplace.service';
import { deriveAppId } from './source-url';
import { readNativeUrlRow, retiredUrlApp } from './url-app-record';

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

/** A row as the retired prebuilt install wrote it. */
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

describe('retiredUrlApp', () => {
  it('reads the name and the source of a leftover prebuilt app', () => {
    expect(retiredUrlApp(row())).toEqual({ name: 'Hollow', source });
  });

  it('falls back to the id, and to no source, when the row no longer reads', () => {
    expect(
      retiredUrlApp(row({ manifest: '{not json', source: 'null' })),
    ).toEqual({ name: ID, source: null });
    expect(
      retiredUrlApp(row({ manifest: JSON.stringify({ name: '  ' }) })).name,
    ).toBe(ID);
  });

  it('drops a source that derives another id', () => {
    expect(
      retiredUrlApp(row({ source: JSON.stringify({ ...source, subdir: 'x' }) }))
        .source,
    ).toBeNull();
  });

  it('keeps a long name to what a manifest could hold', () => {
    const name = 'n'.repeat(500);
    expect(
      retiredUrlApp(row({ manifest: JSON.stringify({ name }) })).name,
    ).toHaveLength(60);
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
