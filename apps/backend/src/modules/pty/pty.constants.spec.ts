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
});
