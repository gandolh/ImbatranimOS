import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * A kit app that runs WebAssembly, with threads, as a real git repository:
 * one build that writes `dist/os/threads/` with the app's module, a worker
 * and `add.wasm` beside them.
 *
 * - `add.wasm` exports `add(a, b)` on two i32s. It is 41 bytes written out
 *   below by hand (the text format is in {@link ADD_WAT}), because a fixture
 *   has no npm package to take it from. A catalog app's WASM follows the
 *   reviewers' rule in marketplace/README.md instead.
 * - The page compiles it and shows `add(2, 3)`. That needs
 *   `'wasm-unsafe-eval'` in the desktop's CSP.
 * - It hands a worker a shared `WebAssembly.Memory` with 7 in its second
 *   cell. The worker compiles `add.wasm` under its own CSP (the worker
 *   script's response carries the backend's, even in dev, where Vite serves
 *   the page with none), writes `add(7, 35)` into the first cell and says
 *   it is done. The page reads 42 from its own view of the memory, which no
 *   message carried. That needs `crossOriginIsolated`.
 * - `crossOriginIsolated` itself is shown at the top.
 *
 * Each check is a row with `data-check` (`isolated`, `page`, `worker`) and
 * `data-state` (`running`, `ok`, `failed`). The e2e suite uses the
 * repository, and so does the dev-container walk:
 *
 *   node -e "require('./apps/backend/test/fixtures/wasm-repo.ts').makeWasmRepo('/tmp/wasm')"
 */
export interface WasmRepo {
  /** The commit whose build writes the app, its worker and `add.wasm`. */
  whole: string;
}

/** `add.wasm` in the WebAssembly text format. */
export const ADD_WAT = `(module
  (func (export "add") (param i32 i32) (result i32)
    local.get 0
    local.get 1
    i32.add))`;

/** {@link ADD_WAT}, assembled. */
export const ADD_WASM = Uint8Array.from([
  // "\0asm", version 1
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  // type section: one type, (i32, i32) -> i32
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
  // function section: one function, of type 0
  0x03, 0x02, 0x01, 0x00,
  // export section: "add" is function 0
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
  // code section: local.get 0, local.get 1, i32.add, end
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

/** The shared modules, read as the module evaluates (see kit-repo.ts). */
const PRELUDE = `const shared = globalThis.__imbatranimShared;
if (!shared) throw new Error('This is a kit app: it runs only in an ImbatranimOS desktop that shares its kit.');
const React = shared.modules['react'];
const { jsx, jsxs } = shared.modules['react/jsx-runtime'];
`;

const APP = `${PRELUDE}
const { useEffect, useState } = React;

const WASM = new URL('./add.wasm', import.meta.url);
const WORKER = new URL('./worker.mjs', import.meta.url);

async function addOnPage() {
  const { instance } = await WebAssembly.instantiateStreaming(fetch(WASM));
  return instance.exports.add(2, 3);
}

function addInWorker(signal) {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
  const cells = new Int32Array(memory.buffer);
  Atomics.store(cells, 1, 7);
  const worker = new Worker(WORKER, { type: 'module' });
  signal.addEventListener('abort', () => worker.terminate());
  return new Promise((resolve, reject) => {
    worker.onerror = (e) => reject(new Error(e.message || 'The worker did not start.'));
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data && e.data.error) reject(new Error(e.data.error));
      else resolve(Atomics.load(cells, 0));
    };
    worker.postMessage({ memory, wasm: WASM.href });
  });
}

function message(err) {
  return String((err && err.message) || err);
}

function Row({ check, label, result }) {
  return jsxs('div', {
    'data-check': check,
    'data-state': result.state,
    style: { display: 'flex', justifyContent: 'space-between', gap: 12 },
    children: [
      jsx('span', { children: label }),
      jsx('strong', {
        className: result.state === 'failed' ? 'text-error' : undefined,
        children: result.state === 'running' ? '…' : result.text,
      }),
    ],
  });
}

export function App({ host }) {
  const [page, setPage] = useState({ state: 'running' });
  const [worker, setWorker] = useState({ state: 'running' });

  useEffect(() => {
    const stop = new AbortController();
    const settle = (set, expected) => [
      (value) => !stop.signal.aborted && set({ state: value === expected ? 'ok' : 'failed', text: String(value) }),
      (err) => !stop.signal.aborted && set({ state: 'failed', text: message(err) }),
    ];
    addOnPage().then(...settle(setPage, 5));
    try {
      addInWorker(stop.signal).then(...settle(setWorker, 42));
    } catch (err) {
      setWorker({ state: 'failed', text: message(err) });
    }
    return () => stop.abort();
  }, []);

  const isolated = globalThis.crossOriginIsolated === true;
  return jsxs('div', {
    className: 'bg-surface text-on-surface font-ui flex h-full flex-col',
    style: { gap: 8, padding: 12, fontSize: 13 },
    'data-wasm-threads': '',
    children: [
      jsx(Row, {
        check: 'isolated',
        label: 'crossOriginIsolated',
        result: { state: isolated ? 'ok' : 'failed', text: String(isolated) },
      }),
      jsx(Row, { check: 'page', label: 'add(2, 3) on the page', result: page }),
      jsx(Row, { check: 'worker', label: 'add(7, 35) in a worker, read from shared memory', result: worker }),
      jsx('p', {
        className: 'text-on-surface-variant',
        style: { fontSize: 11, margin: 0 },
        children: host.appId + ' · ' + host.assetBase,
      }),
    ],
  });
}
`;

const WORKER = `self.onmessage = async (event) => {
  const { memory, wasm } = event.data;
  try {
    const cells = new Int32Array(memory.buffer);
    const { instance } = await WebAssembly.instantiateStreaming(fetch(wasm));
    Atomics.store(cells, 0, instance.exports.add(Atomics.load(cells, 1), 35));
    Atomics.notify(cells, 0);
    self.postMessage({ done: true });
  } catch (err) {
    self.postMessage({ error: String((err && err.message) || err) });
  }
};
`;

/** The build: argv `node build.mjs`, run from the repository's top. */
function buildScript(): string {
  return `import { mkdirSync, writeFileSync } from 'fs';
mkdirSync('dist/os/threads', { recursive: true });
writeFileSync('dist/os/threads/app.mjs', ${JSON.stringify(APP)});
writeFileSync('dist/os/threads/worker.mjs', ${JSON.stringify(WORKER)});
writeFileSync('dist/os/threads/add.wasm', Uint8Array.from(${JSON.stringify([...ADD_WASM])}));
console.log('built 3 files');
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
export function makeWasmRepo(dir: string): WasmRepo {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'build.mjs'), buildScript());
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'a kit app with WebAssembly and a worker');
  return { whole: git(dir, 'rev-parse', 'HEAD') };
}

/**
 * The version 2 descriptor for this repository: `wasm`, built against shared
 * kit 1, with one app, `wasm-threads`, that asks for no capability.
 */
export function wasmDescriptor(
  repo: string,
  ref: string,
  extra: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 2,
    id: 'wasm',
    name: 'WASM Fixture',
    description: 'A kit app running WebAssembly on the page and in a worker.',
    source: { repo, ref },
    type: 'static',
    runtime: 'native',
    build: { command: ['node', 'build.mjs'], output: 'dist/os' },
    sharedKit: 1,
    apps: [
      {
        id: 'wasm-threads',
        name: 'WASM Threads',
        description: 'add(2, 3) from a .wasm, and a worker sharing memory.',
        meta: ['fixture'],
        entry: 'threads/app.mjs',
        window: {
          defaultSize: { w: 480, h: 240 },
          minSize: { w: 360, h: 200 },
        },
        icon: 'puzzle',
        capabilities: [],
      },
    ],
    minSystemVersion: 2,
    ...extra,
  };
}
