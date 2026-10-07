import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vm from 'node:vm';
import {
  MessageChannel,
  receiveMessageOnPort,
  type MessagePort,
} from 'node:worker_threads';

/*
 * runtime.js (brief 158, contracts C and D) run in jsdom, dressed as the
 * sandboxed frame: `self.origin` reads 'null' and `window.parent` is a fake
 * desktop that records postMessage. The desktop's end of the port is a Node
 * MessageChannel, read synchronously with receiveMessageOnPort.
 *
 * jsdom has no module scripts, so the file is evaluated as a classic script
 * (it has no static import/export for exactly this reason). Its `import()` of
 * the app goes to Node's own ESM loader, so a mount test serves the frame
 * from a file: URL whose `app/` directory holds fixture modules. Those
 * modules run in Node's realm and reach the frame only through `container`.
 *
 * What only a browser can show: the CSP and the sandbox themselves, a worker
 * started from the blob bootstrap, and import() of an app over http(s) from
 * an opaque origin.
 */

type VirtualConsoleLike = {
  on(event: string, listener: (...args: unknown[]) => void): void;
};

type Appearance = { theme: 'dark' | 'light'; accent: string };

type FrameSystem = {
  readonly protocolVersion: number;
  readonly appId: string;
  readonly windowId: string | null;
  readonly window: {
    setTitle(title: string): void;
    requestClose(): void;
    focus(): void;
    hide(): void;
    show(): void;
    isFocused(): boolean;
    isVisible(): boolean;
    onCloseRequest(guard: () => boolean | Promise<boolean>): () => void;
  };
  readonly appearance: { get(): Appearance };
  readonly fs?: unknown;
  notify(input: {
    title: string;
    body?: string;
    level?: string;
    actions?: { label: string; payload: unknown }[];
  }): string;
  on(event: string, cb: (payload: unknown) => void): () => void;
};

type Captured = {
  container: HTMLElement;
  system: FrameSystem;
  host: { appId: string; assetBase: string; server: null };
};

type FrameWindow = Window &
  typeof globalThis & {
    __captured?: Captured;
    __unmounted?: HTMLElement;
    __finishMount?: () => void;
  };

type JsdomModule = {
  JSDOM: new (
    html: string,
    options: {
      url: string;
      runScripts: 'outside-only';
      virtualConsole: VirtualConsoleLike;
    },
  ) => { window: FrameWindow; getInternalVMContext(): vm.Context };
  VirtualConsole: new () => VirtualConsoleLike;
};

/**
 * jsdom comes from core's devDependencies, hoisted to the workspace root, and
 * ships no types: the shape above is the part this file uses. Some of its
 * dependencies are ESM-only, which Jest's CommonJS registry cannot require, so
 * it is loaded by Node's own loader instead.
 */
async function loadJsdom(): Promise<JsdomModule> {
  const url = pathToFileURL(require.resolve('jsdom')).href;
  const script = new vm.Script(`import(${JSON.stringify(url)})`, {
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });
  const loaded = (await script.runInThisContext()) as { default: JsdomModule };
  return loaded.default;
}

let JSDOM: JsdomModule['JSDOM'];
let VirtualConsole: JsdomModule['VirtualConsole'];

type Message = { t?: string; [key: string]: unknown };

const RUNTIME = fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8');
const HTTP_BASE = 'http://localhost:3000/api/marketplace/sandbox/tok/';
const NOTICE = 'This page runs inside an ImbatranimOS window.';
const INIT = {
  appId: 'x-0123456789ab',
  windowId: 'w-1',
  protocolVersion: 2,
  capabilities: ['notify'],
  appearance: { theme: 'dark', accent: '#3b82f6' },
  focused: true,
  visible: true,
};

const FIXTURES: Record<string, string> = {
  'capture.mjs': `
    export function mount(container, system, host) {
      container.ownerDocument.defaultView.__captured = { container, system, host };
    }
    export function unmount(container) {
      container.ownerDocument.defaultView.__unmounted = container;
    }`,
  'no-mount.mjs': `export const name = 'nothing to mount';`,
  'throws.mjs': `export function mount() { throw new Error('mount exploded'); }`,
  'pending.mjs': `
    export function mount(container) {
      return new Promise((resolve) => {
        container.ownerDocument.defaultView.__finishMount = resolve;
      });
    }`,
};

let tmp: string;
let fileBase: string;

beforeAll(async () => {
  ({ JSDOM, VirtualConsole } = await loadJsdom());
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imb-sandbox-runtime-'));
  const dir = path.join(tmp, 'sandbox', 'tok');
  fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
  for (const [name, source] of Object.entries(FIXTURES)) {
    fs.writeFileSync(path.join(dir, 'app', name), source);
  }
  fileBase = `${pathToFileURL(dir).href}/`;
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const open: Frame[] = [];

afterEach(() => {
  for (const frame of open.splice(0)) frame.close();
});

type Frame = {
  window: FrameWindow;
  parent: { postMessage: jest.Mock };
  warnings: string[];
  evaluate<T>(code: string): T;
  /** Deliver a window message to the frame as if `source` posted it. */
  deliver(data: unknown, source: unknown, ports: MessagePort[]): void;
  /** Send sandbox-init from the parent; returns the desktop's end of the port. */
  init(init?: Record<string, unknown>): MessagePort;
  /** Take every message the runtime posted on `port` not taken yet. */
  drain(port: MessagePort): Message[];
  /** Wait for a message matching `match` on `port`, and take only it. */
  next(port: MessagePort, match: (m: Message) => boolean): Promise<Message>;
  close(): void;
};

function load(options: {
  url: string;
  entry?: string;
  sandboxed?: boolean;
  framed?: boolean;
  setup?: (win: FrameWindow) => void;
}): Frame {
  const {
    url,
    entry = 'app/capture.mjs',
    sandboxed = true,
    framed = true,
  } = options;
  const warnings: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('warn', (...args) =>
    warnings.push(args.map(String).join(' ')),
  );
  const dom = new JSDOM(
    `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta name="imb-entry" content="${entry}"></head><body></body></html>`,
    { url, runScripts: 'outside-only', virtualConsole },
  );
  const win = dom.window;
  const context = dom.getInternalVMContext();
  const parent = { postMessage: jest.fn() };
  if (sandboxed) {
    Object.defineProperty(win, 'origin', {
      configurable: true,
      get: () => 'null',
    });
  }
  if (framed) {
    Object.defineProperty(win, 'parent', {
      configurable: true,
      get: () => parent,
    });
  }
  options.setup?.(win);
  vm.runInContext(RUNTIME, context, {
    filename: 'runtime.js',
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });

  const ports: MessagePort[] = [];
  const buffers = new Map<MessagePort, Message[]>();
  // Everything the runtime posted on `port` and no one has taken yet.
  const pull = (port: MessagePort): Message[] => {
    const seen = buffers.get(port) ?? [];
    buffers.set(port, seen);
    for (;;) {
      const received = receiveMessageOnPort(port);
      if (!received) return seen;
      seen.push(received.message as Message);
    }
  };
  const deliver = (data: unknown, source: unknown, transfer: MessagePort[]) => {
    // jsdom's MessageEvent takes only its own windows and ports, and jsdom
    // has no MessageChannel. A plain Event carries the three fields the
    // runtime reads.
    const event = new win.Event('message');
    Object.defineProperties(event, {
      data: { value: data },
      source: { value: source },
      ports: { value: transfer },
    });
    win.dispatchEvent(event);
  };

  const frame: Frame = {
    window: win,
    parent,
    warnings,
    evaluate: <T>(code: string) => vm.runInContext(code, context) as T,
    deliver,
    init(init = INIT) {
      const channel = new MessageChannel();
      ports.push(channel.port1, channel.port2);
      deliver({ imb: 'sandbox-init', v: 1, init }, parent, [channel.port2]);
      return channel.port1;
    },
    drain: (port) => pull(port).splice(0),
    async next(port, match) {
      const deadline = Date.now() + 3000;
      for (;;) {
        const seen = pull(port);
        const index = seen.findIndex(match);
        if (index >= 0) return seen.splice(index, 1)[0];
        if (Date.now() > deadline) {
          throw new Error(`no matching message; saw ${JSON.stringify(seen)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    close() {
      for (const port of ports) port.close();
      win.close();
    },
  };
  open.push(frame);
  return frame;
}

/** A frame served from file:, initialised, with its app mounted. */
async function mounted(init: Record<string, unknown> = INIT) {
  const frame = load({ url: fileBase });
  const port = frame.init(init);
  await frame.next(port, (m) => m.t === 'mounted');
  const captured = frame.window.__captured;
  if (!captured) throw new Error('the fixture did not capture its mount');
  return { frame, port, ...captured };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

function readBlob(win: FrameWindow, blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new win.FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('could not read the blob'));
    reader.readAsText(blob);
  });
}

describe('sandbox runtime: refusal', () => {
  it('refuses to run when its origin is not opaque', () => {
    let storage: PropertyDescriptor | undefined;
    const frame = load({
      url: HTTP_BASE,
      sandboxed: false,
      setup(win) {
        storage = Object.getOwnPropertyDescriptor(win, 'localStorage');
      },
    });

    expect(frame.window.document.body.textContent).toBe(NOTICE);
    expect(frame.parent.postMessage).not.toHaveBeenCalled();
    // No shim was installed either.
    expect(storage && typeof storage.get).toBe('function');
    expect(
      Object.getOwnPropertyDescriptor(frame.window, 'localStorage'),
    ).toEqual(storage);
    frame.evaluate(`document.cookie = 'real=cookie'`);
    expect(frame.evaluate<string>('document.cookie')).toBe('real=cookie');
  });

  it('refuses to run as a top-level page, even with an opaque origin', () => {
    const frame = load({ url: HTTP_BASE, framed: false });

    expect(frame.window.document.body.textContent).toBe(NOTICE);
    expect(frame.parent.postMessage).not.toHaveBeenCalled();
  });
});

describe('sandbox runtime: shims', () => {
  it('turns an http(s) worker URL into a blob bootstrap, and passes blob: and data: through', async () => {
    const created: { url: unknown; options: unknown }[] = [];
    const blobs: Blob[] = [];
    class NativeWorker {
      constructor(url: unknown, options?: unknown) {
        created.push({ url, options });
      }
    }
    const frame = load({
      url: HTTP_BASE,
      setup(win) {
        Object.defineProperty(win, 'Worker', {
          configurable: true,
          writable: true,
          value: NativeWorker,
        });
        win.URL.createObjectURL = (blob: Blob) => {
          blobs.push(blob);
          return `blob:null/${blobs.length}`;
        };
      },
    });

    const worker = frame.evaluate<object>(
      `new Worker('workers/sim.js', { type: 'module' })`,
    );
    frame.evaluate(`new Worker(new URL('classic.js', document.baseURI))`);
    frame.evaluate(`new Worker('blob:null/given')`);
    frame.evaluate(`new Worker('data:text/javascript,1')`);

    expect(worker).toBeInstanceOf(NativeWorker);
    expect(frame.evaluate<string>('Worker.name')).toBe('Worker');
    expect(created.map((c) => c.url)).toEqual([
      'blob:null/1',
      'blob:null/2',
      'blob:null/given',
      'data:text/javascript,1',
    ]);
    // Chrome refuses a module worker from an opaque origin's blob, so the
    // bootstrap is classic and imports the module.
    expect(created[0].options).toEqual({ type: 'classic' });
    const moduleBootstrap = await readBlob(frame.window, blobs[0]);
    expect(moduleBootstrap).toContain(`import("${HTTP_BASE}workers/sim.js")`);
    expect(moduleBootstrap).not.toMatch(/^import "/m);
    expect(await readBlob(frame.window, blobs[1])).toBe(
      `importScripts("${HTTP_BASE}classic.js");\n`,
    );
  });

  it('holds messages that arrive while a module worker loads, and replays them in order', async () => {
    const NativeWorker = function NativeWorker(
      this: object,
    ) {} as unknown as typeof Worker;
    const blobs: Blob[] = [];
    const frame = load({
      url: HTTP_BASE,
      setup(win) {
        Object.defineProperty(win, 'Worker', {
          configurable: true,
          writable: true,
          value: NativeWorker,
        });
        win.URL.createObjectURL = (blob: Blob) => {
          blobs.push(blob);
          return `blob:null/${blobs.length}`;
        };
      },
    });
    frame.evaluate(`new Worker('w.js', { type: 'module' })`);
    const source = await readBlob(frame.window, blobs[0]);

    // Run the bootstrap against a stand-in worker scope. Its import() is
    // replaced by one we settle by hand, standing for the module loading.
    const scope = new frame.window.EventTarget() as EventTarget &
      Record<string, unknown>;
    let settle!: () => void;
    const loading = new Promise<void>((resolve) => (settle = resolve));
    // The bootstrap is evaluated on purpose: it is the code under test.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = new Function(
      'self',
      'MessageEvent',
      '__import',
      source.replace('import(', '__import('),
    ) as (...args: unknown[]) => unknown;
    run(scope, frame.window.MessageEvent, () => loading);

    const post = (data: unknown) =>
      scope.dispatchEvent(new frame.window.MessageEvent('message', { data }));
    post('first');
    post('second');

    // The module runs and sets its listener; nothing reached it early.
    const got: unknown[] = [];
    scope.addEventListener('message', (e) =>
      got.push((e as MessageEvent).data),
    );
    settle();
    await loading;
    await Promise.resolve();
    expect(got).toEqual(['first', 'second']);

    post('third');
    expect(got).toEqual(['first', 'second', 'third']);
  });

  it('takes WebRTC away, for good', () => {
    const frame = load({
      url: HTTP_BASE,
      setup(win) {
        for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
          Object.defineProperty(win, name, {
            configurable: true,
            writable: true,
            value: function RTCPeerConnection() {},
          });
        }
      },
    });

    expect(() => frame.evaluate(`new RTCPeerConnection()`)).toThrow(
      /WebRTC is not available/,
    );
    expect(() => frame.evaluate(`new webkitRTCPeerConnection()`)).toThrow(
      /WebRTC is not available/,
    );
    // The app can't put a working one back.
    frame.evaluate(
      `try { window.RTCPeerConnection = function () {} } catch {}`,
    );
    expect(() => frame.evaluate(`new RTCPeerConnection()`)).toThrow(
      /WebRTC is not available/,
    );
  });

  it('makes SharedWorker throw a clear error', () => {
    const frame = load({
      url: HTTP_BASE,
      setup(win) {
        Object.defineProperty(win, 'SharedWorker', {
          configurable: true,
          writable: true,
          value: function SharedWorker() {},
        });
      },
    });

    expect(() => frame.evaluate(`new SharedWorker('x.js')`)).toThrow(
      /SharedWorker is not available/,
    );
  });

  it('replaces localStorage and sessionStorage with separate in-memory stores', () => {
    let original: Storage | undefined;
    const frame = load({
      url: HTTP_BASE,
      setup(win) {
        original = win.localStorage;
      },
    });

    const result = frame.evaluate<string>(`JSON.stringify((() => {
      localStorage.setItem('n', 42);
      localStorage.theme = 'dark';
      sessionStorage.setItem('only', 'session');
      const seen = {
        n: localStorage.getItem('n'),
        type: typeof localStorage.getItem('n'),
        prop: localStorage.n,
        theme: localStorage.getItem('theme'),
        missing: localStorage.getItem('missing'),
        length: localStorage.length,
        first: localStorage.key(0),
        outOfRange: localStorage.key(5),
        keys: Object.keys(localStorage),
        has: 'theme' in localStorage,
        isStorage: localStorage instanceof Storage,
        separate: localStorage.getItem('only'),
        session: sessionStorage.getItem('only'),
      };
      localStorage.removeItem('n');
      delete localStorage.theme;
      seen.afterRemove = localStorage.length;
      sessionStorage.clear();
      seen.afterClear = sessionStorage.length;
      return seen;
    })())`);

    expect(original).toBeDefined();
    expect(frame.window.localStorage).not.toBe(original);
    expect(JSON.parse(result)).toEqual({
      n: '42',
      type: 'string',
      prop: '42',
      theme: 'dark',
      missing: null,
      length: 2,
      first: 'n',
      outOfRange: null,
      keys: ['n', 'theme'],
      has: true,
      isStorage: true,
      separate: null,
      session: 'session',
      afterRemove: 0,
      afterClear: 0,
    });
  });

  it('makes document.cookie inert', () => {
    const frame = load({ url: HTTP_BASE });

    frame.evaluate(`document.cookie = 'session=stolen'`);

    expect(frame.evaluate<string>('document.cookie')).toBe('');
  });
});

describe('sandbox runtime: handshake', () => {
  it('posts sandbox-ready to its parent with target *', () => {
    const frame = load({ url: HTTP_BASE });

    expect(frame.parent.postMessage).toHaveBeenCalledTimes(1);
    expect(frame.parent.postMessage).toHaveBeenCalledWith(
      { imb: 'sandbox-ready', v: 1 },
      '*',
    );
  });

  it('tells its parent when its keyboard has gone, and only then', async () => {
    const frame = load({ url: HTTP_BASE });
    const doc = frame.window.document;
    let focused = true;
    doc.hasFocus = () => focused;
    const post = frame.parent.postMessage;
    post.mockClear();

    // A blur while the document keeps the keyboard (a click into its own
    // content) says nothing.
    frame.window.dispatchEvent(new frame.window.FocusEvent('blur'));
    await new Promise((r) => setTimeout(r, 5));
    expect(post).not.toHaveBeenCalled();

    focused = false;
    frame.window.dispatchEvent(new frame.window.FocusEvent('blur'));
    await new Promise((r) => setTimeout(r, 5));
    expect(post).toHaveBeenCalledWith({ imb: 'frame-blur' }, '*');
  });

  it('accepts sandbox-init only from its parent, with exactly one port, and only once', async () => {
    const frame = load({ url: fileBase });
    const init = { imb: 'sandbox-init', v: 1, init: INIT };
    const stranger = new MessageChannel();
    const portless = new MessageChannel();
    const twoPorts = new MessageChannel();
    const wrongVersion = new MessageChannel();

    frame.deliver(init, { postMessage() {} }, [stranger.port2]);
    frame.deliver(init, frame.parent, []);
    frame.deliver(init, frame.parent, [twoPorts.port1, twoPorts.port2]);
    frame.deliver({ ...init, v: 2 }, frame.parent, [wrongVersion.port2]);
    const port = frame.init();
    await frame.next(port, (m) => m.t === 'mounted');
    const later = frame.init();
    frame.window.__captured?.system.notify({ title: 'once' });

    expect(frame.drain(port)).toEqual([
      expect.objectContaining({ t: 'call', path: 'notify' }),
    ]);
    expect(frame.drain(later)).toEqual([]);
    expect(receiveMessageOnPort(stranger.port1)).toBeUndefined();
    expect(receiveMessageOnPort(wrongVersion.port1)).toBeUndefined();
    for (const c of [stranger, portless, twoPorts, wrongVersion]) {
      c.port1.close();
    }
  });

  it('reports failed for a malformed init', async () => {
    const frame = load({ url: fileBase });
    const port = frame.init({ ...INIT, capabilities: 'notify' });

    expect(await frame.next(port, (m) => m.t === 'failed')).toEqual({
      t: 'failed',
      message: 'The desktop sent a malformed sandbox-init.',
    });
  });
});

describe('sandbox runtime: mount', () => {
  it('mounts the entry into a full-size container with the system and host context', async () => {
    const { frame, container, system, host } = await mounted();

    expect(host).toEqual({
      appId: INIT.appId,
      assetBase: `${fileBase}app/`,
      server: null,
    });
    expect(container.parentElement).toBe(frame.window.document.body);
    expect(container.style.position).toBe('absolute');
    expect(
      ['top', 'right', 'bottom', 'left'].map((side) =>
        container.style.getPropertyValue(side),
      ),
    ).toEqual(['0px', '0px', '0px', '0px']);
    expect(system.protocolVersion).toBe(2);
    expect(system.appId).toBe(INIT.appId);
    expect(system.windowId).toBe(INIT.windowId);
  });

  it.each([
    ['the module does not load', 'app/missing.mjs', /missing\.mjs|Cannot find/],
    [
      'the module has no mount',
      'app/no-mount.mjs',
      /x-0123456789ab's module does not export mount\(container, system\)/,
    ],
    ['mount throws', 'app/throws.mjs', /^mount exploded$/],
  ])('reports failed when %s', async (_case, entry, message) => {
    const frame = load({ url: fileBase, entry });
    const port = frame.init();

    const failed = await frame.next(port, (m) => m.t === 'failed');

    expect(failed.message).toMatch(message);
    expect(frame.drain(port).some((m) => m.t === 'mounted')).toBe(false);
  });

  it('reports an uncaught error during mount as failed, and never mounted after it', async () => {
    const frame = load({ url: fileBase, entry: 'app/pending.mjs' });
    const port = frame.init();
    const win = frame.window;
    for (let i = 0; i < 300 && !win.__finishMount; i++) await tick();

    win.dispatchEvent(
      new win.ErrorEvent('error', {
        error: new Error('boom'),
        message: 'boom',
      }),
    );
    win.__finishMount?.();
    await tick();

    expect(frame.drain(port)).toEqual([{ t: 'failed', message: 'boom' }]);
  });

  it('does not report errors after the app is mounted', async () => {
    const { frame, port } = await mounted();
    const win = frame.window;

    win.dispatchEvent(new win.ErrorEvent('error', { message: 'later' }));
    const rejection = new win.Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', { value: new Error('later') });
    win.dispatchEvent(rejection);

    expect(frame.drain(port)).toEqual([]);
  });

  it("calls the module's unmount on unmount", async () => {
    const { frame, port, container } = await mounted();

    port.postMessage({ t: 'unmount' });
    for (let i = 0; i < 50 && !frame.window.__unmounted; i++) await tick();

    expect(frame.window.__unmounted).toBe(container);
  });
});

describe('sandbox runtime: the system handle', () => {
  it('notify returns an id at once and sends the input without its actions', async () => {
    const { frame, port, system } = await mounted();

    const id = system.notify({
      title: 'Saved',
      body: 'All good',
      level: 'success',
      actions: [{ label: 'Undo', payload: { undo: 1 } }],
    });
    const [call] = frame.drain(port);

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(call).toEqual({
      t: 'call',
      id: expect.any(Number) as number,
      path: 'notify',
      args: [{ title: 'Saved', body: 'All good', level: 'success' }],
    });

    port.postMessage({
      t: 'return',
      id: call.id,
      ok: false,
      error: 'too many',
    });
    await tick();

    expect(frame.warnings).toEqual([
      expect.stringContaining('system.notify failed: too many') as string,
    ]);
  });

  it('sends window calls fire-and-forget, and returns nothing', async () => {
    const { frame, port, system } = await mounted();

    const results = [
      system.window.setTitle('Town'),
      system.window.requestClose(),
      system.window.focus(),
      system.window.hide(),
      system.window.show(),
    ];
    const calls = frame.drain(port);

    expect(results).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(calls.map((c) => [c.t, c.path, c.args])).toEqual([
      ['call', 'window.setTitle', ['Town']],
      ['call', 'window.requestClose', []],
      ['call', 'window.focus', []],
      ['call', 'window.hide', []],
      ['call', 'window.show', []],
    ]);
    port.postMessage({ t: 'return', id: calls[0].id, ok: true, value: null });
    await tick();
    expect(frame.warnings).toEqual([]);
  });

  it('throws a scopeHandle-style error for a member the app did not ask for', async () => {
    const { system } = await mounted({ ...INIT, capabilities: [] });

    expect(() => system.notify({ title: 'no' })).toThrow(
      'x-0123456789ab did not ask for system.notify; add "notify" to the capabilities in its imbatranim.json',
    );
    expect(() => system.fs).toThrow(
      /^x-0123456789ab did not ask for system\.fs, and an app installed from a URL cannot have it$/,
    );
    for (const member of ['http', 'intents', 'shortcuts', 'schedule']) {
      expect(() => (system as Record<string, unknown>)[member]).toThrow(
        `did not ask for system.${member}`,
      );
    }
    // Always there, and an unknown member (a thenable check) is undefined.
    expect(system.window.isVisible()).toBe(true);
    expect(system.appearance.get()).toEqual(INIT.appearance);
    expect(typeof system.on).toBe('function');
    expect((system as Record<string, unknown>).then).toBeUndefined();
  });

  it('caches focus, visibility and appearance from events, before listeners run', async () => {
    const { port, system } = await mounted();
    const seen: unknown[] = [];
    system.on('blur', () => seen.push(['blur', system.window.isFocused()]));
    system.on('focus', () => seen.push(['focus', system.window.isFocused()]));
    system.on('visibility', (visible) =>
      seen.push(['visibility', visible, system.window.isVisible()]),
    );
    const stop = system.on('appearance-changed', (look) =>
      seen.push(['appearance', look, system.appearance.get()]),
    );
    const light = { theme: 'light', accent: '#ff0000' };

    expect(system.window.isFocused()).toBe(true);
    port.postMessage({ t: 'event', name: 'blur' });
    port.postMessage({ t: 'event', name: 'blur' }); // no change, no call
    port.postMessage({ t: 'event', name: 'visibility', payload: false });
    port.postMessage({ t: 'event', name: 'visibility', payload: 'no' });
    port.postMessage({
      t: 'event',
      name: 'appearance-changed',
      payload: light,
    });
    port.postMessage({
      t: 'event',
      name: 'appearance-changed',
      payload: { theme: 'pink' },
    });
    port.postMessage({ t: 'event', name: 'focus' });
    await tick();
    stop();
    port.postMessage({
      t: 'event',
      name: 'appearance-changed',
      payload: INIT.appearance,
    });
    await tick();

    expect(seen).toEqual([
      ['blur', false],
      ['visibility', false, false],
      ['appearance', light, light],
      ['focus', true],
    ]);
    expect(system.window.isFocused()).toBe(true);
    expect(system.window.isVisible()).toBe(false);
    expect(system.appearance.get()).toEqual(INIT.appearance);
  });

  it('answers close-ask through an async guard', async () => {
    const { frame, port, system } = await mounted();
    let verdict = false;
    const guard = () =>
      new Promise<boolean>((resolve) => setTimeout(() => resolve(verdict), 10));
    const answer = (id: number) =>
      frame.next(port, (m) => m.t === 'close-answer' && m.id === id);

    const unregister = system.window.onCloseRequest(guard);
    expect(frame.drain(port)).toEqual([{ t: 'close-guard', set: true }]);

    port.postMessage({ t: 'close-ask', id: 1 });
    expect(await answer(1)).toEqual({ t: 'close-answer', id: 1, allow: false });

    verdict = true;
    port.postMessage({ t: 'close-ask', id: 2 });
    expect(await answer(2)).toEqual({ t: 'close-answer', id: 2, allow: true });

    unregister();
    expect(frame.drain(port)).toEqual([{ t: 'close-guard', set: false }]);
    port.postMessage({ t: 'close-ask', id: 3 });
    expect(await answer(3)).toEqual({ t: 'close-answer', id: 3, allow: true });
  });

  it('keeps the window open when the guard throws, and a stale unregister does nothing', async () => {
    const { frame, port, system } = await mounted();
    const first = system.window.onCloseRequest(() => true);
    system.window.onCloseRequest(() => {
      throw new Error('guard broke');
    });

    first();
    port.postMessage({ t: 'close-ask', id: 'a' });

    expect(await frame.next(port, (m) => m.t === 'close-answer')).toEqual({
      t: 'close-answer',
      id: 'a',
      allow: false,
    });
    expect(frame.drain(port)).toEqual([
      { t: 'close-guard', set: true },
      { t: 'close-guard', set: true },
    ]);
  });
});

describe('sandbox runtime: the port', () => {
  it('posts activate on pointerdown or focusin, at most once per 250 ms', async () => {
    const { frame, port } = await mounted();
    const doc = frame.window.document;

    doc.body.dispatchEvent(new frame.window.Event('pointerdown'));
    doc.body.dispatchEvent(new frame.window.Event('focusin'));
    expect(frame.drain(port)).toEqual([{ t: 'activate' }]);

    await new Promise((resolve) => setTimeout(resolve, 260));
    doc.body.dispatchEvent(new frame.window.Event('focusin'));
    expect(frame.drain(port)).toEqual([{ t: 'activate' }]);
  });

  it('ignores malformed and unknown messages', async () => {
    const { frame, port, system } = await mounted();
    const junk: unknown[] = [
      null,
      'unmount',
      ['unmount'],
      { t: 42 },
      { t: 'eval', code: 'throw 1' },
      { t: 'return', id: 999, ok: false, error: 'not ours' },
      { t: 'event', name: 'toString' },
      { t: 'close-ask', id: { not: 'an id' } },
    ];

    for (const message of junk) port.postMessage(message);
    await tick();

    expect(frame.drain(port)).toEqual([]);
    expect(frame.warnings).toEqual([]);
    expect(frame.window.__unmounted).toBeUndefined();
    expect(system.window.isFocused()).toBe(true);
  });
});
