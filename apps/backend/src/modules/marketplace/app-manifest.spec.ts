import { parseManifest } from './app-manifest';

function valid(extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    name: 'Hollow',
    description: 'A generational social-emergence sim in a small 3D town.',
    meta: ['game'],
    entry: 'dist/hollow.mjs',
    window: {
      defaultSize: { w: 960, h: 640 },
      minSize: { w: 640, h: 400 },
    },
    capabilities: [],
    icon: 'gamepad-2',
    minSystemVersion: 2,
    ...extra,
  };
}

describe('imbatranim.json (brief 158, contract A)', () => {
  it("accepts the contract's example", () => {
    const r = parseManifest(valid());
    expect(r).toEqual({ ok: true, manifest: valid() });
  });

  it('fills the defaults and allows notify', () => {
    const r = parseManifest({
      schemaVersion: 1,
      name: 'Tiny',
      entry: 'out/tiny.js',
      capabilities: ['notify'],
      minSystemVersion: 1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manifest.description).toBe('');
      expect(r.manifest.meta).toEqual([]);
      expect(r.manifest.icon).toBe('package');
      expect(r.manifest.window.defaultSize).toEqual({ w: 960, h: 640 });
      expect(r.manifest.capabilities).toEqual(['notify']);
    }
  });

  it('refuses an unknown key, naming it', () => {
    const r = parseManifest(valid({ build: { command: ['npm', 'run'] } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/imbatranim\.json: .*"build"/);
  });

  it.each(['id', 'runtime', 'source', 'server'])(
    'refuses a %s key: the author does not choose those',
    (key) => {
      expect(parseManifest(valid({ [key]: 'x' })).ok).toBe(false);
    },
  );

  it.each(['fs', 'http', 'intents', 'shortcuts', 'schedule', 'root'])(
    'refuses the capability %s by name',
    (cap) => {
      const r = parseManifest(valid({ capabilities: ['notify', cap] }));
      expect(r).toEqual({
        ok: false,
        problem: `This app asks for system.${cap}, which an app installed from a URL cannot have. Only notify is allowed.`,
      });
    },
  );

  it.each([
    ['at the top', 'hollow.mjs'],
    ['climbing out', 'dist/../../x.mjs'],
    ['absolute', '/etc/x.mjs'],
    ['in node_modules', 'node_modules/x/a.mjs'],
    ['not JS', 'dist/index.html'],
    ['with a backslash', 'dist\\a.mjs'],
    ['with a NUL', 'dist/a\0.mjs'],
    ['a dotfile', 'dist/.a.mjs'],
    ['in a dot directory', '.out/a.mjs'],
  ])('refuses an entry %s', (_label, entry) => {
    const r = parseManifest(valid({ entry }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/^imbatranim\.json: entry: /);
  });

  it.each([
    ['an empty name', { name: '' }],
    ['a long name', { name: 'n'.repeat(61) }],
    ['a long description', { description: 'd'.repeat(301) }],
    ['nine meta tags', { meta: Array.from({ length: 9 }, (_, i) => `m${i}`) }],
    ['a capability twice', { capabilities: ['notify', 'notify'] }],
    ['schema version 2', { schemaVersion: 2 }],
    ['no minSystemVersion', { minSystemVersion: undefined }],
    ['a bad icon', { icon: 'Gamepad 2' }],
    [
      'a tiny window',
      { window: { defaultSize: { w: 1, h: 1 }, minSize: { w: 1, h: 1 } } },
    ],
  ])('refuses %s', (_label, extra) => {
    expect(parseManifest(valid(extra)).ok).toBe(false);
  });

  describe('window size (capped for an app from a URL)', () => {
    const win = (d: [number, number], m: [number, number]) => ({
      window: {
        defaultSize: { w: d[0], h: d[1] },
        minSize: { w: m[0], h: m[1] },
      },
    });

    it('accepts the largest sizes allowed', () => {
      expect(parseManifest(valid(win([1600, 1000], [800, 600]))).ok).toBe(true);
      expect(parseManifest(valid(win([800, 600], [800, 600]))).ok).toBe(true);
    });

    it.each([
      [
        [1601, 1000],
        [640, 400],
      ],
      [
        [1600, 1001],
        [640, 400],
      ],
      [
        [3840, 2160],
        [640, 400],
      ],
    ] as [number, number][][])(
      'refuses a default size of %j, saying the most',
      (d, m) => {
        expect(parseManifest(valid(win(d, m)))).toEqual({
          ok: false,
          problem: `This app asks for a ${d[0]}×${d[1]} window. An app installed from a URL may open at most 1600×1000.`,
        });
      },
    );

    it.each([
      [
        [1600, 1000],
        [801, 600],
      ],
      [
        [1600, 1000],
        [800, 601],
      ],
    ] as [number, number][][])(
      'refuses a minimum size of %j, saying the most',
      (d, m) => {
        expect(parseManifest(valid(win(d, m)))).toEqual({
          ok: false,
          problem: `This app asks for a window of at least ${m[0]}×${m[1]}. An app installed from a URL may ask for at most 800×600.`,
        });
      },
    );

    it('refuses a minimum size larger than the default', () => {
      expect(parseManifest(valid(win([700, 500], [640, 501])))).toEqual({
        ok: false,
        problem:
          "This app's smallest window, 640×501, is larger than the 700×500 it opens at.",
      });
      expect(parseManifest(valid(win([700, 500], [701, 400]))).ok).toBe(false);
    });
  });

  it('refuses something that is not an object', () => {
    expect(parseManifest([]).ok).toBe(false);
    expect(parseManifest(null).ok).toBe(false);
  });
});
