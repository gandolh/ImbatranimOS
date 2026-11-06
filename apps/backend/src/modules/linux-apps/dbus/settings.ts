import type { HandlerResult } from './connection';
import { Variant, type Message } from './wire';
import type { SignalSender } from './notifications';

/**
 * `org.freedesktop.portal.Settings` on a session's bus: the desktop's light
 * or dark mode and accent colour, for Linux apps whose toolkit reads them
 * (libadwaita does, and restyles live on `SettingChanged`). Only the
 * `org.freedesktop.appearance` namespace exists; any other answers empty.
 *
 * https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Settings.html
 */

export const SETTINGS = {
  name: 'org.freedesktop.portal.Desktop',
  path: '/org/freedesktop/portal/desktop',
  interface: 'org.freedesktop.portal.Settings',
} as const;

export const APPEARANCE = 'org.freedesktop.appearance';

/** The prefs key of the desktop's appearance dotfile. */
export const APPEARANCE_PREF = 'imbatranimos:appearance';

type Mode = 'light' | 'dark';
type ThemeId = 'apricot' | 'classic';

/**
 * The accent presets' `strong` colours, mirrored from the desktop's
 * appearance store (`[light, dark]`). A spec pins the table.
 */
export const STRONG: Record<ThemeId, Record<string, [string, string]>> = {
  apricot: {
    apricot: ['#a04b23', '#f2a97e'],
    rose: ['#b23656', '#eea6b5'],
    butter: ['#7f5f1b', '#f3d27a'],
    sage: ['#4e6c48', '#a9c9a4'],
    sky: ['#376891', '#a7c7e7'],
  },
  classic: {
    crimson: ['#c0263a', '#c0263a'],
    cobalt: ['#1f5fd6', '#1f5fd6'],
    emerald: ['#0f7a40', '#0f7a40'],
    signal: ['#d24317', '#d24317'],
  },
};

const DEFAULT_ACCENTS: Record<ThemeId, string> = {
  apricot: 'apricot',
  classic: 'crimson',
};

/** The portal's values, by key. */
export type Appearance = {
  'color-scheme': number;
  'accent-color': [number, number, number];
  contrast: number;
};

const KEYS = ['color-scheme', 'accent-color', 'contrast'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

/**
 * The portal's values for a stored appearance dotfile (the persisted JSON
 * as the desktop writes it), or Apricot's light defaults for nothing saved
 * or something unreadable. A blob from before themes has the mode in `theme`.
 */
export function appearanceFrom(raw: string | null | undefined): Appearance {
  let state: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isRecord(parsed) && isRecord(parsed.state)) state = parsed.state;
  } catch {
    // unreadable: the defaults
  }
  const legacy = state.theme === 'light' || state.theme === 'dark';
  const theme: ThemeId =
    !legacy && (state.theme === 'apricot' || state.theme === 'classic')
      ? state.theme
      : 'apricot';
  const mode: Mode = legacy
    ? (state.theme as Mode)
    : state.mode === 'dark'
      ? 'dark'
      : 'light';
  const chosen = isRecord(state.accents) ? state.accents[theme] : undefined;
  const presets = STRONG[theme];
  const id =
    typeof chosen === 'string' && Object.hasOwn(presets, chosen)
      ? chosen
      : DEFAULT_ACCENTS[theme];
  return {
    'color-scheme': mode === 'dark' ? 1 : 2,
    'accent-color': hexToRgb(presets[id][mode === 'dark' ? 1 : 0]),
    contrast: 0,
  };
}

const variantOf = (key: (typeof KEYS)[number], a: Appearance): Variant =>
  key === 'accent-color'
    ? new Variant('(ddd)', a['accent-color'])
    : new Variant('u', a[key]);

/** Does a namespace pattern from `ReadAll` match? `""` and `*` globs. */
function matches(pattern: string, namespace: string): boolean {
  if (pattern === '') return true;
  if (pattern.endsWith('*')) return namespace.startsWith(pattern.slice(0, -1));
  return pattern === namespace;
}

const INTROSPECTION = `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="org.freedesktop.portal.Settings">
    <method name="ReadAll">
      <arg direction="in" type="as"/><arg direction="out" type="a{sa{sv}}"/>
    </method>
    <method name="Read">
      <arg direction="in" type="s"/><arg direction="in" type="s"/><arg direction="out" type="v"/>
    </method>
    <method name="ReadOne">
      <arg direction="in" type="s"/><arg direction="in" type="s"/><arg direction="out" type="v"/>
    </method>
    <signal name="SettingChanged"><arg type="s"/><arg type="s"/><arg type="v"/></signal>
    <property name="version" type="u" access="read"/>
  </interface>
  <interface name="org.freedesktop.DBus.Properties">
    <method name="Get"><arg direction="in" type="s"/><arg direction="in" type="s"/><arg direction="out" type="v"/></method>
    <method name="GetAll"><arg direction="in" type="s"/><arg direction="out" type="a{sv}"/></method>
  </interface>
  <interface name="org.freedesktop.DBus.Introspectable">
    <method name="Introspect"><arg direction="out" type="s"/></method>
  </interface>
  <interface name="org.freedesktop.DBus.Peer">
    <method name="Ping"/>
  </interface>
</node>
`;

export class SettingsServer {
  private current: Appearance;

  constructor(
    private readonly signal: SignalSender,
    stored: string | null,
  ) {
    this.current = appearanceFrom(stored);
  }

  /** The appearance dotfile changed (or was reset: null): tell the apps. */
  update(stored: string | null): void {
    const next = appearanceFrom(stored);
    const before = this.current;
    this.current = next;
    for (const key of KEYS) {
      if (JSON.stringify(before[key]) === JSON.stringify(next[key])) continue;
      this.signal({
        path: SETTINGS.path,
        interface: SETTINGS.interface,
        member: 'SettingChanged',
        signature: 'ssv',
        body: [APPEARANCE, key, variantOf(key, next)],
      });
    }
  }

  handle(call: Message): HandlerResult | undefined {
    if (call.path !== SETTINGS.path) return undefined;
    switch (`${call.interface ?? SETTINGS.interface}.${call.member}`) {
      case 'org.freedesktop.portal.Settings.ReadAll': {
        if (call.signature !== 'as') return badArgs('ReadAll', 'as');
        const patterns = call.body[0] as string[];
        const all =
          patterns.length === 0 || patterns.some((p) => matches(p, APPEARANCE));
        const entries = KEYS.map((k) => [k, variantOf(k, this.current)]);
        return {
          signature: 'a{sa{sv}}',
          body: [all ? [[APPEARANCE, entries]] : []],
        };
      }
      case 'org.freedesktop.portal.Settings.ReadOne':
        return this.read(call, 'ReadOne', false);
      case 'org.freedesktop.portal.Settings.Read':
        // Deprecated: the value comes wrapped in one more variant.
        return this.read(call, 'Read', true);
      case 'org.freedesktop.DBus.Properties.Get':
        if (call.signature !== 'ss') return badArgs('Get', 'ss');
        if (call.body[0] === SETTINGS.interface && call.body[1] === 'version') {
          return { signature: 'v', body: [new Variant('u', 2)] };
        }
        return notFound(`No property ${String(call.body[1])}`);
      case 'org.freedesktop.DBus.Properties.GetAll':
        if (call.signature !== 's') return badArgs('GetAll', 's');
        return {
          signature: 'a{sv}',
          body: [
            call.body[0] === SETTINGS.interface
              ? [['version', new Variant('u', 2)]]
              : [],
          ],
        };
      case 'org.freedesktop.DBus.Introspectable.Introspect':
        return { signature: 's', body: [INTROSPECTION] };
      case 'org.freedesktop.DBus.Peer.Ping':
        return {};
      default:
        return undefined;
    }
  }

  private read(call: Message, member: string, wrap: boolean): HandlerResult {
    if (call.signature !== 'ss') return badArgs(member, 'ss');
    const [namespace, key] = call.body as [string, string];
    if (
      namespace !== APPEARANCE ||
      !(KEYS as readonly string[]).includes(key)
    ) {
      return notFound(`Requested setting not found: ${namespace} ${key}`);
    }
    const v = variantOf(key as (typeof KEYS)[number], this.current);
    return { signature: 'v', body: [wrap ? new Variant('v', v) : v] };
  }
}

function badArgs(member: string, signature: string): HandlerResult {
  return {
    error: 'org.freedesktop.DBus.Error.InvalidArgs',
    message: `${member} takes (${signature})`,
  };
}

function notFound(message: string): HandlerResult {
  return { error: 'org.freedesktop.portal.Error.NotFound', message };
}
