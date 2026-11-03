import { execArgv, parseDesktopEntry, pickLocalized } from './desktop-entry';

describe('desktop entries', () => {
  it('reads [Desktop Entry] with its localized keys, and the actions it lists', () => {
    const e = parseDesktopEntry(
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=Firefox',
        'Name[ro]=Firefox Românesc',
        'Name[pt_BR.UTF-8]=Firefox do Brasil',
        'Name[ro]=ignored, the first value counts',
        'GenericName=Web Browser',
        'GenericName[ro]=Navigator web',
        'Comment=Web\\sBrowser',
        'Comment[ro]=Navigați\\spe web',
        'Icon=firefox',
        'Exec=firefox --name firefox %U',
        'Actions=new-window;new-private-window;missing;bad id;',
        '',
        '[Desktop Action new-window]',
        'Name=New Window',
        'Name[ro]=Fereastră nouă',
        'Exec=firefox --new-window %U',
        '',
        '[Desktop Action new-private-window]',
        'Name=New Private Window',
        'Exec=firefox --private-window %U',
        '',
        '[Desktop Action not-listed]',
        'Name=Not listed',
        'Exec=firefox --nope',
      ].join('\n'),
    );
    expect(e).toEqual({
      name: 'Firefox',
      names: { ro: 'Firefox Românesc', pt_BR: 'Firefox do Brasil' },
      genericName: 'Web Browser',
      genericNames: { ro: 'Navigator web' },
      comment: 'Web Browser',
      comments: { ro: 'Navigați pe web' },
      icon: 'firefox',
      exec: 'firefox --name firefox %U',
      actions: [
        {
          id: 'new-window',
          name: 'New Window',
          names: { ro: 'Fereastră nouă' },
          exec: 'firefox --new-window %U',
        },
        {
          id: 'new-private-window',
          name: 'New Private Window',
          names: {},
          exec: 'firefox --private-window %U',
        },
      ],
    });
  });

  it('skips an action without a Name or an Exec', () => {
    const e = parseDesktopEntry(
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=X',
        'Exec=x',
        'Actions=a;b;',
        '[Desktop Action a]',
        'Name=A',
        '[Desktop Action b]',
        'Exec=x --b',
      ].join('\n'),
    );
    expect(e?.actions).toEqual([]);
  });

  it('skips entries that are hidden, not applications, or incomplete', () => {
    const base = '[Desktop Entry]\nName=X\nExec=x\n';
    expect(
      parseDesktopEntry(base + 'Type=Application\nNoDisplay=true'),
    ).toBeNull();
    expect(
      parseDesktopEntry(base + 'Type=Application\nHidden=true'),
    ).toBeNull();
    expect(parseDesktopEntry(base + 'Type=Link')).toBeNull();
    expect(
      parseDesktopEntry('[Desktop Entry]\nType=Application\nName=X'),
    ).toBeNull();
    expect(
      parseDesktopEntry(base + 'Type=Application\nNoDisplay=false'),
    ).not.toBeNull();
  });
});

describe("picking a localized value by the browser's languages", () => {
  const names = {
    ro: 'Română',
    ro_MD: 'Moldovenească',
    pt_BR: 'Português do Brasil',
    sr: 'Српски',
    'sr@latin': 'Srpski',
    sr_RS: 'Српски (Србија)',
    'sr_RS@latin': 'Srpski (Srbija)',
  };

  it('tries lang_COUNTRY before lang, as the spec matches a locale', () => {
    expect(pickLocalized('English', names, ['ro-RO'])).toBe('Română');
    expect(pickLocalized('English', names, ['ro-MD'])).toBe('Moldovenească');
    expect(pickLocalized('English', names, ['ro'])).toBe('Română');
    expect(pickLocalized('English', names, ['pt-BR'])).toBe(
      'Português do Brasil',
    );
  });

  it('reads a script as the modifier', () => {
    expect(pickLocalized('English', names, ['sr-Latn-RS'])).toBe(
      'Srpski (Srbija)',
    );
    expect(pickLocalized('English', names, ['sr-Latn'])).toBe('Srpski');
    expect(pickLocalized('English', names, ['sr-RS'])).toBe('Српски (Србија)');
  });

  it('takes the first of the languages the file has, else the plain value', () => {
    expect(pickLocalized('English', names, ['de-DE', 'ro', 'en'])).toBe(
      'Română',
    );
    expect(pickLocalized('English', names, ['pt-PT'])).toBe('English');
    expect(pickLocalized('English', names, ['de', 'fr'])).toBe('English');
    expect(pickLocalized('English', names, [])).toBe('English');
    expect(pickLocalized('English', names, ['', '*', 'x1'])).toBe('English');
  });
});

describe('splitting an Exec line', () => {
  it('removes field codes and keeps a literal percent', () => {
    expect(execArgv('gimp-3.0 %U')).toEqual(['gimp-3.0']);
    expect(execArgv('app --file=%f %F %i %c %k')).toEqual(['app', '--file=']);
    expect(execArgv('app 100%%')).toEqual(['app', '100%']);
  });

  it('keeps quoted arguments whole, with their escapes', () => {
    expect(
      execArgv('"/opt/My App/run" --title "a \\"b\\" \\$c \\\\d" x'),
    ).toEqual(['/opt/My App/run', '--title', 'a "b" $c \\d', 'x']);
    expect(execArgv('app ""')).toEqual(['app', '']);
  });

  it('refuses an unclosed quote or a line with no program', () => {
    expect(execArgv('app "oops')).toBeNull();
    expect(execArgv('%U')).toBeNull();
    expect(execArgv('   ')).toBeNull();
  });
});
