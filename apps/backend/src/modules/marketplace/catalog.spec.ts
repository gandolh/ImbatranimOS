import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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
      expect(r.data.apps[0].icon).toBe('package');
      expect(r.data.apps[0].window.defaultSize).toEqual({ w: 960, h: 640 });
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
    if (r.success) expect(r.data.apps[0].window).toEqual(window);
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
    const { descriptors, problems } = loadCatalog(dir, {
      allowLocalRepos: false,
    });
    expect([...descriptors.keys()]).toEqual(['hollow']);
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
      loadCatalog(join(dir, 'missing'), { allowLocalRepos: false }).descriptors
        .size,
    ).toBe(0);
  });
});

describe('a version 1 descriptor is one app (brief 162)', () => {
  it('reads as a single app whose id is the descriptor id, served from its entry directory', () => {
    const r = parse(valid());
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.schemaVersion).toBe(1);
    expect(r.data.build).toEqual({
      install: ['npm', 'ci'],
      command: ['npm', 'run', 'build'],
      output: 'dist',
    });
    expect(r.data.apps).toEqual([
      {
        id: 'hollow',
        name: 'Hollow',
        description: '',
        meta: [],
        entry: 'hollow.mjs',
        window: {
          defaultSize: { w: 960, h: 640 },
          minSize: { w: 480, h: 320 },
        },
        icon: 'package',
        opens: [],
        multiInstance: false,
        capabilities: ['fs', 'notify'],
      },
    ]);
  });

  it('parses the committed marketplace/hollow.json to one app, unchanged', () => {
    const file = join(__dirname, '../../../../../marketplace/hollow.json');
    const raw = JSON.parse(readFileSync(file, 'utf8')) as {
      build: { entry: string };
    };
    const r = parse(raw);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.id).toBe('hollow');
    expect(r.data.apps).toHaveLength(1);
    const [app] = r.data.apps;
    expect(app.id).toBe('hollow');
    expect(app.icon).toBe('gamepad-2');
    expect(app.multiInstance).toBe(false);
    expect(app.opens).toEqual([]);
    expect(r.data.build.output).toBe('games/hollow/client/dist/os');
    expect(app.entry).toBe('hollow.mjs');
    // What the installed row records: exactly the descriptor's entry.
    expect(`${r.data.build.output}/${app.entry}`).toBe(raw.build.entry);
  });
});

/** A two-app suite, as contract A of brief 162 describes one. */
function suite(
  extra: Record<string, unknown> = {},
  apps?: Record<string, unknown>[],
) {
  return {
    schemaVersion: 2,
    id: 'office',
    name: 'Office',
    description: 'Documents and spreadsheets.',
    source: { repo: 'https://example.com/office.git', ref: SHA },
    type: 'static',
    runtime: 'native',
    build: {
      install: ['npm', 'ci'],
      command: ['npm', 'run', 'build:os'],
      output: 'dist/os',
    },
    apps: apps ?? [
      {
        id: 'office-docs',
        name: 'Docs',
        meta: ['office'],
        entry: 'docs/app.mjs',
        icon: 'file-text',
        opens: ['docx'],
        multiInstance: true,
        capabilities: ['fs', 'intents'],
      },
      {
        id: 'office-sheets',
        name: 'Sheets',
        entry: 'sheets/app.mjs',
        capabilities: [],
      },
    ],
    minSystemVersion: 2,
    ...extra,
  };
}

const app = (extra: Record<string, unknown> = {}) => ({
  id: 'office-docs',
  name: 'Docs',
  entry: 'docs/app.mjs',
  capabilities: [],
  ...extra,
});

describe('descriptorSchema version 2 (brief 162)', () => {
  it('accepts a suite and fills each app’s defaults', () => {
    const r = parse(suite());
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.schemaVersion).toBe(2);
    expect(r.data.build.output).toBe('dist/os');
    expect(r.data.apps.map((a) => a.id)).toEqual([
      'office-docs',
      'office-sheets',
    ]);
    const [docs, sheets] = r.data.apps;
    expect(docs.multiInstance).toBe(true);
    expect(docs.opens).toEqual(['docx']);
    expect(sheets).toEqual({
      id: 'office-sheets',
      name: 'Sheets',
      description: '',
      meta: [],
      entry: 'sheets/app.mjs',
      window: { defaultSize: { w: 960, h: 640 }, minSize: { w: 480, h: 320 } },
      icon: 'package',
      opens: [],
      multiInstance: false,
      capabilities: [],
    });
  });

  it('normalises the output and the entries', () => {
    const r = parse(
      suite({
        build: { command: ['x'], output: './dist/os/' },
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.build.output).toBe('dist/os');
    const e = parse(suite({}, [app({ entry: './docs//app.mjs' })]));
    expect(e.success).toBe(true);
    if (e.success) expect(e.data.apps[0].entry).toBe('docs/app.mjs');
  });

  it('accepts an entry at the top of the output, and a service suite with its one server', () => {
    expect(parse(suite({}, [app({ entry: 'app.mjs' })])).success).toBe(true);
    expect(
      parse(
        suite({
          type: 'service',
          server: { command: ['node', 's.js'], portEnv: 'PORT' },
        }),
      ).success,
    ).toBe(true);
  });

  it('accepts extensions with dots and whole names in opens', () => {
    expect(
      parse(suite({}, [app({ opens: ['tar.gz', 'makefile', 'c++', 'docx'] })]))
        .success,
    ).toBe(true);
  });

  it('lets an app carry its own descriptor’s id', () => {
    expect(parse(suite({}, [app({ id: 'office' })])).success).toBe(true);
  });

  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      app({ id: `office-a${i}`, entry: `a${i}/app.mjs` }),
    );

  it.each([
    ['no apps', suite({}, [])],
    ['seventeen apps', suite({}, many(17))],
    ['an output at the top', suite({ build: { command: ['x'], output: '.' } })],
    ['an empty output', suite({ build: { command: ['x'], output: '' } })],
    [
      'an output climbing out',
      suite({ build: { command: ['x'], output: '../dist' } }),
    ],
    [
      'an absolute output',
      suite({ build: { command: ['x'], output: '/srv/dist' } }),
    ],
    [
      'an output in node_modules',
      suite({ build: { command: ['x'], output: 'node_modules/x/dist' } }),
    ],
    [
      'an output under node_modules',
      suite({ build: { command: ['x'], output: 'dist/node_modules' } }),
    ],
    [
      'a v1 entry instead of an output',
      suite({ build: { command: ['x'], entry: 'dist/a.mjs' } }),
    ],
    ['an entry that is not JS', suite({}, [app({ entry: 'docs/index.html' })])],
    ['an entry climbing out', suite({}, [app({ entry: '../a.mjs' })])],
    [
      'an entry climbing out through the output',
      suite({}, [app({ entry: 'docs/../../a.mjs' })]),
    ],
    ['an absolute entry', suite({}, [app({ entry: '/a.mjs' })])],
    [
      'an entry in node_modules',
      suite({}, [app({ entry: 'node_modules/x/a.mjs' })]),
    ],
    ['an app id starting with x-', suite({}, [app({ id: 'x-0123456789ab' })])],
    ['an app id in capitals', suite({}, [app({ id: 'Docs' })])],
    ['an app id with a slash', suite({}, [app({ id: 'a/b' })])],
    [
      'the same app id twice',
      suite({}, [app(), app({ entry: 'other/app.mjs' })]),
    ],
    ['an extension in capitals', suite({}, [app({ opens: ['DOCX'] })])],
    ['an extension with its dot', suite({}, [app({ opens: ['.docx'] })])],
    ['an extension with a slash', suite({}, [app({ opens: ['a/b'] })])],
    [
      'an extension past 31 characters',
      suite({}, [app({ opens: ['a'.repeat(32)] })]),
    ],
    [
      'forty-one extensions',
      suite({}, [
        app({ opens: Array.from({ length: 41 }, (_, i) => `e${i}`) }),
      ]),
    ],
    [
      'multiInstance that is not a boolean',
      suite({}, [app({ multiInstance: 'yes' })]),
    ],
    [
      'a capability that does not exist',
      suite({}, [app({ capabilities: ['root'] })]),
    ],
    [
      'an app without capabilities',
      suite({}, [{ id: 'office-docs', name: 'Docs', entry: 'docs/app.mjs' }]),
    ],
    ['a service suite with no server', suite({ type: 'service' })],
    [
      'a static suite with a server',
      suite({ server: { command: ['node', 's.js'], portEnv: 'PORT' } }),
    ],
    ['a descriptor id starting with x-', suite({ id: 'x-office' })],
    [
      'a tag',
      suite({ source: { repo: 'https://example.com/r.git', ref: 'v1.0.0' } }),
    ],
    ['an unknown schema version', suite({ schemaVersion: 3 })],
  ])('refuses %s', (_label, d) => {
    expect(parse(d).success).toBe(false);
  });

  it('refuses file:// unless local repos are allowed, as version 1 does', () => {
    const d = suite({ source: { repo: 'file:///srv/office', ref: SHA } });
    expect(parse(d).success).toBe(false);
    expect(parse(d, true).success).toBe(true);
  });
});

describe('loadCatalog: one namespace for descriptor and app ids (brief 162)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'imb-catalog-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const write = (d: { id: string }) =>
    writeFileSync(join(dir, `${d.id}.json`), JSON.stringify(d));

  it('loads a suite beside a version 1 descriptor', () => {
    write(valid());
    write(suite());
    const { descriptors, problems } = loadCatalog(dir, {
      allowLocalRepos: false,
    });
    expect(problems).toEqual([]);
    expect([...descriptors.keys()]).toEqual(['hollow', 'office']);
    expect(descriptors.get('office')?.apps).toHaveLength(2);
  });

  it('skips a later file whose app reuses another file’s app id', () => {
    write(suite());
    write(suite({ id: 'other' }, [app()]));
    const { descriptors, problems } = loadCatalog(dir, {
      allowLocalRepos: false,
    });
    expect([...descriptors.keys()]).toEqual(['office']);
    expect(problems).toEqual([
      {
        file: 'other.json',
        problem: 'the id office-docs is already used by office.json',
      },
    ]);
  });

  it('skips a later file whose app takes another descriptor’s id', () => {
    write(suite({ id: 'games' }, [app({ id: 'hollow' })]));
    write(valid());
    const { descriptors, problems } = loadCatalog(dir, {
      allowLocalRepos: false,
    });
    expect([...descriptors.keys()]).toEqual(['games']);
    expect(problems).toEqual([
      {
        file: 'hollow.json',
        problem: 'the id hollow is already used by games.json',
      },
    ]);
  });

  it('skips a later descriptor whose id is an earlier file’s app id', () => {
    write(suite({ id: 'aaa' }, [app({ id: 'office' })]));
    write(suite());
    const { descriptors, problems } = loadCatalog(dir, {
      allowLocalRepos: false,
    });
    expect([...descriptors.keys()]).toEqual(['aaa']);
    expect(problems.map((p) => p.file)).toEqual(['office.json']);
    expect(problems[0].problem).toMatch(/aaa\.json/);
  });
});
