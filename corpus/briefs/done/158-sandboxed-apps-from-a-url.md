# Brief 158 — Sandboxed apps installed from a URL

## Context

Brief 120 installs apps from the in-repo catalog (`marketplace/<id>.json`) at
reviewed, pinned commits, and runs them natively in the desktop's page. The
original ask of [the todo](../../todos/promoted/install-apps-from-github.md) is still
open: paste a GitHub URL, press Install, and get the app on the desktop.
[decisions-marketplace.md](../../wiki/decisions-marketplace.md) says an app from
an arbitrary URL must use `runtime: "sandboxed"`, the iframe transport brief 48
designed the `system` handle for. On 2026-10-06 the owner parked it; on
2026-10-07 the owner said to build it now.

The threat model flips for these apps: an app from a URL nobody reviewed is
**potentially malicious**, not just buggy. Everything below follows from that.

## Decisions (made 2026-10-07, recorded in decisions-marketplace.md)

1. **Prebuilt only.** The repo carries the built module; the OS runs no
   install, build or server for a URL app. Code from an unreviewed URL never
   executes on the machine, only in the browser, inside the sandbox.
   Rejected: build on install (it runs the repo's scripts and every npm
   dependency as the desktop's user, with the home volume readable: the risk
   brief 120 accepted only because the catalog is reviewed); service apps (the
   same, as a long-lived process).
2. **Same port, opaque origin.** The app runs in
   `<iframe sandbox="allow-scripts allow-pointer-lock">`, so its origin is
   opaque. Every response on the sandbox routes also carries the CSP `sandbox`
   directive, so the document stays opaque even if someone opens its URL in a
   tab. Rejected: a second port like the Browser's (brief 50). The Browser needs
   `allow-same-origin` because real websites need their storage and cookies;
   these apps don't, and a port means more deploy configuration.
3. **A per-window capability URL instead of the cookie.** An opaque-origin
   frame sends no `SameSite=Lax` cookie, so the app's files are served under
   `marketplace/sandbox/<token>/`. The token is 32 random bytes minted by an
   authenticated request when the window opens. It is revoked when the window
   closes, when the app is uninstalled or updated, and after 6 hours unused, and
   it lives in memory. The token is the authentication for those routes, which
   are otherwise `@Public()`.
4. **The frame's CSP fences the network.** `default-src 'none'`, with
   `'self'` (plus `blob:`/`data:` where needed) for scripts, styles, images,
   fonts, media, connect and workers. The app cannot reach another origin. On
   `'self'` it carries no ambient credentials: no cookie (opaque initiator), and
   `Origin: null` fails the guard's CSRF check on mutating routes.
5. **Capabilities: `notify` only**, plus the always-present `window`,
   `appearance` and `on`. `fs`, `http`, `intents`, `shortcuts` and `schedule`
   each hand over the owner's files or session, or reach other apps, so a
   manifest asking for any of them is refused with a message naming it. They
   can be added one at a time, with consent text, when an app needs one.
   `notify` actions are dropped (they deliver an `openApp` payload, which is
   `intents`).
6. **The manifest is `imbatranim.json`** at the app's directory in the repo.
   The installed id is derived from the source, not chosen by the author:
   `x-` plus the first 12 hex characters of the SHA-256 of the normalized source
   (`<repo url>#<subdir>`). Catalog ids may no longer start with `x-`.
7. **GitHub only** (`https://github.com/...`), plus `file:` behind
   `MARKETPLACE_ALLOW_LOCAL_REPOS` for tests. The URL may name a branch, tag
   or full commit (`/tree/<ref>[/<subdir>]`); the default branch otherwise. The
   resolved commit is what gets pinned and shown.
8. **Consent on every install and update**: the pane shows the repo, the
   commit, the capabilities and a plain warning before anything is kept.
   Update = resolve the stored URL again and, if the commit moved, consent
   again.

## Contracts (the chunks build against these; do not change them unilaterally)

### A. The app's manifest — `imbatranim.json`

```json
{
  "schemaVersion": 1,
  "name": "Hollow",
  "description": "A generational social-emergence sim in a small 3D town.",
  "meta": ["game"],
  "entry": "dist/hollow.mjs",
  "window": { "defaultSize": { "w": 960, "h": 640 }, "minSize": { "w": 640, "h": 400 } },
  "capabilities": [],
  "icon": "gamepad-2",
  "minSystemVersion": 2
}
```

Strict: unknown keys are refused. `name` 1–60 chars, `description` up to 300,
`meta` up to 8 short strings. `entry`: relative, ends in `.mjs`/`.js`, inside a
directory, not in `node_modules`, no `..`, `\` or NUL. The served directory is
`dirname(entry)`, at most 256 MB. `window`, `icon`, `minSystemVersion` mean what
they mean in a catalog descriptor. `capabilities` ⊆ `["notify"]`; anything else
is refused by name.

### B. Backend HTTP (all under `/api`)

| Method | Path | Auth | Result |
|---|---|---|---|
| POST | `marketplace/url/inspect` `{url}` | session | 200 `Inspection` · 400 `{message}` for a bad URL, ref or manifest · 502 fetch failed · 504 timeout |
| POST | `marketplace/url/install` `{pending}` | session | 200 the app's `MarketplaceApp` · 404 pending unknown or expired |
| DELETE | `marketplace/url/pending/:pending` | session | 204 |
| GET | `marketplace` | session | as today, plus URL apps |
| DELETE | `marketplace/apps/:id` | session | 204, now also for URL apps |
| POST | `marketplace/apps/:id/sandbox` | session | 200 `{ path: "marketplace/sandbox/<token>/" }` · 404 unless an installed URL app |
| DELETE | `marketplace/sandbox/:token` | session | 204 |
| GET | `marketplace/sandbox/:token/` | token | the shell HTML |
| GET | `marketplace/sandbox/:token/runtime.js` | token | the runtime |
| GET | `marketplace/sandbox/:token/app/*path` | token | a file from the entry's directory |

```ts
type Inspection = {
  pending: string            // opaque id, 15-minute TTL, at most 4 at once
  id: string                 // the derived x-… id
  manifest: { name: string; description: string; meta: string[]; icon: string;
              capabilities: string[]; window: {...}; minSystemVersion: number }
  source: { url: string;      // normalized, e.g. https://github.com/o/r/tree/main/sub
            repo: string;     // https://github.com/o/r
            ref: string | null; // branch/tag asked for; null = default branch
            commit: string;   // 40 hex
            subdir: string | null }
  current: { commit: string } | null   // set when this id is already installed
}
```

`MarketplaceApp` (the list entry) gains `runtime: 'native' | 'sandboxed'` and,
for URL apps, `source: Inspection['source']`. A URL app has no `entryPath` and
no server; `capabilities`, `name`, `description`, `icon`, `window`, `meta` come
from its stored manifest.

Every sandbox response carries:

```
Content-Security-Policy: sandbox allow-scripts allow-pointer-lock; default-src 'none';
  script-src 'self' blob: 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:;
  connect-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'none';
  object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'
X-Frame-Options: SAMEORIGIN
Access-Control-Allow-Origin: *        (and no Access-Control-Allow-Credentials)
Cross-Origin-Resource-Policy: cross-origin
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

The shell is:

```html
<!doctype html><html><head><meta charset="utf-8">
<meta name="imb-entry" content="app/<basename of entry>">
<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}</style>
<script type="module" src="runtime.js"></script></head><body></body></html>
```

### C. Frame ↔ desktop messages (protocol `v: 1`)

Handshake on `window.postMessage` (target `'*'`, because the frame's origin is
`null`):

- frame → parent `{ imb: 'sandbox-ready', v: 1 }`. The parent accepts it only
  when `event.source === iframe.contentWindow`. Every accepted `ready` (a
  reload sends another) gets a fresh `MessageChannel`, and the old port is
  closed.
- parent → frame `{ imb: 'sandbox-init', v: 1, init }` with `port2`
  transferred. `init = { appId, windowId, protocolVersion, capabilities,
  appearance: {theme, accent}, focused, visible }`. The runtime accepts it only
  from `event.source === window.parent`, once per page load.

On the port, frame → parent:

- `{ t: 'call', id, path, args }` where `path` is one of `notify`,
  `window.setTitle`, `window.requestClose`, `window.focus`, `window.hide`,
  `window.show`. The parent answers `{ t: 'return', id, ok: true, value }` or
  `{ t: 'return', id, ok: false, error }`. An unknown path or an ungranted
  capability is an error return, never a throw on the desktop side.
- `{ t: 'close-guard', set: boolean }`: the app registered or dropped its
  `onCloseRequest` guard.
- `{ t: 'close-answer', id, allow: boolean }`.
- `{ t: 'activate' }` on a pointerdown or focus inside the frame (throttled), so
  the desktop raises and focuses the window.
- `{ t: 'mounted' }` / `{ t: 'failed', message }`: the module did not load,
  `mount` is missing or threw, or `minSystemVersion` is too new.

Parent → frame:

- `{ t: 'event', name, payload }` for `focus`, `blur`, `visibility` and
  `appearance-changed`. The runtime caches focus, visibility and appearance so
  `isFocused()`, `isVisible()` and `appearance.get()` stay synchronous.
- `{ t: 'close-ask', id }`. The parent's guard asks while the app has a guard
  set, and the frame answers with `close-answer`. With no answer in 60 s, the
  window closes.
- `{ t: 'unmount' }`, sent best-effort before the iframe is removed.
  Removing the frame stops everything the app started anyway.

The parent validates every message's shape and drops the malformed. Notify
input is checked: `title` 1–200 chars, `body` up to 2000, `level` in the enum,
`actions` dropped. It is rate-limited to 5 per 10 s per window. `setTitle` takes
a string of up to 200 chars. `notify` returns a runtime-generated id to the
app.

### D. The runtime (inside the frame)

Plain JS, no dependencies. In order:

1. If `self.origin !== 'null'` or `window.parent === window`, show a one-line
   notice and stop. Never load the app un-sandboxed.
2. Install shims:
   - `Worker`: an http(s) URL becomes a blob bootstrap that does
     `import "<abs>"` (module) or `importScripts("<abs>")` (classic), because an
     opaque-origin document cannot start a worker from a URL.
   - `localStorage` and `sessionStorage`: in memory, because the real ones throw
     here and they don't persist in v1.
   - `document.cookie`: inert.
3. Handshake, build the `system` object (proxy members per C; an ungranted
   member throws `"<app> did not ask for system.<x>"` like `scopeHandle`), and
   wire `activate`.
4. `import(new URL(entry, document.baseURI))`, then
   `mount(container, system, { appId, assetBase: <entry dir URL ending in "/">, server: null })`,
   where `container` is a full-size element in `<body>`. Report `mounted` or
   `failed`.

## Chunks

1. **Backend** (`apps/backend/**` except the two static files below): URL
   parsing and ref resolution (`git ls-remote` with brief 120's git env and a
   60 s limit; annotated tags peeled), the clone (reuse brief 120's fetch
   steps; refuse a clone over 512 MB), manifest schema, pending inspections,
   install and uninstall, a DB migration (11) adding `runtime`, `source` (JSON)
   and `manifest` (JSON) to `marketplace_apps`, tokens, the sandbox routes and
   headers. The native routes (`apps/:id/b/...`, `install`, `lease`, `server`)
   refuse sandboxed apps, and catalog ids starting with `x-` are refused. Unit
   tests plus e2e against real `file:` repos: inspect → install → token → shell,
   runtime and file served with the headers above; no cookie and a bad token
   are 404; `..`, dotfiles and symlinks out are 404; uninstall revokes tokens;
   a manifest asking for `fs` is refused; a native route for a URL app is 404.
2. **Runtime** (`apps/backend/src/modules/marketplace/sandbox/runtime.js`, and
   the shell template if kept as a file there): D above. Add the folder to
   `nest-cli.json` assets like `modules/browser/static`.
3. **Desktop host** (`apps/core/src/modules/marketplace/`,
   `apps/core/src/shared/registry/marketplace.tsx`): `SandboxedAppHost.tsx` mints
   the token, renders the iframe (`sandbox="allow-scripts allow-pointer-lock"`,
   `referrerPolicy="no-referrer"`), runs C's parent side against the window's
   handle narrowed by `scopeHandle` to the granted capabilities, forwards
   events, registers the async close guard while the app has one, and revokes
   the token on unmount. A `failed` message lands in the window's error panel.
   The registry picks `SandboxedAppHost` for `runtime: 'sandboxed'`. Keep the
   message handling in a DOM-free module (`sandboxBridge.ts`) with vitest
   tests.
4. **Marketplace pane** (`apps/core/src/modules/settings/MarketplaceSettings.tsx`
   and any new component beside it): an "Install from a URL" section (URL
   field, Check, the consent card with repo, ref, short commit, subdir,
   capabilities in plain words, the warning and Install/Cancel); URL apps in
   the list with a "From a URL" badge, Open, Check for update (inspect again:
   "Up to date" or the consent card) and Uninstall.
5. **Docs and corpus** (controller): `marketplace/README.md` gets the
   author's guide for URL apps; decisions-marketplace.md gets the revisit and
   the calls above; glossary, status, log; the todo closes.

## Must preserve

Brief 120's catalog flow, unchanged, and all its tests. No URL app file is ever
served on a route without the sandbox headers. Every non-sandbox route keeps
`X-Frame-Options: DENY` and `frame-ancestors 'none'`. No new runtime
dependency, no sudo, no new Linux package.

## Acceptance

- `npm run typecheck`, `npm run lint` and the backend unit + e2e and core tests
  pass.
- In a browser, Hollow installs from a URL (a local `file:` repo holding its
  prebuilt `dist/os` plus `imbatranim.json`, under the test flag) and runs in
  its window: the town renders and the sim worker runs.
- From inside the frame, `fetch('/api/marketplace')` is a 401,
  `parent.document` throws, and `fetch('https://example.com')` is blocked by
  CSP.
- Uninstall closes the app's windows, and its old token URL returns 404.
- An adversarial security review of the diff, before commit.

## Outcome (2026-10-07)

Built as specified, with these changes. The calls and the measurements
behind them are in
[decisions-marketplace.md](../../wiki/decisions-marketplace.md#brief-158-apps-from-a-url-2026-10-07);
the author's guide is in [marketplace/README.md](../../../marketplace/README.md#apps-from-a-url).

**Changes to the contracts:**
- **Module workers.** Chrome refuses a module worker whose script is a blob
  from an opaque origin. The runtime's `Worker` shim starts a classic worker
  that `import()`s the module, and holds messages until it has run.
- **Close guard.** A guard that throws counts as `allow: false`, as in the
  in-process handle.
- **Frame protocol.** The frame also posts `{ imb: 'frame-blur' }` (outside
  the port) when its keyboard leaves it.
- **Listing.** A damaged URL-app row is a `problems` entry with `appId`, and
  the pane offers Uninstall for it.

**From the adversarial review (no Critical or High):**
- **Screen takeover.** A click shield over background frames. `focus`/`show`
  only while engaged. Rate limits on `setTitle` and `notify`. Pressing close
  twice closes. Window caps of 1600×1000 and 800×600.
- **Disk fill before consent.** `.git` and the tree are measured before
  checkout, with `.gitattributes` filters off.
- **Fork commits.** A bare commit must be a branch or tag tip.
- **Crashes.** `constructor` as an icon name crashed the pane; a bad row
  broke the listing.
- **"Check for update".** It could switch to a different app.
- **Logs.** Tokens are redacted.

**Found by the Chrome walk, past the review:**
- **Keyboard.** A background frame can take the keyboard, and the page can't
  attribute it. This led to the page-wide keyboard guard, plus `frame-blur`
  reports from the runtime and the Browser's host page.
- **Network exits.** WebRTC reached an outside STUN server, so it is removed
  in the runtime, and DNS prefetching is off.
- **Window order.** Windows were sorted by z-index in the DOM, which reloaded
  any iframe on raise. They now render in a stable order.

**Verified:**
- `npm run typecheck`, `lint` and `format:check` pass (31 tasks).
- Backend: 727 unit tests and 168 e2e tests (25 in
  `marketplace-url.e2e-spec.ts`). Core: 452 tests.
- **Chrome walk** (local stack, the test flag on), with Hollow's prebuilt
  `dist/os` plus `imbatranim.json` in a `file:` repo:
  - Hollow installs, its 3D town renders, the worker ticks, and it survives
    a backend restart and a page reload.
  - A hostile probe app:
    - finds `origin null`, and `parent.document` throws;
    - gets no cookie: GET 401, POST 403;
    - is blocked from `example.com`;
    - can't reach `fs` or `http`, and opened top-level it stays inert;
    - is closed by pressing close twice;
    - can't keylog: grabbing every 400 ms, it got nothing from Notepad or
      from Hollow, and was stopped;
    - after uninstall, its token URLs are 404.

**Left for the owner:** push game-engine's `imbatranim-app` branch (Hollow's
built module plus `imbatranim.json`), then install
`https://github.com/gandolh/game-engine/tree/imbatranim-app` from the pane.
Firefox is not walked.
