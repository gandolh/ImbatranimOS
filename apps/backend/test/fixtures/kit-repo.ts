import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * A kit suite (brief 163) as a real git repository: one build that writes two
 * kit apps' modules and the stylesheet they share into `dist/os`.
 *
 * - `main`: the whole build. `notes/app.mjs` and `hello/app.mjs` export `App`
 *   and import nothing: React, the JSX runtime and `@imbatranim/ui` are read
 *   from `globalThis.__imbatranimShared`, as a kit app's bundler leaves them
 *   when it marks those specifiers external. `kit.css` is the utilities the
 *   apps use that the desktop's own CSS may not have.
 * - `leave-out-style`: the same build, minus `kit.css`. Installing it must
 *   fail and keep the previous build live.
 *
 * The modules are what an office app does in miniature: Kit Notes opens a
 * text file (`system.fs` through the kit's `useOpenIntent` / `useFileDialog`),
 * edits it in a textarea, saves it back with `saveOverRead` (asking through
 * the kit's conflict dialog if it changed on disk), and asks before clearing
 * with the kit's ConfirmDialog. Kit Hello asked for no capability, and shows
 * what `useSystem()` says when it reaches for one. The e2e suite uses the
 * repository, and so does the dev-container walk:
 *
 *   node -e "require('./apps/backend/test/fixtures/kit-repo.ts').makeKitRepo('/tmp/kit')"
 */
export interface KitRepo {
  /** The commit whose build produces both apps and the stylesheet. */
  whole: string;
  /** The commit whose build leaves `kit.css` out. */
  leavesOutStyle: string;
}

/** What every module of the build starts with: the shared modules, read as it evaluates. */
const PRELUDE = `const shared = globalThis.__imbatranimShared;
if (!shared) throw new Error('This is a kit app: it runs only in an ImbatranimOS desktop that shares its kit.');
const React = shared.modules['react'];
const { jsx, jsxs } = shared.modules['react/jsx-runtime'];
const Kit = shared.modules['@imbatranim/ui'];
`;

const NOTES = `${PRELUDE}
const { useCallback, useEffect, useState } = React;
const { Button, fileName, saveOverRead, useConfirm, useFileConflict, useFileDialog, useOpenIntent, useSystem } = Kit;

export function App({ windowId, host }) {
  const system = useSystem();
  const opened = useOpenIntent();
  const { openFile } = useFileDialog();
  const conflict = useFileConflict();
  const { confirm, confirmDialog } = useConfirm();
  const [text, setText] = useState('');
  const [version, setVersion] = useState(null);
  const [status, setStatus] = useState('No file open. Open a text file to edit it.');
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (!opened) return;
    let live = true;
    system.fs.readWithVersion(opened.root, opened.path).then(
      (file) => {
        if (!live) return;
        setText(new TextDecoder().decode(file.bytes));
        setVersion(file.version);
        setStatus('Read ' + opened.path);
      },
      (err) => live && setStatus('Could not read it: ' + err.message),
    );
    return () => { live = false; };
  }, [system, opened, reads]);

  const save = useCallback(async () => {
    if (!opened) return;
    const name = fileName(opened.path);
    try {
      const result = await saveOverRead(
        system.fs,
        { root: opened.root, path: opened.path, name },
        new TextEncoder().encode(text),
        version,
        conflict.ask,
      );
      if (result.outcome === 'saved') {
        setVersion(result.version);
        setStatus('Saved ' + name);
      } else if (result.outcome === 'reload') {
        setReads((n) => n + 1);
      } else {
        setStatus('Not saved.');
      }
    } catch (err) {
      setStatus('Could not save it: ' + err.message);
    }
  }, [system, opened, text, version, conflict.ask]);

  const clear = useCallback(async () => {
    const ok = await confirm({
      title: 'Clear the note?',
      message: 'This empties the editor. The file changes only when you save.',
      confirmLabel: 'Clear',
      destructive: true,
    });
    if (ok) setText('');
  }, [confirm]);

  return jsxs('div', {
    className: 'bg-surface text-on-surface font-ui flex h-full flex-col',
    'data-kit-notes': windowId,
    children: [
      jsxs('div', {
        className: 'border-outline-variant flex items-center gap-1.5 border-b px-2 py-1.5',
        children: [
          jsx(Button, {
            size: 'sm',
            onClick: () => void openFile({ title: 'Open a note', extensions: ['txt', 'md'] }),
            children: 'Open…',
          }),
          jsx(Button, { size: 'sm', variant: 'primary', disabled: !opened, onClick: () => void save(), children: 'Save' }),
          jsx(Button, { size: 'sm', variant: 'ghost', onClick: () => void clear(), children: 'Clear…' }),
        ],
      }),
      jsx('div', {
        className: 'border-heritage bg-tertiary-container text-on-tertiary-container border-l-4 px-2 py-1.5 text-[11px]',
        'data-kit-banner': '',
        children: 'Kit app · shared kit ' + shared.version + ' · ' + host.appId,
      }),
      jsx('textarea', {
        className: 'font-content min-h-0 flex-1 resize-none bg-transparent p-3 text-[13px] leading-relaxed outline-none',
        'aria-label': 'Note',
        value: text,
        onChange: (e) => setText(e.target.value),
      }),
      jsx('div', {
        className: 'border-outline-variant text-on-surface-variant border-t px-2 py-1 text-[11px]',
        'data-status': '',
        role: 'status',
        children: status,
      }),
      confirmDialog,
      conflict.dialog,
    ],
  });
}
`;

const HELLO = `${PRELUDE}
const { useState } = React;
const { Button, useSystem } = Kit;

export function App({ host }) {
  const system = useSystem();
  const [said, setSaid] = useState('');
  const reach = () => {
    try {
      system.notify({ title: 'Hello' });
      setSaid('Notified.');
    } catch (err) {
      setSaid(err.message);
    }
  };
  return jsxs('div', {
    className: 'bg-surface text-on-surface font-ui flex h-full flex-col gap-1.5 p-3 text-[13px]',
    'data-kit-hello': '',
    children: [
      jsx('div', {
        className: 'border-heritage bg-tertiary-container text-on-tertiary-container border-l-4 px-2 py-1.5 text-[11px]',
        children: 'Kit app · shared kit ' + shared.version + ' · ' + host.appId,
      }),
      jsx('p', { children: 'This app asked for no capability.' }),
      jsx('div', { children: jsx(Button, { size: 'sm', onClick: reach, children: 'Send a notification' }) }),
      jsx('p', { className: 'text-on-surface-variant text-[11px]', 'data-said': '', children: said }),
    ],
  });
}
`;

/**
 * What a Tailwind 4 build of the apps' sources leaves, utilities only (no
 * preflight, no theme): the classes the apps use that the desktop's own CSS
 * may not hold, in the desktop's `utilities` layer, naming the desktop's
 * tokens. Hand-written here, so plain `var()` with no fallback: the walk
 * shows `--color-heritage` resolving, which the desktop's CSS did not define
 * before its tokens became static (brief 163).
 */
const KIT_CSS = `@layer utilities {
  .border-l-4 { border-left-style: solid; border-left-width: 4px; }
  .border-heritage { border-color: var(--color-heritage); }
  .bg-tertiary-container { background-color: var(--color-tertiary-container); }
  .text-on-tertiary-container { color: var(--color-on-tertiary-container); }
  .gap-1\\.5 { gap: calc(var(--spacing) * 1.5); }
  .py-1\\.5 { padding-block: calc(var(--spacing) * 1.5); }
  .text-\\[11px\\] { font-size: 11px; }
  .text-\\[13px\\] { font-size: 13px; }
}
`;

/** The build: argv `node build.mjs`, run from the repository's top. */
function buildScript(withStyle: boolean): string {
  return `import { mkdirSync, writeFileSync } from 'fs';
const files = ${JSON.stringify({
    'dist/os/notes/app.mjs': NOTES,
    'dist/os/hello/app.mjs': HELLO,
    ...(withStyle ? { 'dist/os/kit.css': KIT_CSS } : {}),
  })};
for (const [path, text] of Object.entries(files)) {
  mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
  writeFileSync(path, text);
}
console.log('built ' + Object.keys(files).length + ' files');
`;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  }).trim();
}

/** Write the repository into the empty (or missing) directory `dir`. */
export function makeKitRepo(dir: string): KitRepo {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'build.mjs'), buildScript(true));
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'two kit apps, one stylesheet');
  const whole = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-q', '-b', 'leave-out-style');
  writeFileSync(join(dir, 'build.mjs'), buildScript(false));
  git(dir, 'commit', '-qam', 'the build forgets the stylesheet');
  const leavesOutStyle = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-q', 'main');
  return { whole, leavesOutStyle };
}

/**
 * The version 2 descriptor for this repository: `kit`, built against shared
 * kit 1, with `kit-notes` (several windows, opens `.kitnote`, reads and writes
 * files) and `kit-hello` (one window, no capabilities), both listing `kit.css`.
 */
export function kitDescriptor(
  repo: string,
  ref: string,
  extra: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 2,
    id: 'kit',
    name: 'Kit Fixture',
    description: 'Two kit apps from one build, sharing the desktop’s kit.',
    source: { repo, ref },
    type: 'static',
    runtime: 'native',
    build: { command: ['node', 'build.mjs'], output: 'dist/os' },
    sharedKit: 1,
    apps: [
      {
        id: 'kit-notes',
        name: 'Kit Notes',
        description: 'Edits a text file with the desktop’s own kit.',
        meta: ['fixture'],
        entry: 'notes/app.mjs',
        styles: ['kit.css'],
        window: {
          defaultSize: { w: 560, h: 400 },
          minSize: { w: 320, h: 240 },
        },
        icon: 'file-pen',
        opens: ['kitnote'],
        multiInstance: true,
        capabilities: ['fs', 'intents'],
      },
      {
        id: 'kit-hello',
        name: 'Kit Hello',
        description: 'Asks for nothing.',
        entry: 'hello/app.mjs',
        styles: ['kit.css'],
        window: {
          defaultSize: { w: 420, h: 260 },
          minSize: { w: 320, h: 200 },
        },
        icon: 'briefcase',
        capabilities: [],
      },
    ],
    minSystemVersion: 2,
    ...extra,
  };
}
