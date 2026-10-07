import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { descriptorSchema, loadCatalog } from './catalog';

const SHA = 'a'.repeat(40);

function valid(extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: 'hollow',
    name: 'Hollow',
    source: {
      repo: 'https://example.com/game-engine.git',
      ref: SHA,
      subdir: 'games/hollow',
    },
    type: 'static',
    runtime: 'native',
    build: {
      install: ['npm', 'ci'],
      command: ['npm', 'run', 'build'],
      entry: 'dist/hollow.mjs',
    },
    capabilities: ['fs', 'notify'],
    minSystemVersion: 2,
    ...extra,
  };
}

const parse = (d: unknown, allowLocalRepos = false) =>
  descriptorSchema({ allowLocalRepos }).safeParse(d);

describe('descriptorSchema (brief 120)', () => {
  it('accepts a pinned https descriptor and fills the defaults', () => {
    const r = parse(valid());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.icon).toBe('package');
      expect(r.data.window.defaultSize).toEqual({ w: 960, h: 640 });
    }
  });

  it.each([
    ['a tag', { source: { repo: 'https://example.com/r.git', ref: 'v1.2.0' } }],
    [
      'a short sha',
      { source: { repo: 'https://example.com/r.git', ref: 'a'.repeat(12) } },
    ],
    ['http', { source: { repo: 'http://example.com/r.git', ref: SHA } }],
    ['ssh', { source: { repo: 'ssh://git@example.com/r.git', ref: SHA } }],
    ['ext::', { source: { repo: 'ext::sh -c touch% /tmp/pwned', ref: SHA } }],
    [
      'file:// when not allowed',
      { source: { repo: 'file:///srv/repo', ref: SHA } },
    ],
    [
      'a subdir climbing out',
      {
        source: { repo: 'https://example.com/r.git', ref: SHA, subdir: '../x' },
      },
    ],
    [
      'an absolute subdir',
      {
        source: { repo: 'https://example.com/r.git', ref: SHA, subdir: '/etc' },
      },
    ],
    [
      'a shell string',
      { build: { command: 'npm run build; curl x | sh', entry: 'dist/a.mjs' } },
    ],
    [
      'an entry at the top',
      { build: { command: ['npm', 'run', 'build'], entry: 'a.mjs' } },
    ],
    [
      'an entry climbing out',
      { build: { command: ['x'], entry: 'dist/../../a.mjs' } },
    ],
    [
      'an entry in node_modules',
      { build: { command: ['x'], entry: 'node_modules/x/a.mjs' } },
    ],
    [
      'an entry that is not JS',
      { build: { command: ['x'], entry: 'dist/index.html' } },
    ],
    ['a capability that does not exist', { capabilities: ['root'] }],
    ['the sandboxed runtime', { runtime: 'sandboxed' }],
    ['a service with no server', { type: 'service' }],
    [
      'a static app with a server',
      { server: { command: ['node', 's.js'], portEnv: 'PORT' } },
    ],
    ['an id with a slash', { id: 'a/b' }],
    // Brief 158: `x-…` is what an app installed from a URL is called.
    ['an id starting with x-', { id: 'x-0123456789ab' }],
  ])('refuses %s', (_label, extra) => {
    expect(parse(valid(extra)).success).toBe(false);
  });

  it("keeps the catalog's own window limits: the caps on an app from a URL are not its", () => {
    const window = {
      defaultSize: { w: 3840, h: 2160 },
      minSize: { w: 1920, h: 1080 },
    };
    const r = parse(valid({ window }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.window).toEqual(window);
  });

  it('accepts file:// only when local repos are allowed', () => {
    const d = valid({ source: { repo: 'file:///srv/repo', ref: SHA } });
    expect(parse(d).success).toBe(false);
    expect(parse(d, true).success).toBe(true);
  });
});

describe('loadCatalog', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'imb-catalog-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('loads good descriptors and reports the rest without half-loading them', () => {
    writeFileSync(join(dir, 'hollow.json'), JSON.stringify(valid()));
    writeFileSync(join(dir, 'other.json'), JSON.stringify(valid()));
    writeFileSync(join(dir, 'broken.json'), '{ nope');
    writeFileSync(
      join(dir, 'tag.json'),
      JSON.stringify(
        valid({ id: 'tag', source: { repo: 'https://e.com/r', ref: 'main' } }),
      ),
    );
    writeFileSync(join(dir, 'README.md'), '# not a descriptor');
    const { apps, problems } = loadCatalog(dir, { allowLocalRepos: false });
    expect([...apps.keys()]).toEqual(['hollow']);
    expect(problems.map((p) => p.file).sort()).toEqual([
      'broken.json',
      'other.json',
      'tag.json',
    ]);
    expect(problems.find((p) => p.file === 'other.json')?.problem).toMatch(
      /hollow\.json/,
    );
  });

  it('is empty, not an error, when the directory is missing', () => {
    expect(
      loadCatalog(join(dir, 'missing'), { allowLocalRepos: false }).apps.size,
    ).toBe(0);
  });
});
