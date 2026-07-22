# Brief 55 — App marketplace: native web apps via in-repo descriptors

Status: **todo** · Net-new capability, **grilled 2026-07-22 (revised same day
after the "run native, descriptor-in-repo" steer).** **HARD → senior/opus. ≥3
independent chunks → `plan-split-dispatch`.** Spans **repo** (the descriptor
catalog + build integration), **core** (native app-host + registry), and
**backend** (process supervisor + WS proxy for service apps).
**Security-reviewed before commit.** Promotes
[todos/install-apps-from-github.md](../../todos/install-apps-from-github.md).

## Problem

The user has web-oriented games in an external **game-engine** repo (**Hollow**
= client-only; **Farm Valley**, **Citadel** = client + Node sim server) and wants
them on the desktop **running natively** — full DOM/canvas/WebGPU performance,
not boxed in a sandboxed iframe — without hand-authoring an add-on per game.
Built-in apps are build-time workspace packages composed in
`apps/core/src/manifest.ts`; there is no path to pull an *external* repo's app
onto the desktop.

## Grilled decisions (2026-07-22)

Initial grill: (1) manifest-driven install from a URL, (2) build on install,
(3) curated allowlist, (4) both static + service archetypes. **Revised same day
by three steers that supersede parts of the above:**

- **A. Run native, not in an iframe.** The games are web tech like the OS, and
  the engine is canvas/WebGPU-oriented; a sandboxed iframe would cost real GPU
  perf. Installed games run **in the desktop's own realm**, mounted into a real
  DOM node — the soft realization of os-layering's parked "raw-surface
  primitive." (The sandboxed-iframe path from brief 48 is **kept as a future
  `runtime: "sandboxed"` option** for genuinely untrusted, arbitrary-URL apps —
  not this brief.)
- **B. The contract JSON lives in THIS repo, pointing outward.** A descriptor
  catalog in ImbatranimOS (not a file in the game repo — the game repo stays
  clean). Each descriptor points to `repo + ref + subdir` and declares **how to
  build**. **The committed descriptor set is the trust anchor** — it *replaces*
  the runtime allowlist (decision 3). Because every runnable app is one the user
  curated into the OS repo, the app stays **first-party / "buggy not
  malicious,"** so native (no sandbox) is consistent with the locked threat
  model. Arbitrary untrusted URLs are **not** installable natively — that would
  require the sandboxed path.
- **C. Both archetypes, phase 1.** Static (Hollow): build → mount native.
  Service (Farm Valley/Citadel): also spawn/supervise the Node server + proxy its
  WS behind auth (unchanged from the grill).

- **D. Build timing = runtime install-on-demand (locked 2026-07-22).** The
  backend clones + builds each app's external repo **at install time** into the
  home volume and serves/loads the built ESM — **no OS rebuild to add or update a
  game.** The catalog descriptor still ships in this repo (the curation/trust
  anchor), but "Install" is a live action in the running container, not a
  build-step. Consequence: the running image must carry the Node/npm build
  toolchain (**hard dep on brief 51**), and the build runs external code in the
  live container — bounded and acceptable *because* the descriptor is curated
  in-repo at a pinned `ref`. (The build-time-lazy-chunk alternative was
  considered and rejected: the user wants to add a game without rebuilding the
  OS.)

**Depends on:** brief **48** for the `SystemHandle` shape (the `system` object
handed to a native app is the same capability handle — no iframe transport
needed here, just the interface) and brief **51** (the live container must carry
the build toolchain, since install builds on demand). Ship 48 + 51 first.

## The native contract — how a built game "runs"

To run native without coupling to core's React version, the boundary is the
**DOM**, not the component tree. The built game is an **ESM bundle** exporting:

```ts
export function mount(container: HTMLElement, system: SystemHandle): void
export function unmount(container: HTMLElement): void
```

The OS opens a window, hands the game its content DOM node + a
capability-scoped `system` handle, and calls `mount`; on window close it calls
`unmount`. The game renders itself however it likes (its own React, or raw
canvas/WebGPU) into that node — real GPU, no iframe, no React duplication in one
tree. This is os-layering's "attach a buffer" / raw-surface idea, kept minimal.

## The descriptor — `marketplace/<id>.json` (in THIS repo)

```jsonc
{
  "schemaVersion": 1,
  "id": "hollow",
  "name": "Hollow",
  "description": "…",
  "meta": ["game"],
  "source": {                          // where — points OUT to the game repo
    "repo": "https://github.com/gandolh/game-engine",
    "ref": "v1.2.0",                   // pinned tag/commit → reproducible
    "subdir": "games/hollow"           // monorepo path (optional)
  },
  "type": "static",                    // "static" | "service"
  "runtime": "native",                 // "native" (this brief) | "sandboxed" (future)
  "build": {                           // how — declarative build recipe
    "install": "npm ci",
    "command": "npm run build",
    "entry": "dist/hollow.mjs"         // the mount/unmount ESM the OS imports
  },
  "server": {                          // service type only
    "command": "node server/index.js",
    "portEnv": "PORT",                 // OS injects the allocated port here
    "health": "/health"
  },
  "window": { "defaultSize": {"w":960,"h":640}, "minSize": {"w":640,"h":400} },
  "capabilities": ["fs", "http"],      // the system.* surfaces the mount handle grants
  "icon": "gamepad-2",                 // named lucide icon or a data URL (declarative)
  "minSystemVersion": "1.0.0"          // SystemHandle PROTOCOL_VERSION targeted
}
```

## Fix (chunks — independently dispatchable)

1. **Descriptor schema + catalog** — `marketplace/` dir + a typed loader/validator
   in core; validate every descriptor (schema, pinned `ref` present, declared
   `capabilities`). The catalog is the source of truth for what's installable.
2. **Backend installer + build runner (runtime, on-demand)** — a `marketplace`
   backend module (owner-authed, no `@Public()`): on Install, shallow-`git clone`
   `source.repo` at the pinned `ref` into `~/.imbatranim/apps/<id>` (on the home
   volume, survives container recreate), `cd subdir`, run `build.install` +
   `build.command` **as `imbatranim`**, bounded (timeout, output-size cap, no
   network beyond the npm registry), reusing the jailed-exec plumbing; capture
   build logs; record the built `build.entry` path in an installed-apps registry
   (SQLite). Endpoints: install / uninstall (`rm` clone + deregister) / update
   (`git fetch` + re-checkout ref + rebuild) / list. The built ESM is served on a
   **per-app session-authed static route** at a dedicated scope. Jest tests:
   install → registry round-trip; non-catalog `id` refused; build timeout/size
   cap enforced; uninstall cleans clone + registry.
3. **Core native app-host** — an `AppConfig` whose component is a **NativeAppHost**
   window wrapper: `React.lazy`-`import()` the game's ESM, `mount(container,
   system)` on open into the window content node, `unmount` on close, wrapped in
   the brief-47 error boundary. Inject a `system` handle scoped by the
   descriptor's `capabilities[]`. Installed apps flow through the **same filtered
   registry** as the add-on manager (brief 46), not a parallel one.
4. **Process supervisor + WS proxy (service apps)** — backend module: spawn
   `server.command` as `imbatranim` with a port from a **bounded range**
   (injected via `portEnv`), restart-on-crash with backoff, resource + lifetime
   bounds, stop on close/uninstall; **proxy the app's WebSocket behind
   `SessionAuthGuard`** (reuse the PTY + `http-proxy` primitives — the first
   supervised long-lived process, scoped to marketplace apps only). Jest tests:
   port alloc, restart, unauth WS refused, teardown.
5. **Settings / launcher UI** — a Marketplace pane listing catalog entries with
   install/enable state + build status; reuse **Bookmarks** via `openApp('<id>')`
   intents rather than rebuilding launch UI.

## Reopens locked decisions — REQUIRED revisit before this ships

Per corpus rules, add a `wiki/decisions.md` revisit + `log.md` entry for:

- **"No runtime package manager (`manifest.ts` is it)"** → *reversed*: a curated,
  in-repo descriptor catalog drives a **runtime** install-on-demand manager that
  clones + builds external apps in the live container. **Build-from-source is
  reinforced** (clone + build at a pinned ref, no image registry), but the
  "install = add a build-time module" stance from brief 13 is genuinely flipped —
  log it.
- **"No separate supervisor daemon" (kill-list)** → *extended*: service apps need
  a per-app process supervisor. Scope it strictly to marketplace apps; it is not
  a general init.
- **Native (unsandboxed) execution of externally-sourced code** → allowed **only
  for in-repo-curated descriptors at pinned refs** (the trust anchor keeps them
  first-party). Any future arbitrary-URL install MUST use `runtime: "sandboxed"`
  (the brief-48 iframe transport). Record both stances; they differ on purpose.

## Must preserve (regression surface)

- Only descriptors present in the in-repo catalog are runnable; a native app is
  never built/run from an un-curated source at runtime.
- Native game mounts into its window's DOM node and is wrapped by the brief-47
  error boundary — a crashing game collapses its own window, not the desktop.
- Build/server processes run as **`imbatranim`, no root, no sudo, no new system
  packages**; a native-dep-requiring repo fails cleanly.
- Service app's raw port is never exposed; its WS is reachable only through the
  **auth-guarded proxy**; closing/uninstalling stops the process.
- Installed/enabled state + cloned source + built assets live on the **home
  volume** and survive **container recreate**; a re-created container does not
  need to re-clone/re-build already-installed apps.
- CSP additions for a service app's proxied WS are **scoped**, tightened with
  SEC-9 ([csp-connect-src-ws-wildcard](../../todos/csp-connect-src-ws-wildcard.md))
  — no new wildcard.
- Add-on manager (brief 46) still filters the roster; marketplace apps ride the
  same enable/disable path. `manifest.ts` stays the registration point for
  **built-in** add-ons; this is a second, catalog-driven registry beside it.
- Lazy boundaries (brief 33) preserved — no game code in the eager bundle.

## Verify bar

`turbo typecheck`, backend + core lint/format, `backend#test` green (supervisor +
proxy-auth tests), `turbo build` ok (incl. the descriptor build step).
**Adversarial security review** (runtime build-step escape/resource exhaustion in
the live container, a native app reaching past its granted `capabilities`,
unauthenticated reach of the installer routes or a service app's port/WS,
clone-path/ref tampering, a descriptor or install request with a non-pinned ref,
installing an `id` not in the catalog) — findings fixed before commit.
**Human-gated:** with a **Hollow** descriptor in the catalog, click Install → it
clones+builds live and mounts native in a window and plays (GPU, no iframe); add
**Farm Valley** → its server process comes up, WS proxies behind auth, it plays;
restart the container → both survive and relaunch **without re-building**; crash a
game → only its window shows the error panel; uninstall → clone + assets +
process gone.

## Invariants

Auth everywhere (served assets, proxied WS — owner-authed). Real-not-simulated
(real `git`, real build, real process, real GPU — on-soul). No sudo/unprivileged
preserved. Build-from-source reinforced (clone + build at pinned ref, **no
registry**). **Lightweight in tension**: runtime install-on-demand needs the
build toolchain resident in the image (brief 51), each installed app's source +
build output sits on the volume, and each service app is a live process — name
this weight in the outcome; a user who installs nothing pays only the resident
toolchain, and unopened installed games stay lazy (idle cost ~zero).

## Out of scope (phase 2+)

`runtime: "sandboxed"` iframe path for untrusted arbitrary-URL apps (brief 48
transport), an external marketplace/registry index, app auto-update policy,
inter-app IPC (kill-list holds), native/system-dependency apps, and app signing
beyond the pinned-ref + in-repo-descriptor trust anchor.
