/**
 * Desktop entries (`.desktop` files), the way every Linux app says what to
 * show in a menu and how to start it. Only what a Start entry needs is read,
 * from the `[Desktop Entry]` group, and only its unlocalized keys.
 * Spec: https://specifications.freedesktop.org/desktop-entry-spec/latest/
 */

export interface DesktopEntry {
  name: string;
  comment: string;
  /** An icon name, or an absolute path. */
  icon: string;
  /** The `Exec` line, unescaped as a string value; {@link execArgv} splits it. */
  exec: string;
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

/**
 * The entry, if it is one to show: `Type=Application` with a `Name` and an
 * `Exec`, and neither `NoDisplay=true` nor `Hidden=true`.
 */
export function parseDesktopEntry(text: string): DesktopEntry | null {
  const keys = new Map<string, string>();
  let inEntry = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      inEntry = line === '[Desktop Entry]';
      continue;
    }
    if (!inEntry) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    // Localized keys (`Name[ro]`) are left for later; the plain one is enough.
    if (key.includes('[')) continue;
    if (!keys.has(key)) keys.set(key, unescapeValue(line.slice(eq + 1).trim()));
  }
  if (keys.get('Type') !== 'Application') return null;
  if (keys.get('NoDisplay') === 'true' || keys.get('Hidden') === 'true')
    return null;
  const name = keys.get('Name');
  const exec = keys.get('Exec');
  if (!name || !exec) return null;
  return {
    name,
    comment: keys.get('Comment') ?? '',
    icon: keys.get('Icon') ?? '',
    exec,
  };
}

/**
 * Split an `Exec` value into an argv, as the spec says: arguments are
 * separated by spaces, a double-quoted one may hold spaces and escapes
 * `"`, `` ` ``, `$` and `\` with a backslash, and field codes (`%f`, `%u`,
 * `%F`, `%U` and the rest) are removed, since a Start entry passes no files
 * or URLs. `%%` is a percent sign. Null when the line is malformed (an
 * unclosed quote) or names no program.
 */
export function execArgv(exec: string): string[] | null {
  const args: string[] = [];
  let cur = '';
  let started = false;
  let quoted = false;
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
      }
      // Every other field code expands to nothing here.
    } else {
      cur += c;
      started = true;
    }
  }
  if (quoted) return null;
  if (started) args.push(cur);
  return args.length > 0 && args[0] !== '' ? args : null;
}
