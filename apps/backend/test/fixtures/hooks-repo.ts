import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Kit apps that declare hooks, as a real git repository: one build that
 * writes two kit apps' modules into `dist/os`.
 *
 * - **Ticker** (`kit-ticker`) declares `background` and `commandSources`. Its
 *   `Background` counts a tick every five seconds with no window open; its
 *   command source shows the count in the palette and Start's search
 *   ("ticker"), sends a notification with it, and can make the service throw
 *   on its next tick, which the desktop contains. The window shows the same
 *   count: the module is evaluated once, so the three share its state.
 * - **Hookless** (`kit-hookless`) declares `background` and exports only
 *   `App`: the desktop refuses its hook by name and still opens its window.
 *
 * The e2e suite uses the repository, and so does the dev-container walk:
 *
 *   node -e "require('./apps/backend/test/fixtures/hooks-repo.ts').makeHooksRepo('/tmp/hooks')"
 */

/** What every module of the build starts with: the shared modules, read as it evaluates. */
const PRELUDE = `const shared = globalThis.__imbatranimShared;
if (!shared) throw new Error('This is a kit app: it runs only in an ImbatranimOS desktop that shares its kit.');
const React = shared.modules['react'];
const { jsx, jsxs } = shared.modules['react/jsx-runtime'];
const Kit = shared.modules['@imbatranim/ui'];
`;

const TICKER = `${PRELUDE}
const { useEffect, useState } = React;
const { Button, useSystem } = Kit;

const TICK_MS = 5000;
const GROUP = 'Ticker';

/** One module, evaluated once: the service, the command source and the window share it. */
const state = { ticks: 0, running: false, failNext: false, notify: null, listeners: new Set() };
const changed = () => state.listeners.forEach((listener) => listener());

/** Mounted by the desktop with no window, from sign-in while Ticker is enabled. */
export function Background() {
  const system = useSystem();
  const [, fail] = useState(null);
  useEffect(() => {
    state.running = true;
    state.notify = (input) => system.notify(input);
    changed();
    const timer = setInterval(() => {
      if (state.failNext) {
        state.failNext = false;
        // Thrown while rendering, where the desktop's boundary catches it.
        fail(() => {
          throw new Error('Asked to fail from the command palette');
        });
        return;
      }
      state.ticks += 1;
      changed();
    }, TICK_MS);
    return () => {
      clearInterval(timer);
      state.running = false;
      state.notify = null;
      changed();
    };
  }, [system]);
  return null;
}

export const commandSources = [
  {
    group: GROUP,
    async search(query) {
      const q = query.trim().toLowerCase();
      const items = [
        {
          id: 'count',
          label: 'Ticker: ' + state.ticks + ' ticks so far',
          subtitle: state.running
            ? 'Counting in the background, with no window open'
            : 'The background service is not running',
          group: GROUP,
        },
        {
          id: 'fail',
          label: 'Ticker: fail on the next tick',
          subtitle: 'The desktop hides the service and says so once',
          group: GROUP,
        },
      ];
      return items.filter((item) => !q || item.label.toLowerCase().includes(q));
    },
    activate(item) {
      if (item.id === 'fail') {
        state.failNext = true;
        return;
      }
      if (state.notify) state.notify({ title: 'Ticker has ticked ' + state.ticks + ' times' });
    },
  },
];

export function App({ host }) {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }, []);
  return jsxs('div', {
    className: 'bg-surface text-on-surface font-ui flex h-full flex-col gap-2 p-3 text-[13px]',
    'data-kit-ticker': '',
    children: [
      jsx('p', { 'data-ticks': '', children: state.ticks + ' ticks so far (' + host.appId + ')' }),
      jsx('p', {
        className: 'text-on-surface-variant text-[11px]',
        children: state.running
          ? 'The background service is running. Close this window: it keeps counting.'
          : 'The background service is not running. Is Ticker turned off in Settings → Apps?',
      }),
      jsx('div', {
        children: jsx(Button, {
          size: 'sm',
          onClick: () => {
            state.failNext = true;
          },
          children: 'Fail on the next tick',
        }),
      }),
    ],
  });
}
`;

const HOOKLESS = `${PRELUDE}
export function App() {
  return jsx('div', {
    className: 'bg-surface text-on-surface font-ui flex h-full items-center p-3 text-[13px]',
    'data-kit-hookless': '',
    children: 'This app declares a background service and exports none.',
  });
}
`;

/** The build: argv `node build.mjs`, run from the repository's top. */
function buildScript(): string {
  return `import { mkdirSync, writeFileSync } from 'fs';
const files = ${JSON.stringify({
    'dist/os/ticker/app.mjs': TICKER,
    'dist/os/hookless/app.mjs': HOOKLESS,
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

/** Write the repository into the empty (or missing) directory `dir`. Resolves its one commit. */
export function makeHooksRepo(dir: string): string {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'build.mjs'), buildScript());
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'a kit app with hooks, and one missing its export');
  return git(dir, 'rev-parse', 'HEAD');
}

/**
 * The version 2 descriptor for this repository, `kit-hooks`, built against
 * shared kit 1: `kit-ticker` declares both hooks and asks for `notify`;
 * `kit-hookless` declares `background` and asks for nothing.
 */
export function hooksDescriptor(
  repo: string,
  ref: string,
  extra: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 2,
    id: 'kit-hooks',
    name: 'Hooks Fixture',
    description: 'A kit app that runs with no window, and one that cannot.',
    source: { repo, ref },
    type: 'static',
    runtime: 'native',
    build: { command: ['node', 'build.mjs'], output: 'dist/os' },
    sharedKit: 1,
    apps: [
      {
        id: 'kit-ticker',
        name: 'Ticker',
        description: 'Counts in the background and answers in the palette.',
        meta: ['fixture'],
        entry: 'ticker/app.mjs',
        window: {
          defaultSize: { w: 420, h: 240 },
          minSize: { w: 320, h: 200 },
        },
        icon: 'rocket',
        capabilities: ['notify'],
        background: true,
        commandSources: true,
      },
      {
        id: 'kit-hookless',
        name: 'Hookless',
        description: 'Declares a background service it does not export.',
        meta: ['fixture'],
        entry: 'hookless/app.mjs',
        window: {
          defaultSize: { w: 420, h: 200 },
          minSize: { w: 320, h: 160 },
        },
        icon: 'puzzle',
        capabilities: [],
        background: true,
      },
    ],
    minSystemVersion: 2,
    ...extra,
  };
}
