import { recordedBuild } from './marketplace.service';

/**
 * Brief 162: what an installed row says its live build holds. The listing
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
    expect([...r!.entries]).toEqual([['hollow', 'hollow.mjs']]);
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
      ['office-docs', 'docs/app.mjs'],
      ['office-sheets', 'sheets/app.js'],
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
  ])('is null for entries that are %s', (_label, entries) => {
    expect(
      recordedBuild({ id: 'office', entry: 'dist/os', entries }),
    ).toBeNull();
  });
});
