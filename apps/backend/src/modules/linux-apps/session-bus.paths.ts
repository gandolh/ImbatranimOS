import { join } from 'node:path';

/**
 * Where a desktop session's D-Bus session bus listens:
 * `$XDG_RUNTIME_DIR/imbatranim-bus/<session id>`, in a directory only the
 * OS user can enter. Kept free of Nest so the Terminal's environment can use
 * it too.
 */
export function sessionBusPath(runtimeDir: string, session: string): string {
  return join(runtimeDir, 'imbatranim-bus', session);
}

/** `DBUS_SESSION_BUS_ADDRESS` for a session's apps. */
export function sessionBusAddress(runtimeDir: string, session: string): string {
  return `unix:path=${sessionBusPath(runtimeDir, session)}`;
}
