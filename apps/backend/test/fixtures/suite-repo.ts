import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * A two-app suite (brief 162) as a real git repository: one build that
 * writes both apps' modules and the chunk they share into `dist/os`.
 *
 * - `main`: the whole build. `alpha/app.mjs` and `beta/app.mjs` both import
 *   `../shared.mjs`, which only works because the whole output is served.
 * - `leave-out-beta`: the same build, minus `beta/app.mjs`. Installing it
 *   must fail and keep the previous build live.
 *
 * Both commits are branch tips, so either can be fetched by its id.
 *
 * The modules are plain JS the desktop can run: alpha shows the file it was
 * opened with (`intents` + `fs`), beta only its name. `server.mjs` is there
 * for a service suite. The e2e suite uses the repository, and so does the
 * dev-container walk:
 *
 *   node -e "require('./apps/backend/test/fixtures/suite-repo.ts').makeSuiteRepo('/tmp/suite')"
 */
export interface SuiteRepo {
  /** The commit whose build produces both apps. */
  whole: string;
  /** The commit whose build leaves `beta/app.mjs` out. */
  leavesOutBeta: string;
}

const SHARED = `export function paint(container, title, host) {
  container.style.cssText =
    'height:100%;box-sizing:border-box;padding:16px;overflow:auto;' +
    'font:13px system-ui,sans-serif;color:#e8e8e8;background:#111';
  const heading = document.createElement('h1');
  heading.textContent = title;
  heading.style.cssText = 'font-size:18px;margin:0 0 8px';
  const where = document.createElement('p');
  where.textContent = host.appId + ' from ' + host.assetBase;
  const log = document.createElement('pre');
  log.dataset.fixtureLog = '';
  log.style.cssText = 'white-space:pre-wrap;margin-top:12px';
  container.dataset.fixtureApp = host.appId;
  container.append(heading, where, log);
  return { say: (line) => { log.textContent += line + '\\n'; } };
}
`;

const ALPHA = `import { paint } from '../shared.mjs';

const listening = new WeakMap();

export function mount(container, system, host) {
  const view = paint(container, 'Alpha', host);
  view.say('Ready.');
  const off = system.intents.onIntent((payload) => {
    if (!payload || typeof payload.openPath !== 'string') return;
    view.say('Opened ' + payload.openPath);
    system.fs
      .read(payload.root, payload.openPath)
      .then((bytes) => view.say(new TextDecoder().decode(bytes).slice(0, 400)))
      .catch((err) => view.say('Could not read it: ' + err.message));
  });
  listening.set(container, off);
}

export function unmount(container) {
  listening.get(container)?.();
  listening.delete(container);
}
`;

const BETA = `import { paint } from '../shared.mjs';

export function mount(container, system, host) {
  paint(container, 'Beta', host).say('Ready.');
}

export function unmount() {}
`;

/** For a service suite: one server, shared by every app of the descriptor. */
const SERVER = `import { createServer } from 'http';
createServer((req, res) => {
  if (req.url === '/health') { res.end('ok'); return; }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ url: req.url }));
}).listen(Number(process.env.PORT), process.env.HOST);
`;

/** The build: argv `node build.mjs`, run from the repository's top. */
function buildScript(withBeta: boolean): string {
  return `import { mkdirSync, writeFileSync } from 'fs';
const files = ${JSON.stringify({
    'dist/os/shared.mjs': SHARED,
    'dist/os/alpha/app.mjs': ALPHA,
    ...(withBeta ? { 'dist/os/beta/app.mjs': BETA } : {}),
  })};
for (const [path, text] of Object.entries(files)) {
  mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
  writeFileSync(path, text);
}
writeFileSync('source-only.txt', 'source, not output');
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
export function makeSuiteRepo(dir: string): SuiteRepo {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'build.mjs'), buildScript(true));
  writeFileSync(join(dir, 'server.mjs'), SERVER);
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'two apps, one build');
  const whole = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-q', '-b', 'leave-out-beta');
  writeFileSync(join(dir, 'build.mjs'), buildScript(false));
  git(dir, 'commit', '-qam', 'the build forgets beta');
  const leavesOutBeta = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-q', 'main');
  return { whole, leavesOutBeta };
}

/**
 * The version 2 descriptor for this repository: `suite`, with `suite-alpha`
 * (several windows, opens `.md`) and `suite-beta` (one window).
 */
export function suiteDescriptor(
  repo: string,
  ref: string,
  extra: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 2,
    id: 'suite',
    name: 'Suite',
    description: 'Two apps from one build.',
    source: { repo, ref },
    type: 'static',
    runtime: 'native',
    build: { command: ['node', 'build.mjs'], output: 'dist/os' },
    apps: [
      {
        id: 'suite-alpha',
        name: 'Alpha',
        description: 'Opens Markdown files, in as many windows as you like.',
        meta: ['fixture'],
        entry: 'alpha/app.mjs',
        window: {
          defaultSize: { w: 520, h: 360 },
          minSize: { w: 320, h: 240 },
        },
        icon: 'file-text',
        opens: ['md'],
        multiInstance: true,
        capabilities: ['fs', 'intents'],
      },
      {
        id: 'suite-beta',
        name: 'Beta',
        description: 'One window.',
        entry: 'beta/app.mjs',
        icon: 'table',
        capabilities: [],
      },
    ],
    minSystemVersion: 2,
    ...extra,
  };
}
