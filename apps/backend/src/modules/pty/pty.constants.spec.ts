import { terminalEnv } from './pty.constants';

describe('terminalEnv', () => {
  it("puts the user's Nix profile first on PATH and leaves the input alone", () => {
    const base = {
      PATH: '/usr/local/bin:/usr/bin:/bin',
      NIX_STATE_HOME: '/nix/var/imbatranim/state',
      LOCALE_ARCHIVE: '/x/locale-archive',
    };
    const env = terminalEnv(base);
    expect(env.PATH).toBe(
      '/nix/var/imbatranim/state/profile/bin:/usr/local/bin:/usr/bin:/bin',
    );
    expect(env.LOCALE_ARCHIVE).toBe('/x/locale-archive');
    expect(base.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
  });

  it('does not add the profile twice', () => {
    const env = terminalEnv({
      PATH: '/nix/var/imbatranim/state/profile/bin:/usr/bin',
      NIX_STATE_HOME: '/nix/var/imbatranim/state',
    });
    expect(env.PATH).toBe('/nix/var/imbatranim/state/profile/bin:/usr/bin');
  });

  it('adds nothing outside the container, where NIX_STATE_HOME is unset', () => {
    expect(terminalEnv({ PATH: '/usr/bin' })).toEqual({ PATH: '/usr/bin' });
  });

  it("names the tab's Wayland socket for a valid desktop session id", () => {
    expect(terminalEnv({}, 'abcdefghijklmnop').WAYLAND_DISPLAY).toBe(
      'wayland-abcdefghijklmnop',
    );
  });

  it('adds no display for a missing or unsafe session id, and drops an inherited one', () => {
    expect(
      terminalEnv({ WAYLAND_DISPLAY: 'wayland-1' }).WAYLAND_DISPLAY,
    ).toBeUndefined();
    expect(terminalEnv({}, '../../etc/passwd').WAYLAND_DISPLAY).toBeUndefined();
    expect(terminalEnv({}, 'short').WAYLAND_DISPLAY).toBeUndefined();
  });

  it("names the tab's session bus, and never one for a missing session", () => {
    const base = { XDG_RUNTIME_DIR: '/run/user/1000' };
    expect(terminalEnv(base, 'abcdefghijklmnop').DBUS_SESSION_BUS_ADDRESS).toBe(
      'unix:path=/run/user/1000/imbatranim-bus/abcdefghijklmnop',
    );
    expect(
      terminalEnv({ ...base, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/x' })
        .DBUS_SESSION_BUS_ADDRESS,
    ).toBeUndefined();
    // No runtime directory, no bus to name.
    expect(
      terminalEnv({}, 'abcdefghijklmnop').DBUS_SESSION_BUS_ADDRESS,
    ).toBeUndefined();
  });
});
