import { join } from 'node:path';

/**
 * Where a desktop session's sound server listens:
 * `$XDG_RUNTIME_DIR/imbatranim-sound/<session id>`. The Wayland host serves
 * PulseAudio's protocol there for the session's apps and sends their mixed
 * sound to the tab (`apps/wayland-host/src/sound/`); this names the same
 * path. Kept free of Nest so the Terminal's environment can use it too.
 */
export function soundServerPath(runtimeDir: string, session: string): string {
  return join(runtimeDir, 'imbatranim-sound', session);
}

/**
 * What a session's apps need to play sound: `PULSE_SERVER` naming its
 * server, and `PULSE_COOKIE` naming a file in the runtime directory. The
 * server asks for no cookie, but libpulse makes one where this says rather
 * than in the home folder, which backups carry.
 */
export function soundServerEnv(
  runtimeDir: string,
  session: string,
): { PULSE_SERVER: string; PULSE_COOKIE: string } {
  return {
    PULSE_SERVER: `unix:${soundServerPath(runtimeDir, session)}`,
    PULSE_COOKIE: join(runtimeDir, 'imbatranim-sound', 'cookie'),
  };
}
