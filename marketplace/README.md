# The marketplace catalog

Each `<id>.json` here describes one app that can be installed from
**Settings → Marketplace**. Only an app described here runs natively. That is
the trust model: such an app runs in the desktop's own page with no sandbox,
so the only code that gets there is code someone reviewed and pinned in this
repository, at a commit. Any other app can still be installed from its own
repository's URL, but it runs in a sandbox; see
[Apps from a URL](#apps-from-a-url) at the end.

Installing clones the app's repository at that commit into
`~/.imbatranim/apps/` on the home volume and runs its build there, in the live
container. Nothing is rebuilt into the OS image. Backups leave
`~/.imbatranim/apps/` out; after a restore the pane offers a reinstall.

## A descriptor

```json
{
  "schemaVersion": 1,
  "id": "hollow",
  "name": "Hollow",
  "description": "A short line for the Marketplace list.",
  "meta": ["game"],
  "source": {
    "repo": "https://github.com/gandolh/game-engine",
    "ref": "0123456789abcdef0123456789abcdef01234567",
    "subdir": "games/hollow"
  },
  "type": "static",
  "runtime": "native",
  "build": {
    "install": ["npm", "ci"],
    "command": ["npm", "run", "build:os"],
    "entry": "dist-os/hollow.mjs"
  },
  "window": {
    "defaultSize": { "w": 960, "h": 640 },
    "minSize": { "w": 640, "h": 400 }
  },
  "capabilities": ["notify"],
  "icon": "gamepad-2",
  "minSystemVersion": 2
}
```

- **`id`**: lowercase letters, digits and `-`. The file must be named `<id>.json`.
- **`source.repo`**: an `https://` repository. `file://` is accepted only when
  the backend runs with `MARKETPLACE_ALLOW_LOCAL_REPOS=true`, which is for tests
  and for trying a local checkout.
- **`source.ref`**: a full 40-character commit id. A tag or a branch is refused:
  either can move after the descriptor was reviewed.
- **`source.subdir`**: where the app is in the repository, when it is not at the top.
- **`build.install`** and **`build.command`**: argv arrays, run without a shell,
  from the app's directory, each with a 15-minute limit. They run as the
  desktop's user with a minimal environment of their own (`PATH`, a private
  `HOME`, `TMPDIR` and npm cache), and see none of the backend's configuration.
  The image has no compiler, so a dependency that builds native code fails.
- **`build.entry`**: the ES module the desktop imports, inside an output
  directory (`dist/app.mjs`, not `app.mjs`). That directory is served, and
  nothing outside it is; it may hold at most 256 MB. Other files the module
  needs (chunks, assets, WASM) go beside it and are loaded relative to it.
- **`type`**: `"static"` for an app that is only its module; `"service"` for one
  that also runs a server (below).
- **`capabilities`**: the parts of `system` the app may use: `fs`, `http`,
  `intents`, `notify`, `shortcuts`, `schedule`. `window`, `appearance` and `on`
  are always there. Touching one not listed throws an error naming it.
- **`icon`**: one of `package`, `gamepad-2`, `joystick`, `puzzle`, `swords`,
  `sprout`, `castle`, `rocket`, `dices`, `ghost`, `trophy`, `map`. Anything
  else shows `package`.
- **`minSystemVersion`**: the `system` protocol version the app needs
  (`PROTOCOL_VERSION` in `packages/ui/src/system.ts`, 2 today).

## The module

```ts
export function mount(
  container: HTMLElement,
  system: SystemHandle,
  host: {
    appId: string;
    assetBase: string; // URL of the module's directory, ending in "/"
    server: { http: string; ws: string } | null; // service apps only
  },
): void | Promise<void>;

export function unmount(container: HTMLElement): void;
```

`mount` is called when the app's window opens, with the window's content
element; the app renders into it however it likes (its own React, a canvas,
WebGPU). `unmount` is called when the window closes and must stop everything
`mount` started: animation frames, sockets, listeners on `window`. An exception
thrown by `mount`, or a module that does not load, shows the error panel in
that window only. An error thrown later from the app's own callbacks is the
app's to handle.

The module must be self-contained. It cannot import the desktop's React or
`@imbatranim/ui`; bundle what it needs.

## A service app

```json
  "type": "service",
  "server": {
    "command": ["node", "server/index.js"],
    "portEnv": "PORT",
    "health": "/health"
  }
```

When the app's window opens, the backend starts `server.command` from the
app's directory, with a free port from 41000–41999 in the variable `portEnv`
names and `HOST=127.0.0.1`. The window waits until `GET <health>` answers
(30 seconds at most). The server is stopped once no window holds it and no
socket is open, and is restarted if it crashes, up to five times in two minutes.

The app reaches its server only through the desktop:

- `host.server.ws` + a path, for WebSockets, and
- `host.server.http` + a path, for `GET` and `HEAD`.

Both require the desktop's session. The server never sees the desktop's cookie
or `Authorization` header, and it cannot set cookies on the desktop's origin.

## Apps from a URL

Any public GitHub repository that carries an `imbatranim.json` can be
installed from **Settings → Marketplace → Install from a URL**, with no
descriptor here. Nobody has reviewed such an app, so it gets far less than a
catalog app: it runs in a sandboxed frame, nothing of it ever runs on the
machine, and it can use only a small part of `system`. The owner sees the
repository, the commit and what the app asks for, and confirms, before
anything is kept.

### What the repository needs

The **built** app, committed. Installing a URL app clones the repository at
one commit and runs nothing from it: no `npm ci`, no build, no server. Keep
the build on a branch of its own if you don't want it next to the source
(like a `gh-pages` branch). Files are checked out byte for byte as
committed: `.gitattributes` line-ending, `ident` and encoding rules don't
apply. At that commit the repository may hold at most 20,000 files.

Beside the built files, in the folder the URL names, an `imbatranim.json`:

```json
{
  "schemaVersion": 1,
  "name": "Hollow",
  "description": "A generational social-emergence sim in a small 3D town.",
  "meta": ["game"],
  "entry": "dist/hollow.mjs",
  "window": {
    "defaultSize": { "w": 960, "h": 640 },
    "minSize": { "w": 640, "h": 400 }
  },
  "capabilities": [],
  "icon": "gamepad-2",
  "minSystemVersion": 2
}
```

- **`entry`**: the built ES module, relative to this file, inside a folder
  (`dist/app.mjs`, not `app.mjs`). That folder is served and nothing outside
  it is; it may hold at most 256 MB. The whole repository may be at most
  512 MB at that commit.
- **`capabilities`**: only `notify` is available. A file that asks for `fs`,
  `http`, `intents`, `shortcuts` or `schedule` is refused, because each would
  hand an unreviewed app the owner's files, session or other apps.
- **`window`**: as in a descriptor above, but `defaultSize` is at most
  1600×1000 and `minSize` at most 800×600, so the owner can always shrink it.
- **`icon`**, **`minSystemVersion`**: as in a descriptor above.
- Unknown keys are refused, so a typo is caught at install time.

The app's id on the machine is derived from its repository and folder, so two
apps can't claim the same one.

### Which commit

The URL picks it:

- `https://github.com/<owner>/<repo>`: the default branch, as it is now;
- `…/tree/<branch or tag>`: that branch or tag;
- `…/tree/<40-character commit>`: that commit, but only while it is the tip
  of one of the repository's branches or tags. GitHub serves a fork's commits
  through the original repository's URL too, so any other commit could be
  someone else's code under this repository's name;
- any of these followed by `/<folder>` for an app that isn't at the top.

The commit it resolves to is what gets installed and shown. **Check for
update** resolves the same URL again; if the commit moved, the owner confirms
again, with the new capability list in front of them.

### What the sandbox means for the app

The module contract is the same as above, `mount(container, system, host)`,
with `host.server` always `null`. The differences:

- The app runs in an `<iframe sandbox="allow-scripts allow-pointer-lock">`
  with an opaque origin. It cannot reach the desktop's page, its storage or
  its session.
- It can load only its own files: resolve them from `import.meta.url` or
  `host.assetBase`. Any other origin is blocked, WebRTC is switched off and
  DNS prefetching is off, so the app has no network.
- `new Worker(url, { type: "module" })` works. The worker runs as a classic
  worker that imports the module (Chrome refuses module workers in this kind
  of frame), so `self.location` is a `blob:` URL there; resolve relative URLs
  from `import.meta.url`.
- `localStorage` and `sessionStorage` work but live in memory and are gone
  when the window closes. `document.cookie` is empty. IndexedDB is not
  available.
- Pointer lock works. Pop-ups, downloads, fullscreen, the clipboard, forms
  and navigating the desktop do not.
- While its window is in the background, a transparent shield covers the
  app: the owner's first click only brings it to the front.
- The app must not take the keyboard while its window is in the background
  (no `focus()` on a timer, no focusing on mount while hidden). The desktop
  takes it straight back, and an app that does it twice within 10 seconds is
  stopped, with the reason in its window.
- `system.window.focus()` and `show()` work only while the window is in front
  and the app has the keyboard; an app cannot raise, un-minimise or pull the
  owner to its workspace on its own. `setTitle` is limited to four
  changes a second, `notify` to five every ten seconds.
- `system.window.onCloseRequest` works, guard and all. If the app doesn't
  answer within 60 seconds, the window closes anyway, and if the owner presses
  close again within 10 seconds of a refusal, it closes without asking.
- An error while loading or in `mount` shows in that window's error panel.

