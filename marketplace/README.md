# The marketplace catalog

Each `<id>.json` here describes one app that can be installed from
**Settings → Marketplace**, or several apps built together (see
[Several apps from one build](#several-apps-from-one-build)). Only an app described here runs natively. That is
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
    "repo": "https://github.com/<owner>/game-engine",
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
  WASM follows the reviewers' rule in [WebAssembly](#webassembly).
- **`type`**: `"static"` for an app that is only its module; `"service"` for one
  that also runs a server (below).
- **`capabilities`**: the parts of `system` the app may use: `fs`, `http`,
  `intents`, `notify`, `shortcuts`, `schedule`. `window`, `appearance`,
  `sound`, `data` and `on` are always there. Touching one not listed throws an error
  naming it. An app that makes sound plays at its own volume times
  `system.sound.get().volume` and is silent while it says `muted` (since kit
  1.3.0; on an older desktop `sound` is missing). An app keeps its settings,
  data, state and cache as text files in folders of its own through
  `system.data` (since kit 1.4.0): `read` returns a version, and a `write`
  that names it is refused with `FileConflictError` when another window
  saved first. Uninstalling removes the cache, and the rest only when the
  owner asks.
- **`icon`**: one of `package`, `gamepad-2`, `joystick`, `puzzle`, `swords`,
  `sprout`, `castle`, `rocket`, `dices`, `ghost`, `trophy`, `map`, `bomb`,
  `spade`, or for
  office apps `file-text`, `file-pen`, `table`, `sheet`, `presentation`,
  `pen-tool`, `drafting-compass`, `ruler`, `briefcase`, or for accessories
  `list-todo`, `bookmark`. The desktop shows
  `package` for any other name, and a test fails if a descriptor here uses
  one, so add the icon to `ICONS` in
  `apps/core/src/shared/registry/marketplace.tsx` first.
- **`minSystemVersion`**: the `system` protocol version the app needs
  (`PROTOCOL_VERSION` in `packages/ui/src/system.ts`, 2 today).
- Unknown keys are refused, at the descriptor's top level and in each app
  of `apps`, so a misspelt or misplaced field is listed under the pane's
  catalog problems with its name instead of being ignored.

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

A `mount` module is self-contained: it bundles whatever it uses, React
included, and the desktop's React and `@imbatranim/ui` never reach it. An app
that wants the desktop's own kit (its buttons and dialogs, `useSystem()`, the
theme) is a [kit app](#kit-apps) instead.

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

## Several apps from one build

A repository that builds more than one app, like an office suite, is one
descriptor with `"schemaVersion": 2` and an `apps` array. It is cloned once
and built once, and it is installed, updated and uninstalled as a whole:
**Settings → Marketplace** shows it as one row with its apps listed under it.
Each app still gets its own entry in Start, its own windows and its own place
in Open With, and is enabled or disabled on its own in **Settings → Apps**.

```json
{
  "schemaVersion": 2,
  "id": "office",
  "name": "Office",
  "description": "Documents and spreadsheets.",
  "source": {
    "repo": "https://github.com/<owner>/imbatranim-office",
    "ref": "0123456789abcdef0123456789abcdef01234567"
  },
  "type": "static",
  "runtime": "native",
  "build": {
    "install": ["npm", "ci"],
    "command": ["npm", "run", "build:os"],
    "output": "dist/os"
  },
  "apps": [
    {
      "id": "office-docs",
      "name": "Docs",
      "description": "Word documents.",
      "meta": ["office"],
      "entry": "docs/app.mjs",
      "window": {
        "defaultSize": { "w": 860, "h": 680 },
        "minSize": { "w": 480, "h": 380 }
      },
      "icon": "file-text",
      "opens": ["docx"],
      "multiInstance": true,
      "capabilities": ["fs", "intents", "shortcuts", "notify"]
    },
    {
      "id": "office-sheets",
      "name": "Sheets",
      "description": "Spreadsheets.",
      "meta": ["office"],
      "entry": "sheets/app.mjs",
      "icon": "sheet",
      "opens": ["xlsx", "csv"],
      "multiInstance": true,
      "capabilities": ["fs", "intents", "notify"]
    }
  ],
  "minSystemVersion": 2
}
```

The top level holds what the apps share: `id`, `name`, `description`,
`source`, `type`, `runtime`, `build`, `server`, `minSystemVersion` and, for
[kit apps](#kit-apps), `sharedKit`. These mean what they mean in version 1,
except for `build`:

- **`build.output`** takes the place of `build.entry`: the directory the build
  writes every app into, inside the app's directory (`dist/os`; not the
  top, and never inside `node_modules`). It is the only directory served, so
  the apps can share the chunks a multi-entry build writes beside their
  entries. It may hold at most 256 MB, as in version 1.
- **`apps`**: 1 to 16 apps. `name`, `description`, `meta`, `window`, `icon`
  and `capabilities` mean what they mean in version 1, for that app alone.
  Three fields are new:
  - **`entry`**: the app's ES module, a `.mjs` or `.js` path inside `output`
    (`docs/app.mjs`). After the build every entry must exist. If one is
    missing, the install fails and the build that was live stays live.
  - **`opens`**: up to 40 file types the app offers to open: lowercase
    extensions without the dot (`docx`), or the whole name of a file that
    has none (`makefile`). When a built-in app claims the same type, the
    built-in stays the default. The owner can choose this app in **Open
    with…**, or make it the default in **Settings → Default apps**.
  - **`multiInstance`**: `true` opens a new window on every launch, as an
    editor wants. Leave it out for one window that a second launch brings to
    the front, as a game wants.
- **Ids**: an app id follows the descriptor id rule and must be unique across
  the whole catalog, among app ids and descriptor ids alike. An app may reuse
  its own descriptor's id. If a file reuses an id that another file already
  took, the later file is skipped and listed under the pane's catalog
  problems. A built-in app with the same id still wins, and the pane says so.
- **A server** (`"type": "service"`) belongs to the descriptor. Its apps
  share one server: it starts when the first of their windows opens and
  stops after the last one closes, and `host.server` gives every app the
  same URLs. It counts once against the limit of four.
- **`host.appId`** in `mount` is the app's own id. `host.assetBase` is the
  URL of the directory its entry is in, so a shared chunk sits one level up
  from `docs/app.mjs`; importing it by a relative path is simplest.

A version 1 descriptor is still valid, and is read as a version 2 one with a
single app: the app's id is the descriptor's, `output` is the directory its
entry is in, it opens nothing, and it has one window.

## Kit apps

A kit app is a catalog app whose module exports a React component, which the
desktop renders in its own page tree with its own React and `@imbatranim/ui`
(the shared kit). It looks and behaves like a built-in app: the kit's buttons and dialogs, `useSystem()` and the kit's hooks,
`saveOverRead`, the theme and the accent. A `mount` module can't have any of
that, because a second copy of React can't read the desktop's context. Only a
version 2 catalog descriptor can describe kit apps. An app from a URL never
sees the desktop's modules.

### In the descriptor

```json
  "schemaVersion": 2,
  "sharedKit": 1,
  "apps": [
    {
      "id": "office-docs",
      "entry": "docs/app.mjs",
      "styles": ["docs/app.css"],
      "capabilities": ["fs", "intents"]
    }
  ]
```

- **`sharedKit`**: the version of the shared kit the build was made against,
  an integer from 1 (`SHARED_KIT_VERSION` in `packages/ui/src/sharedKit.ts`,
  1 today). With it, every app of the descriptor is a kit app; without it,
  every app exports `mount`. One descriptor does not mix the two, and a
  version 1 descriptor that sets it is refused.
- **`styles`**: per app, up to 8 `.css` files inside `output`, each listed
  once. Only a descriptor with `sharedKit` may list them. After the build
  each one must exist, as the entries must: if one is missing, the install
  fails and the build that was live stays live.
- **`background`** and **`commandSources`**: per app, `true` when its module
  exports that hook (see [Hooks](#hooks)). Only a descriptor with `sharedKit`
  may declare them, and only on an app; a version 1 descriptor that sets
  either is refused.

### The module

```ts
import type { ComponentType } from "react";
import type { KitAppProps } from "@imbatranim/ui";

// KitAppProps = { windowId: string; host: NativeHostContext }
export const App: ComponentType<KitAppProps>;
```

The module's named export `App` can be a function or class component, or
what `memo`, `forwardRef` or `lazy` return. A kit module has no `mount` and
no `unmount`: React mounts the component when the window opens and unmounts
it when the window closes. Anything the app starts outside React (a worker,
a socket, a listener on `window`) it stops in an effect cleanup. `host` is
the object `mount` receives.

The desktop renders `App` inside the window's error boundary and `Suspense`,
under a `SystemProvider` holding the app's handle, so `useSystem()` and the
kit's hooks work, fenced to the descriptor's `capabilities`. The kit's hooks
use capabilities too: `useOpenIntent` needs `intents`, and `useFileDialog`
and `saveOverRead` need `fs`. A throw while rendering shows the error panel
in that window only, as it does for a built-in app.

### Hooks

A kit app can do things with no window open: run a background service, and
add results to the command palette and Start's search. Each is a named export
of its module beside `App`, declared on the app in the descriptor:

```json
{
  "id": "todo",
  "entry": "todo/app.mjs",
  "capabilities": ["notify", "schedule"],
  "background": true,
  "commandSources": true
}
```

```ts
import type { ComponentType } from "react";
import type {
  CommandSource,
  KitAppProps,
  KitBackgroundProps,
} from "@imbatranim/ui";

export const App: ComponentType<KitAppProps>;
// background: true. KitBackgroundProps = { host: NativeHostContext }
export const Background: ComponentType<KitBackgroundProps>;
// commandSources: true.
export const commandSources: CommandSource[];
```

Only an app that declares a hook has its module imported before a window
opens. The desktop imports it once sign-in is done and the page is idle, so
the desktop never waits for it, and a service or a palette entry may start a
moment after the desktop does. The module is evaluated once, so `App`,
`Background` and `commandSources` share its top-level state. The recorded
declaration is the live build's: a descriptor that adds a hook at a new ref
changes nothing until that ref is installed.

- **`Background`** is mounted from sign-in to sign-out while the app is
  enabled, like a built-in app's background service: it renders nothing and
  exists for its effects, which must be cheap (one slow interval, no
  per-frame work). `useSystem()` gives it a `WindowlessSystemHandle`: a
  running copy of the app with its own identity and no window, fenced to the
  app's `capabilities`. `windowId` is `null`, the `window` writes do nothing,
  and `system.server.request()` rejects: only a window holds the app's
  server. Anything the owner should see goes through `system.notify`.
- **`commandSources`** is a list of `CommandSource`s: a `group` (the section
  header, which no other source may already use), `search(query, ctx)` and
  `activate(item)`. They are searched by the palette and Start's search while
  the app is enabled. `ctx.http` is the app's own, carrying its identity,
  and only there when `capabilities` lists `http`; reading it otherwise
  throws. `ctx.data` is the app's own folders, as `system.data` is, with no
  capability (since kit 1.6.0). A result's `id` only needs to be unique
  within its source.
  `activate` gets the result back as `search` made it. A source catches its
  own failures (a network error) and answers `[]`.

Turning the app off in **Settings → Apps** takes both away at once, and
turning it on brings them back. Uninstalling stops them; an update or a
rebuild starts the new build's.

Each failure costs that app's hooks only, with one notification in its
name:

- a declared hook the module doesn't export is refused by name ("Todo
  declares a background service, but its module does not export
  Background, a React component."), and the app's windows still open;
- a module that doesn't load stops its hooks until the page reloads or a
  new build loads;
- a `Background` that throws is stopped until the app is turned off and on,
  the page reloads, or a new build loads;
- a source that throws or rejects is hidden until the app is turned off and
  on, the page reloads, or a new build loads.

The hook types (`CommandSource`, `CommandSourceContext`, `CommandItem`,
`KitAppModule`, `KitBackgroundProps`, `WindowlessSystemHandle`) are in kit
1.5.0. Widgets and desktop layers aren't hooks yet: they stay with the
built-in apps until an installable app needs one.

### The shared modules

Before it imports the first kit app, the desktop sets
`globalThis.__imbatranimShared`:

```ts
{
  version: 1, // SHARED_KIT_VERSION
  modules: {
    "react": …,
    "react/jsx-runtime": …,
    "react-dom": …,
    "react-dom/client": …,
    "@imbatranim/ui": …,
  },
}
```

The object and every module in it are frozen, and the property can't be
reassigned. Each module holds every export of the desktop's own copy as a
property: the same objects, so the context the app reads is the desktop's.
React's modules also carry `default`; the kit's doesn't. Everything else
(icons, react-query, a document engine) the app bundles itself.

The app's build marks those five specifiers external, and rewrites each
import into a read from `globalThis.__imbatranimShared.modules[specifier]`
as the module evaluates. With Vite or Rollup, one way is a plugin that
resolves each specifier to a small virtual module re-exporting that object's
properties by name. An import map won't work: it is an inline script, which
the desktop's CSP (`script-src 'self' 'wasm-unsafe-eval'`, no
`'unsafe-inline'`) refuses, and it would have to exist before the page loads
its first module.

### Building against a snapshot

There is no package registry. A kit app's repository commits a copy of
`packages/ui/src` from a named commit of this repository, and uses it for
types, tests and Tailwind's token names. The files that matter most are
`index.ts` (the exports), `sharedKit.ts` (`SHARED_KIT_VERSION`,
`NativeHostContext`, `KitAppProps` and the hooks' types),
`commandSource.ts` (a command source), `system.ts` (the handle) and
`theme.css` (the tokens). At bundle time the specifiers stay external, so
none of the snapshot ships: the desktop's own kit runs. When
`SHARED_KIT_VERSION` goes up, take a new snapshot, rebuild, and update
`sharedKit` and `source.ref` here.

### The stylesheet

A kit app's CSS holds utilities only. Compile it with Tailwind 4, the
desktop's major, with no preflight and no theme of its own. The token names
come from the snapshot's `theme.css` and resolve to the desktop's CSS
variables at runtime, and the desktop defines every token in that file,
whether its own classes use it or not. For example:

```css
@import "tailwindcss/theme.css" layer(theme) theme(reference);
@import "../kit/theme.css" theme(reference); /* the snapshot */
@import "tailwindcss/utilities.css" layer(utilities);
@source "./src";
```

`reference` emits no variables of its own. A Tailwind default token the
desktop never uses falls back to its value inside the `var()`. The output's
rules land in the desktop's `utilities` layer.

The desktop adds each listed file as a `<link rel="stylesheet">` in the
page's `<head>` the first time any app of that build opens, one link per
file however many windows are open. A window waits up to 10 seconds for its
stylesheets before it renders the app. The links stay while the build is
installed, and go when an update replaces it or it is uninstalled.

### The version

`SHARED_KIT_VERSION` goes up when a shared module changes incompatibly: a
React major, a kit export removed, or a kit component's props changed in a
breaking way. A new export or module doesn't count. The desktop refuses to
render a kit app whose `sharedKit` differs from its own, older or newer. The
window's error panel says, for example, "Docs was built for shared kit 2, and
this desktop has shared kit 1. It needs an update built for kit 1."
**Settings → Marketplace** shows the row as "Needs an update". The version
the desktop checks is the one the live build was made against, so a changed
`sharedKit` takes effect at the next install.

Trust doesn't change. A catalog app already runs in the desktop's page with
nothing between it and the page; sharing the page's React gives it nothing
it couldn't already reach.

## WebAssembly

A catalog app, `mount` or kit, may compile WebAssembly in the desktop's
page: the desktop's CSP has `'wasm-unsafe-eval'`. That lets the app's own
scripts compile a `.wasm`; it doesn't let a string run as JavaScript
(`eval` and `new Function` are still refused). The `.wasm` goes beside the
module and is loaded relative to it, and the marketplace serves it as
`application/wasm`, which `instantiateStreaming` needs:

```js
const url = new URL("./codec.wasm", import.meta.url);
const { instance } = await WebAssembly.instantiateStreaming(fetch(url));
```

**The reviewers' rule.** The CSP can't tell one `.wasm` from another, so
what may ship is decided here, at review. A catalog app's WASM comes from an
npm package, pinned by the app's lockfile, as the package published it. It
is never compiled during the install and never committed to the app's
repository. A descriptor whose build breaks this isn't merged.

**Threads.** The desktop is cross-origin isolated
(`Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp`), so `crossOriginIsolated` is
true in its page and `SharedArrayBuffer` and shared `WebAssembly.Memory`
work: an app can hand memory to its workers, which is what WASM threads are
built on. Start a worker from a file beside the module
(`new Worker(new URL("./worker.mjs", import.meta.url), { type: "module" })`);
it is served with the same headers. Check `crossOriginIsolated` before
relying on threads and fall back to one when it is false: a browser that
can't isolate the page runs it without.

Isolation asks nothing new of an app: everything it loads already comes from
the desktop's origin under the CSP. One thing does change: a window an app
opens on another site is cut off from the desktop's page both ways (it has
no `window.opener`, and the handle `window.open` returned reads as closed).

An app from a URL has WASM in its sandbox, but no threads (see
[What the sandbox means for the app](#what-the-sandbox-means-for-the-app)).

## Apps from a URL

Any public GitHub repository that carries an `imbatranim.json` can be
installed from **Settings → Marketplace → Install from a URL**, with no
descriptor here. What happens depends on the file:

- **Version 2, built from source.** The app builds on the machine and runs
  natively, exactly like a catalog app, with the same capabilities, identity
  and file grants. If [`verified.json`](#verified-and-trusted-apps) names its
  repository at that commit, it installs straight away. Otherwise the owner
  first sees a warning (the publisher, the commit, what the app asks for, and
  that a trusted app acts as them, Terminal included) and installs it only
  with **More info → Trust and install**.
- **Version 1, prebuilt.** The earlier kind: nobody has reviewed it, so it
  runs in a sandboxed frame, nothing of it runs on the machine, and it can use
  only a small part of `system`. It is being retired; new apps should use
  version 2.

### Built from source (version 2)

`imbatranim.json` is a catalog descriptor ([above](#a-descriptor)) without
`id`, `source` and `runtime`, which the OS sets: the id is derived from the
repository and folder, the source is the URL resolved to a commit, and the
runtime is native. `schemaVersion` is `2`. Like a descriptor it is validated
by the catalog's schema, so every field, limit and rule above holds: argv
commands, `capabilities`, `window`, `opens`, `server` for a service app,
`sharedKit`, `styles` and the hooks.

```json
{
  "schemaVersion": 2,
  "name": "Notes",
  "type": "static",
  "build": {
    "install": ["npm", "ci"],
    "command": ["npm", "run", "build"],
    "entry": "dist/notes.mjs"
  },
  "capabilities": ["fs", "notify"],
  "icon": "notebook",
  "minSystemVersion": 2
}
```

`build.entry` is one app. `build.output` with `apps` is several apps from
one build, as in [Several apps from one build](#several-apps-from-one-build);
each app's id there is the derived id, a dash and the id it gives (at most 25
characters), so no URL app can take a catalog app's id or another URL app's.

The check clones the commit, within the same limits as a prebuilt app (512 MB,
20,000 files), and the install builds that clone with the catalog's
installer: the same allowlisted environment, per-build directory and time
limits. The build log is under **Log**.

### Which commit

The URL picks it:

- `https://github.com/<owner>/<repo>`: the default branch, as it is now;
- `…/tree/<branch or tag>`: that branch or tag;
- `…/tree/<40-character commit>`: that commit, but only while it is the tip
  of one of the repository's branches or tags. GitHub serves a fork's commits
  through the original repository's URL too, so any other commit could be
  someone else's code under this repository's name;
- any of these followed by `/<folder>` for an app that isn't at the top.

The commit it resolves to is what gets checked, installed and shown. **Check
for update** resolves the same URL again; if the commit moved, the owner
confirms again, with the new capability list in front of them (for an app
built from source, unless the new commit is verified).

### Verified and trusted apps

`verified.json` here lists the verified apps. It is a copy of imbatranim-apps'
`verified.json` at the commit it records, made with

```
npm run verified:sync -- <imbatranim-apps checkout> <commit>
npm run verified:sync -- <imbatranim-apps checkout> --check
```

The second form fails when the copy is not exactly what that commit holds.
The image carries the copy, so what counts as verified changes only with an
OS release. Each entry names a repository, the app's folder in it when it
isn't at the top, one commit and a short note:

```json
{
  "repo": "https://github.com/<owner>/<repo>",
  "subdir": "apps/notes",
  "commit": "<40 hex>",
  "note": "…"
}
```

- A **verified** app installs with no warning. When the list names a newer
  commit, Settings shows **Update**, which builds that commit.
- Any other commit is **unverified**: it installs only with the owner's
  trust, which covers that commit alone. **Check for update** finds a new
  commit and asks again. **Reinstall** rebuilds the trusted commit.
- Settings → Marketplace shows each app's source, its commit and a badge:
  **Verified** while this release's list names the installed commit,
  **Trusted by you** for a commit the owner trusted, and **No longer
  verified** for one installed as verified that a later release dropped
  (which then offers **Check for update**).

### Prebuilt apps (version 1)

The rest of this section is about the sandboxed kind.

#### What the repository needs

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

#### What the sandbox means for the app

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
  available. What should last goes in `system.data`, the app's own folders,
  which works here as in any app; its calls answer with promises.
- Pointer lock works. Pop-ups, downloads, fullscreen, the clipboard, forms
  and navigating the desktop do not.
- WebAssembly compiles, but there are no threads: the frame isn't
  cross-origin isolated, so `SharedArrayBuffer` doesn't exist there.
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
