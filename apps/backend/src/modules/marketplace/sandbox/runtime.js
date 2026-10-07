/*
 * The runtime of an app installed from a URL, inside its frame (brief 158).
 *
 * The frame is <iframe sandbox="allow-scripts allow-pointer-lock"> and every
 * response on its routes carries the CSP `sandbox` directive, so this
 * document's origin is opaque ('null'): no cookie, no storage, no reach into
 * the desktop, and a CSP that lets the network go nowhere but this server's
 * sandbox routes. The runtime makes that a place where a desktop app module
 * can run, then mounts it.
 *
 * It talks to exactly one party, the desktop's window host (its parent).
 * The handshake is on window.postMessage, with target '*' because this
 * origin is 'null':
 *
 *  → { imb: 'sandbox-ready', v: 1 }
 *  ← { imb: 'sandbox-init', v: 1, init } with one MessagePort transferred,
 *    obeyed only when its source IS window.parent, and only once.
 *
 * Everything after that goes over the port:
 *
 *  → { t: 'call', id, path, args } | { t: 'close-guard', set }
 *    | { t: 'close-answer', id, allow } | { t: 'activate' }
 *    | { t: 'mounted' } | { t: 'failed', message }
 *  ← { t: 'return', id, ok, value | error } | { t: 'event', name, payload }
 *    | { t: 'close-ask', id } | { t: 'unmount' }
 *
 * Besides, on window.postMessage: { imb: 'frame-blur' } when this frame's
 * keyboard leaves it, for the desktop's keyboard guard.
 *
 * This file is not a trust boundary. The app runs in this same realm and can
 * reach whatever the runtime can, the port included. The fences are the
 * sandbox and the CSP, and the desktop checks every message as if the app had
 * written it.
 *
 * Plain JS with no static import or export and no top-level await, so it
 * parses as a module (how the shell loads it) and as a classic script (how
 * runtime.spec.ts runs it in jsdom).
 */
(() => {
  'use strict';

  const FRAME_PROTOCOL = 1;
  const parentWindow = window.parent;

  // ── 1. Never run the app outside a sandboxed frame ───────────────────────

  if (self.origin !== 'null' || parentWindow === window) {
    const notice = () => {
      document.body.textContent =
        'This page runs inside an ImbatranimOS window.';
    };
    if (document.body) notice();
    else document.addEventListener('DOMContentLoaded', notice, { once: true });
    return;
  }

  // ── 2. Shims, before any app code ─────────────────────────────────────────

  function shim(name, install) {
    try {
      install();
    } catch (err) {
      console.warn(`[imbatranim] could not shim ${name}:`, err);
    }
  }

  // An opaque-origin document cannot start a worker from a URL, so an http(s)
  // script URL becomes a blob that loads it. The blob is always a classic
  // worker: Chrome refuses a *module* worker whose script is a blob made by an
  // opaque origin ("cross-origin redirects of the top-level worker script"),
  // so a module worker's blob loads the module with import() instead. A
  // classic worker delivers messages as soon as its own script ends, before
  // that import settles, so the bootstrap holds them and replays them in
  // order once the module has run and set its listeners. The blob URL is not
  // revoked: a worker resolves it asynchronously, and one string per worker is
  // cheap.
  function workerUrl(url, options) {
    let target;
    try {
      target = new URL(String(url), document.baseURI);
    } catch {
      return url;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return url;
    const specifier = JSON.stringify(target.href);
    const source =
      options && options.type === 'module'
        ? [
            'const held = [];',
            'const hold = (event) => { event.stopImmediatePropagation(); held.push(event); };',
            "self.addEventListener('message', hold);",
            `import(${specifier}).then(() => {`,
            "  self.removeEventListener('message', hold);",
            '  for (const e of held) {',
            "    self.dispatchEvent(new MessageEvent('message', { data: e.data, ports: [...e.ports] }));",
            '  }',
            '}, (err) => { setTimeout(() => { throw err; }); });',
            '',
          ].join('\n')
        : `importScripts(${specifier});\n`;
    return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  }

  shim('Worker', () => {
    const NativeWorker = window.Worker;
    if (typeof NativeWorker !== 'function') return;
    const Worker = class Worker extends NativeWorker {
      constructor(url, options) {
        const blob = workerUrl(url, options);
        // The bootstrap blob is classic either way (see workerUrl).
        super(blob, blob === url ? options : { ...options, type: 'classic' });
      }
    };
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      writable: true,
      value: Worker,
    });
  });

  shim('SharedWorker', () => {
    if (typeof window.SharedWorker !== 'function') return;
    Object.defineProperty(window, 'SharedWorker', {
      configurable: true,
      writable: true,
      value: function SharedWorker() {
        throw new Error(
          'SharedWorker is not available to an app installed from a URL; use Worker.',
        );
      },
    });
  });

  // WebRTC is the one way out the frame's CSP doesn't cover: a peer
  // connection gathers candidates from any STUN or TURN server it names, which
  // carries data to another origin (measured in Chrome 150). Nothing an app
  // from a URL may do needs it, so the constructors are replaced before the
  // app's code runs, and a nested frame can't hand back the originals (it is
  // cross-origin to this opaque document). Not configurable: an app can't put
  // anything back in their place either.
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
    shim(name, () => {
      if (!(name in window)) return;
      Object.defineProperty(window, name, {
        configurable: false,
        writable: false,
        value: function RTCPeerConnection() {
          throw new Error(
            'WebRTC is not available to an app installed from a URL.',
          );
        },
      });
    });
  }

  // The real storages throw SecurityError in this origin, and in v1 nothing
  // persists: a Storage-shaped Map. Property access behaves as on a real
  // Storage: the methods win on read, and any string-named write is an item.
  function memoryStorage() {
    const items = new Map();
    const methods = Object.create(
      typeof Storage === 'function' ? Storage.prototype : Object.prototype,
    );
    Object.defineProperties(methods, {
      length: { get: () => items.size },
      key: {
        value: (index) => {
          const keys = [...items.keys()];
          const i = Math.trunc(Number(index));
          return i >= 0 && i < keys.length ? keys[i] : null;
        },
      },
      getItem: {
        value: (key) => {
          const name = String(key);
          return items.has(name) ? items.get(name) : null;
        },
      },
      setItem: {
        value: (key, value) => {
          items.set(String(key), String(value));
        },
      },
      removeItem: {
        value: (key) => {
          items.delete(String(key));
        },
      },
      clear: {
        value: () => {
          items.clear();
        },
      },
    });
    const stored = (target, prop) =>
      typeof prop === 'string' && !(prop in target) && items.has(prop);
    return new Proxy(Object.create(methods), {
      get: (target, prop) =>
        stored(target, prop) ? items.get(prop) : Reflect.get(target, prop),
      set: (target, prop, value) => {
        if (typeof prop !== 'string') return Reflect.set(target, prop, value);
        items.set(prop, String(value));
        return true;
      },
      has: (target, prop) => stored(target, prop) || prop in target,
      deleteProperty: (target, prop) => {
        if (stored(target, prop)) return items.delete(prop);
        return Reflect.deleteProperty(target, prop);
      },
      ownKeys: (target) => [
        ...new Set([...Reflect.ownKeys(target), ...items.keys()]),
      ],
      getOwnPropertyDescriptor: (target, prop) =>
        Reflect.getOwnPropertyDescriptor(target, prop) ||
        (stored(target, prop)
          ? {
              value: items.get(prop),
              writable: true,
              enumerable: true,
              configurable: true,
            }
          : undefined),
    });
  }

  for (const name of ['localStorage', 'sessionStorage']) {
    shim(name, () => {
      const storage = memoryStorage();
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get: () => storage,
      });
    });
  }

  shim('document.cookie', () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      enumerable: true,
      get: () => '',
      set: () => {},
    });
  });

  // ── 3. Handshake ──────────────────────────────────────────────────────────

  let port = null;
  // waiting → mounting → mounted | failed; any of them → unmounted.
  let state = 'waiting';
  let app = null; // { mod, container } once the module has loaded

  function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function errorText(err) {
    let text;
    try {
      text = err && typeof err.message === 'string' ? err.message : String(err);
    } catch {
      text = 'Unknown error';
    }
    return text.length > 1000 ? `${text.slice(0, 999)}…` : text;
  }

  function send(message) {
    try {
      port.postMessage(message);
      return true;
    } catch (err) {
      console.warn('[imbatranim] could not reach the desktop:', err);
      return false;
    }
  }

  function readAppearance(value) {
    if (!isObject(value)) return null;
    if (value.theme !== 'dark' && value.theme !== 'light') return null;
    if (typeof value.accent !== 'string') return null;
    return { theme: value.theme, accent: value.accent };
  }

  function readInit(value) {
    if (!isObject(value)) return null;
    const { appId, windowId, protocolVersion, capabilities } = value;
    const appearance = readAppearance(value.appearance);
    if (typeof appId !== 'string' || appId === '') return null;
    if (windowId !== null && typeof windowId !== 'string') return null;
    if (typeof protocolVersion !== 'number') return null;
    if (!Array.isArray(capabilities)) return null;
    if (!capabilities.every((c) => typeof c === 'string')) return null;
    if (!appearance) return null;
    return {
      appId,
      windowId,
      protocolVersion,
      capabilities,
      appearance,
      focused: value.focused === true,
      visible: value.visible !== false,
    };
  }

  function onInit(event) {
    if (event.source !== parentWindow) return;
    const data = event.data;
    if (!isObject(data) || data.imb !== 'sandbox-init') return;
    if (data.v !== FRAME_PROTOCOL) return;
    if (!event.ports || event.ports.length !== 1) return;
    window.removeEventListener('message', onInit);
    port = event.ports[0];
    port.onmessage = onPortMessage;
    const init = readInit(data.init);
    if (!init) {
      fail('The desktop sent a malformed sandbox-init.');
      return;
    }
    const system = createSystem(init);
    window.addEventListener('pointerdown', activate, true);
    window.addEventListener('focusin', activate, true);
    void mount(init, system);
  }

  // ── The `system` handle (packages/ui/src/system.ts), over the port ───────

  const ALWAYS = new Set([
    'protocolVersion',
    'appId',
    'windowId',
    'window',
    'appearance',
    'on',
  ]);
  // Handle members a URL app can never have: each hands over the owner's
  // files or session, or reaches other apps.
  const NEVER = new Set(['fs', 'http', 'intents', 'shortcuts', 'schedule']);
  const EVENTS = ['focus', 'blur', 'visibility', 'appearance-changed'];

  let nextCallId = 1;
  const calls = new Map(); // id → path, until the desktop returns
  let cache = null; // { focused, visible, appearance }
  const listeners = new Map(EVENTS.map((name) => [name, new Set()]));
  let closeGuard = null; // { guard } for the current registration

  // Every call is fire-and-forget, like the in-process handle: a failure is a
  // console warning, never a throw into the app.
  function call(path, args) {
    const id = nextCallId++;
    calls.set(id, path);
    if (!send({ t: 'call', id, path, args })) calls.delete(id);
  }

  function onReturn(message) {
    if (!calls.has(message.id)) return;
    const path = calls.get(message.id);
    calls.delete(message.id);
    if (message.ok === true) return;
    const error = isObject(message.error)
      ? message.error.message
      : message.error;
    console.warn(
      `[imbatranim] system.${path} failed: ${errorText(error ?? 'no reason given')}`,
    );
  }

  function uuid() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // randomUUID needs a secure context; a LAN http deploy is not one.
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function onCloseRequest(guard) {
    if (typeof guard !== 'function') {
      throw new TypeError('onCloseRequest takes a function');
    }
    const registration = { guard };
    closeGuard = registration;
    send({ t: 'close-guard', set: true });
    return () => {
      if (closeGuard !== registration) return;
      closeGuard = null;
      send({ t: 'close-guard', set: false });
    };
  }

  // Same reading as the in-process window store: the window closes on a
  // truthy verdict, and a guard that throws or rejects answered nothing, so
  // the window (and its unsaved work) stays open.
  async function answerClose(id) {
    const registration = closeGuard;
    let allow = true;
    if (registration) {
      try {
        allow = Boolean(await registration.guard());
      } catch (err) {
        console.error('[imbatranim] the close guard threw:', err);
        allow = false;
      }
    }
    send({ t: 'close-answer', id, allow });
  }

  function onEvent(name, payload) {
    let delivered;
    switch (name) {
      case 'focus':
      case 'blur': {
        const focused = name === 'focus';
        if (cache.focused === focused) return;
        cache.focused = focused;
        break;
      }
      case 'visibility':
        if (typeof payload !== 'boolean' || cache.visible === payload) return;
        cache.visible = delivered = payload;
        break;
      case 'appearance-changed': {
        const look = readAppearance(payload);
        if (!look) return;
        cache.appearance = look;
        delivered = look;
        break;
      }
      default:
        return;
    }
    for (const listener of [...listeners.get(name)]) {
      try {
        listener(isObject(delivered) ? { ...delivered } : delivered);
      } catch (err) {
        console.error(`[imbatranim] an on('${name}') listener threw:`, err);
      }
    }
  }

  function createSystem(init) {
    const { appId } = init;
    cache = {
      focused: init.focused,
      visible: init.visible,
      appearance: init.appearance,
    };
    const granted = new Set(init.capabilities);
    const handle = {
      protocolVersion: init.protocolVersion,
      appId,
      windowId: init.windowId,
      window: {
        setTitle(title) {
          call('window.setTitle', [String(title)]);
        },
        requestClose() {
          call('window.requestClose', []);
        },
        focus() {
          call('window.focus', []);
        },
        hide() {
          call('window.hide', []);
        },
        show() {
          call('window.show', []);
        },
        isFocused: () => cache.focused,
        isVisible: () => cache.visible,
        onCloseRequest,
      },
      appearance: {
        get: () => ({ ...cache.appearance }),
      },
      notify(input) {
        // `actions` deliver an openApp payload, which is `intents`: dropped.
        const fields = {};
        if (isObject(input)) {
          for (const key of ['title', 'body', 'level']) {
            if (input[key] !== undefined) fields[key] = input[key];
          }
        }
        call('notify', [fields]);
        return uuid();
      },
      on(event, cb) {
        const set = listeners.get(event);
        if (!set || typeof cb !== 'function') return () => undefined;
        const listener = (payload) => cb(payload); // two `on`s, two calls
        set.add(listener);
        return () => {
          set.delete(listener);
        };
      },
    };
    // Like scopeHandle: touching a member the app did not ask for throws a
    // sentence naming it, rather than failing somewhere inside.
    return new Proxy(handle, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') {
          if (NEVER.has(prop)) {
            throw new Error(
              `${appId} did not ask for system.${prop}, and an app installed from a URL cannot have it`,
            );
          }
          if (prop in target && !ALWAYS.has(prop) && !granted.has(prop)) {
            throw new Error(
              `${appId} did not ask for system.${prop}; add "${prop}" to the capabilities in its imbatranim.json`,
            );
          }
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  // ── Activation: a click or focus inside raises the window ─────────────────

  let lastActivate = -Infinity;

  function activate() {
    const now = performance.now();
    if (now - lastActivate < 250) return;
    lastActivate = now;
    send({ t: 'activate' });
  }

  // ── The port ──────────────────────────────────────────────────────────────

  function onPortMessage(event) {
    const message = event.data;
    if (!isObject(message) || typeof message.t !== 'string') return;
    switch (message.t) {
      case 'return':
        onReturn(message);
        return;
      case 'event':
        if (cache && typeof message.name === 'string') {
          onEvent(message.name, message.payload);
        }
        return;
      case 'close-ask':
        if (typeof message.id === 'string' || typeof message.id === 'number') {
          void answerClose(message.id);
        }
        return;
      case 'unmount':
        unmount();
        return;
      default:
        return;
    }
  }

  // ── 4. Mount ──────────────────────────────────────────────────────────────

  function fail(message) {
    if (state !== 'waiting' && state !== 'mounting') return;
    state = 'failed';
    send({ t: 'failed', message: errorText(message) });
  }

  // Until the app is mounted, any uncaught error is a failed mount. After it,
  // the console's own report is the whole story.
  window.addEventListener('error', (event) => {
    if (state === 'mounting') fail(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (state === 'mounting') fail(event.reason);
  });

  async function mount(init, system) {
    state = 'mounting';
    try {
      const meta = document.querySelector('meta[name="imb-entry"]');
      const entry = meta && meta.getAttribute('content');
      if (!entry) throw new Error('The sandbox page names no app entry.');
      const entryUrl = new URL(entry, document.baseURI);
      const mod = await import(entryUrl.href);
      if (state !== 'mounting') return;
      if (!mod || typeof mod.mount !== 'function') {
        throw new Error(
          `${init.appId}'s module does not export mount(container, system)`,
        );
      }
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.right = '0';
      container.style.bottom = '0';
      container.style.left = '0';
      document.body.appendChild(container);
      app = { mod, container };
      await mod.mount(
        container,
        system,
        Object.freeze({
          appId: init.appId,
          assetBase: new URL('./', entryUrl).href,
          server: null,
        }),
      );
      if (state !== 'mounting') return;
      state = 'mounted';
      send({ t: 'mounted' });
    } catch (err) {
      fail(err);
    }
  }

  function unmount() {
    if (state === 'unmounted') return;
    state = 'unmounted';
    if (!app || typeof app.mod.unmount !== 'function') return;
    try {
      app.mod.unmount(app.container);
    } catch (err) {
      console.error('[imbatranim] unmount threw:', err);
    }
  }

  // The desktop's keyboard guard can't see another frame taking the keyboard
  // from this one, so this frame says when its keyboard has gone: a moment
  // after a blur, if neither this document nor anything in it has it. Wired
  // before the app's code runs, so the app can't get in first.
  window.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.hasFocus()) return;
      try {
        parentWindow.postMessage({ imb: 'frame-blur' }, '*');
      } catch {
        // The desktop is gone; nothing to tell.
      }
    }, 0);
  });

  // ── Go: everything above is in place before the desktop can answer ───────

  window.addEventListener('message', onInit);
  parentWindow.postMessage({ imb: 'sandbox-ready', v: FRAME_PROTOCOL }, '*');
})();
