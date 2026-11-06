/**
 * Desktop entries (`.desktop` files), the way every Linux app says what to
 * show in a menu and how to start it. Only what a Start entry needs is read:
 * the `[Desktop Entry]` group, with its localized keys (`Name[ro]`), and the
 * `[Desktop Action <id>]` groups its `Actions` key lists.
 * Spec: https://specifications.freedesktop.org/desktop-entry-spec/latest/
 */

import { pathToFileURL } from 'url';

/** A key's localized values, by locale as the file writes it (`ro`, `pt_BR`, `sr@latin`). */
export type Localized = Record<string, string>;

/** A desktop action: another way to start the app, such as Firefox's New Window. */
export interface DesktopAction {
  id: string;
  name: string;
  names: Localized;
  exec: string;
}

export interface DesktopEntry {
  name: string;
  names: Localized;
  genericName: string;
  genericNames: Localized;
  comment: string;
  comments: Localized;
  /** An icon name, or an absolute path. */
  icon: string;
  /** The `Exec` line, unescaped as a string value; {@link execArgv} splits it. */
  exec: string;
  /** The `MimeType` key's types, lowercased, as the entry lists them. */
  mimeTypes: string[];
  /** The actions `Actions` lists that have a group with a `Name` and an `Exec`, in its order. */
  actions: DesktopAction[];
}

/** An action's identifier, as the spec allows them: letters, digits and `-`. */
const ACTION_ID = /^[A-Za-z0-9-]+$/;

/** One group's keys: plain values, and localized ones by key and locale. */
interface Group {
  plain: Map<string, string>;
  localized: Map<string, Localized>;
}

/**
 * A locale as a key's brackets give it, `lang_COUNTRY.ENCODING@MODIFIER`,
 * without the encoding, which matching ignores.
 */
function keyLocale(raw: string): string {
  return raw.replace(/\.[^@]*/, '');
}

/** Unescape a string value: `\s`, `\n`, `\t`, `\r` and `\\`. */
function unescapeValue(v: string): string {
  return v.replace(/\\([sntr\\])/g, (_, c: string) =>
    c === 's'
      ? ' '
      : c === 'n'
        ? '\n'
        : c === 't'
          ? '\t'
          : c === 'r'
            ? '\r'
            : '\\',
  );
}

/** Split a file into its groups, by header. Only the first value of a key counts. */
function groups(text: string): Map<string, Group> {
  const out = new Map<string, Group>();
  let current: Group | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      const name = line.endsWith(']') ? line.slice(1, -1) : '';
      current = out.get(name) ?? null;
      if (!current && name) {
        current = { plain: new Map(), localized: new Map() };
        out.set(name, current);
      }
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = unescapeValue(line.slice(eq + 1).trim());
    const loc = /^([A-Za-z0-9-]+)\[([^\]]+)\]$/.exec(key);
    if (loc) {
      const values = current.localized.get(loc[1]) ?? {};
      const locale = keyLocale(loc[2]);
      if (!(locale in values)) values[locale] = value;
      current.localized.set(loc[1], values);
    } else if (!current.plain.has(key)) {
      current.plain.set(key, value);
    }
  }
  return out;
}

/**
 * The entry, if it is one to show: `Type=Application` with a `Name` and an
 * `Exec`, and neither `NoDisplay=true` nor `Hidden=true`.
 */
export function parseDesktopEntry(text: string): DesktopEntry | null {
  const all = groups(text);
  const entry = all.get('Desktop Entry');
  if (!entry) return null;
  const keys = entry.plain;
  if (keys.get('Type') !== 'Application') return null;
  if (keys.get('NoDisplay') === 'true' || keys.get('Hidden') === 'true')
    return null;
  const name = keys.get('Name');
  const exec = keys.get('Exec');
  if (!name || !exec) return null;

  const actions: DesktopAction[] = [];
  const seen = new Set<string>();
  for (const id of (keys.get('Actions') ?? '').split(';')) {
    const trimmed = id.trim();
    if (!ACTION_ID.test(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    const group = all.get(`Desktop Action ${trimmed}`);
    const actionName = group?.plain.get('Name');
    const actionExec = group?.plain.get('Exec');
    if (!group || !actionName || !actionExec) continue;
    actions.push({
      id: trimmed,
      name: actionName,
      names: group.localized.get('Name') ?? {},
      exec: actionExec,
    });
  }

  return {
    name,
    names: entry.localized.get('Name') ?? {},
    genericName: keys.get('GenericName') ?? '',
    genericNames: entry.localized.get('GenericName') ?? {},
    comment: keys.get('Comment') ?? '',
    comments: entry.localized.get('Comment') ?? {},
    icon: keys.get('Icon') ?? '',
    exec,
    mimeTypes: (keys.get('MimeType') ?? '')
      .split(';')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t !== ''),
    actions,
  };
}

/** BCP 47 scripts the spec's locales write as a modifier (`sr@latin`). */
const SCRIPT_MODIFIERS: Record<string, string> = {
  latn: 'latin',
  cyrl: 'cyrillic',
};

/**
 * A browser language tag (`ro-RO`, `sr-Latn-RS`) as the spec's locale parts.
 * Null when it isn't one.
 */
function posixParts(
  tag: string,
): { lang: string; country?: string; modifier?: string } | null {
  const parts = tag.split(/[-_]/);
  const lang = parts[0]?.toLowerCase();
  if (!lang || !/^[a-z]{2,8}$/.test(lang)) return null;
  let country: string | undefined;
  let modifier: string | undefined;
  for (const p of parts.slice(1)) {
    if (/^[A-Za-z]{4}$/.test(p)) modifier = SCRIPT_MODIFIERS[p.toLowerCase()];
    else if (/^([A-Za-z]{2}|\d{3})$/.test(p)) country = p.toUpperCase();
  }
  return { lang, country, modifier };
}

/**
 * The value for the first of `languages` (the browser's, in its order) that
 * the file has, matched the way the Desktop Entry spec matches one locale:
 * `lang_COUNTRY@MODIFIER`, then `lang_COUNTRY`, then `lang@MODIFIER`, then
 * `lang`. The plain value when none matches. The OS has no language setting
 * of its own; the browser's is the user's.
 */
export function pickLocalized(
  plain: string,
  values: Localized,
  languages: readonly string[],
): string {
  for (const tag of languages) {
    const p = posixParts(tag);
    if (!p) continue;
    const tries = [
      p.country && p.modifier && `${p.lang}_${p.country}@${p.modifier}`,
      p.country && `${p.lang}_${p.country}`,
      p.modifier && `${p.lang}@${p.modifier}`,
      p.lang,
    ];
    for (const key of tries) {
      if (key && values[key]) return values[key];
    }
  }
  return plain;
}

/** Whether an `Exec` value has a field code that takes a file: `%f`, `%F`, `%u` or `%U`. */
export function execTakesFile(exec: string): boolean {
  // `%%` is a literal percent sign, so it is read as a pair.
  return /%[fFuU]/.test(exec.replace(/%%/g, ''));
}

/**
 * Split an `Exec` value into an argv, as the spec says: arguments are
 * separated by spaces, a double-quoted one may hold spaces and escapes
 * `"`, `` ` ``, `$` and `\` with a backslash. With `file` (an absolute
 * path), `%f` and `%F` become the path and `%u` and `%U` its `file://` URL;
 * without one, those codes are removed, as a Start entry passes no files. The
 * other field codes are always removed. `%%` is a percent sign. Null when the line is malformed (an
 * unclosed quote) or names no program.
 */
export function execArgv(exec: string, file?: string): string[] | null {
  const args: string[] = [];
  let cur = '';
  let started = false;
  let quoted = false;
  // The program must be written out, not come from a field code.
  let programFromCode = false;
  for (let i = 0; i < exec.length; i++) {
    const c = exec[i];
    if (quoted) {
      if (c === '\\' && i + 1 < exec.length && '"`$\\'.includes(exec[i + 1])) {
        cur += exec[++i];
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
      started = true;
    } else if (c === ' ' || c === '\t') {
      if (started) args.push(cur);
      cur = '';
      started = false;
    } else if (c === '%' && i + 1 < exec.length) {
      const code = exec[++i];
      if (code === '%') {
        cur += '%';
        started = true;
      } else if (file !== undefined && (code === 'f' || code === 'F')) {
        cur += file;
        started = true;
        if (args.length === 0) programFromCode = true;
      } else if (file !== undefined && (code === 'u' || code === 'U')) {
        cur += pathToFileURL(file).href;
        started = true;
        if (args.length === 0) programFromCode = true;
      }
      // Every other field code expands to nothing here.
    } else {
      cur += c;
      started = true;
    }
  }
  if (quoted) return null;
  if (started) args.push(cur);
  if (programFromCode) return null;
  return args.length > 0 && args[0] !== '' ? args : null;
}
