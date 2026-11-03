import { execArgv, parseDesktopEntry } from './desktop-entry';

describe('desktop entries', () => {
  it('reads the unlocalized keys of [Desktop Entry] only', () => {
    const e = parseDesktopEntry(
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=Firefox',
        'Name[ro]=Firefox Românesc',
        'Comment=Web\\sBrowser',
        'Icon=firefox',
        'Exec=firefox --name firefox %U',
        '',
        '[Desktop Action new-window]',
        'Name=New Window',
        'Exec=firefox --new-window %U',
      ].join('\n'),
    );
    expect(e).toEqual({
      name: 'Firefox',
      comment: 'Web Browser',
      icon: 'firefox',
      exec: 'firefox --name firefox %U',
    });
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
