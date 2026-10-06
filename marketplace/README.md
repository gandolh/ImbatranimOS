# The marketplace catalog

Each `<id>.json` here describes one app that can be installed from
**Settings → Marketplace**. Only an app described here can be installed. That
is the trust model: an installed app runs in the desktop's own page with no
sandbox, so the only code that gets there is code someone reviewed and pinned
in this repository, at a commit.

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
