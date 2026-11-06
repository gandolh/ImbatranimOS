import { recordedBuild } from './marketplace.service';

/** No hook declared: what every row from before hooks reads as. */
const NO_HOOKS = { background: false, commandSources: false };

/**
 * What an installed row says its live build holds. The listing
 * reads this, not the descriptor, so editing a descriptor without a
 * reinstall cannot point an app at a file that was never built.
 */
describe('recordedBuild', () => {
  it('reads a row with no entries as one app, served from its entry directory', () => {
    const r = recordedBuild({
      id: 'hollow',
      entry: 'games/hollow/client/dist/os/hollow.mjs',
      entries: null,
    });
    expect(r?.output).toBe('games/hollow/client/dist/os');
    expect([...r!.entries]).toEqual([
      [
        'hollow',
        { entry: 'hollow.mjs', styles: [], sharedKit: null, ...NO_HOOKS },
      ],
    ]);
  });

  it("reads a suite's row: the output in entry, each app's module in entries", () => {
    const r = recordedBuild({
      id: 'office',
      entry: 'dist/os',
      entries: JSON.stringify({
        'office-docs': 'docs/app.mjs',
        'office-sheets': 'sheets/./app.js',
      }),
    });
    expect(r?.output).toBe('dist/os');
    expect([...r!.entries]).toEqual([
      [
        'office-docs',
        { entry: 'docs/app.mjs', styles: [], sharedKit: null, ...NO_HOOKS },
      ],
      [
        'office-sheets',
        { entry: 'sheets/app.js', styles: [], sharedKit: null, ...NO_HOOKS },
      ],
    ]);
  });

  it("reads a kit suite's row: each app's module, stylesheets and shared kit version", () => {
    const r = recordedBuild({
      id: 'office',
      entry: 'dist/os',
      entries: JSON.stringify({
        'office-docs': {
          entry: 'docs/app.mjs',
          styles: ['docs/./app.css'],
          sharedKit: 1,
        },
        'office-sheets': { entry: 'sheets/app.mjs', styles: [], sharedKit: 1 },
      }),
    });
    expect([...r!.entries]).toEqual([
      [
        'office-docs',
        {
          entry: 'docs/app.mjs',
          styles: ['docs/app.css'],
          sharedKit: 1,
          ...NO_HOOKS,
        },
      ],
      [
        'office-sheets',
        { entry: 'sheets/app.mjs', styles: [], sharedKit: 1, ...NO_HOOKS },
      ],
    ]);
  });

  it("reads the hooks a kit app's build declared", () => {
    const r = recordedBuild({
      id: 'kit',
      entry: 'dist/os',
      entries: JSON.stringify({
        'kit-ticker': {
          entry: 'ticker/app.mjs',
          styles: [],
          sharedKit: 1,
          background: true,
          commandSources: true,
        },
        'kit-quiet': {
          entry: 'quiet/app.mjs',
          styles: [],
          sharedKit: 1,
          commandSources: true,
        },
      }),
    });
    expect(
      [...r!.entries].map(([id, a]) => [id, a.background, a.commandSources]),
    ).toEqual([
      ['kit-ticker', true, true],
      ['kit-quiet', false, true],
    ]);
  });

  it.each([
    ['not JSON', '{nope'],
    ['an array', '["docs/app.mjs"]'],
    ['null', 'null'],
    ['a number', '3'],
    ['a path climbing out', '{"office-docs":"../app.mjs"}'],
    ['an absolute path', '{"office-docs":"/etc/app.mjs"}'],
    ['not a module', '{"office-docs":"docs/index.html"}'],
    ['a path that is not a string', '{"office-docs":3}'],
    ['an id that is not one', '{"Office Docs":"docs/app.mjs"}'],
    [
      'a kit app with no shared kit version',
      '{"office-docs":{"entry":"docs/app.mjs","styles":[]}}',
    ],
    [
      'a kit app whose shared kit version is 0',
      '{"office-docs":{"entry":"docs/app.mjs","styles":[],"sharedKit":0}}',
    ],
    [
      'a kit app whose stylesheet climbs out',
      '{"office-docs":{"entry":"docs/app.mjs","styles":["../a.css"],"sharedKit":1}}',
    ],
    [
      'a kit app whose stylesheet is not CSS',
      '{"office-docs":{"entry":"docs/app.mjs","styles":["a.js"],"sharedKit":1}}',
    ],
    [
      'a kit app whose module is not one',
      '{"office-docs":{"entry":"docs/app.css","styles":[],"sharedKit":1}}',
    ],
    [
      'a kit app whose hook is not true',
      '{"office-docs":{"entry":"docs/app.mjs","styles":[],"sharedKit":1,"background":false}}',
    ],
    [
      'a kit app with a field it does not know',
      '{"office-docs":{"entry":"docs/app.mjs","styles":[],"sharedKit":1,"x":1}}',
    ],
  ])('is null for entries that are %s', (_label, entries) => {
    expect(
      recordedBuild({ id: 'office', entry: 'dist/os', entries }),
    ).toBeNull();
  });
});
