---
summary: The app marketplace's locked calls. Brief 120 (2026-10-06) — the kill-list revisits for the in-repo catalog (a runtime installer, a supervisor fenced to marketplace servers, native code only at pinned commits) and its build calls (commit ids, argv, per-build dirs, the allowlisted build env, capabilities as a fence). Brief 158 (2026-10-07) — apps from any GitHub URL, unreviewed, so prebuilt only, an opaque-origin sandboxed frame on the same port, per-window token URLs, notify as the only capability, and consent on every install and update.
updated: 2026-10-07
---

# Decisions: the app marketplace (brief 120, 2026-10-06)

Split out of [decisions-estate-era.md](decisions-estate-era.md), which has a
200-line cap. Same rule: changing an entry needs an explicit revisit and a
`log.md` entry.

Built from the 2026-07-22 grill. Three locked decisions are revisited, as the
brief required, and the build added some calls of its own.

**Revisits.**

- **"No runtime package manager (`manifest.ts` is it)": reversed, narrowly.**
  The in-repo catalog (`marketplace/<id>.json`) drives an installer that clones
  and builds external apps in the live container. Build-from-source still
  holds: each app is cloned at a pinned commit and built on the machine, with
  no registry and no prebuilt artifacts. What flips is brief 13's "installing
  an app means adding a build-time module". `manifest.ts` stays the one place
  built-in add-ons are composed. Marketplace apps join the same
  `APP_REGISTRY` at runtime, so they are enabled, disabled and launched the
  same way.
- **"No separate supervisor daemon": extended, fenced.** Service apps' servers
  are supervised by the backend (`MarketplaceServers`): a port from
  41000–41999 on 127.0.0.1, a 30 s health wait, restarts with a growing delay,
  and a stop after five crashes in two minutes. At most four run at once. A
  server runs while an open window holds a lease or a proxied socket is open,
  and stops otherwise. It supervises marketplace servers and nothing else; it
  is not an init.
- **Native (unsandboxed) code from outside the repo: allowed only for in-repo
  descriptors pinned to a commit.** That pin is what keeps such an app
  first-party ("buggy, not malicious"), so it runs in the desktop's own page
  at full speed. An app from an arbitrary URL must use `runtime: "sandboxed"`
  (the brief-48 iframe transport), built by brief 158 (below). The two
  stances differ on purpose.

**Calls the build made.**

- **`ref` must be a full 40-character commit id.** The brief's example used a
  tag, but a tag can be moved after review. The installer also checks that
  `HEAD` after checkout is that commit.
- **Commands are argv arrays, not shell strings.** The brief's example had
  `"npm ci"`. With no shell, a descriptor cannot chain or substitute commands.
- **Each build is its own directory, `apps/<id>@<buildId>`, and the database
  row names the live one.** No rename is involved, so tools that bake absolute
  paths keep working. A failed build leaves the previous one live. At boot, a
  directory no row names is deleted (an install interrupted by a restart).
  The build id is in the served URL, so the files are cached as immutable and
  an update can never mix old and new chunks.
- **Builds see an allowlisted environment** (`PATH`, locale, a private `HOME`,
  `TMPDIR` and npm cache under `apps/.cache`), not the backend's minus a
  denylist. So no `WARD_*` setting, no database path, and no `~/.npmrc` or
  `~/.gitconfig` token reaches them. Git runs with hooks off, no system or
  global config, and `GIT_ALLOW_PROTOCOL` set to the descriptor's scheme.
  Each step is its own process group, killed whole at a 15-minute deadline;
  the log keeps the last 64 KB of output.
- **Only the entry's directory is served**, and the entry must be inside one
  (`dist/app.mjs`). The app's top level holds its source and `node_modules`.
  Every file is resolved through `realpath` and must stay inside that
  directory, so a symlink out of the build is a 404. Dotfiles are refused, and
  the directory may hold at most 256 MB.
- **`mount(container, system, host)`: a third argument.** The brief's contract
  gave a service app no way to find its server. `host` carries the app id,
  the URL of its module's directory, and the server's `http` and `ws` URLs
  through the proxy. It is not part of `SystemHandle`: it is the native
  host's business, not a protocol promise.
- **Capabilities are a fence, not a sandbox.** A member of `system` that the
  descriptor did not list throws an error naming it. The app's code still runs
  in the page and could call `fetch` itself; the catalog is the trust anchor,
  as above.
- **A service app's server is reached only through the desktop's port.**
  WebSockets go through `UpgradeRoutes`, which `PtyGateway`'s single upgrade
  handler dispatches to. Its checks are the terminal's: session, grant and
  Origin, with a revocation sweep every 30 s. Plain HTTP is `GET`/`HEAD` only.
  The server never receives the desktop's cookie or `Authorization`, and its
  `Set-Cookie` and CSP headers are dropped. `connect-src 'self'` already
  covers the same-origin socket, so CSP gains nothing.
- **Installed builds are left out of backups** (`./.imbatranim/apps`). They
  are hundreds of MB and can be rebuilt from the catalog. After a restore, the
  pane shows "build missing" and offers Reinstall.
- **The catalog is root-owned in the image** (`/app/marketplace`), like the
  rest of its code: the app reads it and never writes it.
- **The dev container now reaches the API through Vite's proxy** (`/api`, same
  origin), the way the deploy does. A cross-origin module import carries no
  cookie, so a marketplace app could not load from `localhost:3001`.
- **Residual risks, accepted.**
  - A build runs as the desktop's user, so its code, including every npm
    dependency it installs, can read what that user can: the home volume and
    the backend's `/proc/<pid>/environ`, which holds the Ward app key in Ward
    mode. The pinned commit and its lockfile narrow this to code someone
    chose, but they do not review transitive dependencies.
  - A build has no disk, memory or network limit beyond its deadline. The
    image has no namespace sandbox (bubblewrap) to give it one.
  - `HOST=127.0.0.1` is advice to a server, not a rule. One that binds
    `0.0.0.0` is still unreachable from outside a container that publishes
    none of those ports, but on a host network it would be exposed.

## Brief 158: apps from a URL (2026-10-07)

The owner parked arbitrary-URL installs on 2026-10-06 and asked for them on
2026-10-07. An app from a URL nobody reviewed is treated as **malicious**, not
just buggy. That flips os-layering's threat model for these apps only, and
every call below follows from it.

- **Prebuilt only.** The repo carries the built module; the OS runs no
  install, build or server for it, so code from an unreviewed URL never runs on
  the machine. Rejected: building on install (the repo's scripts and every npm
  dependency would run as the desktop's user with the home volume readable,
  the residual risk brief 120 accepted only because the catalog is reviewed);
  service apps, for the same reason.
- **Same port, opaque origin.** The app runs in
  `<iframe sandbox="allow-scripts allow-pointer-lock">`, and every sandbox
  response also carries the CSP `sandbox` directive, so the document is opaque
  even when opened in a tab. Rejected: a second port like the Browser's
  (brief 50). The Browser needs `allow-same-origin` because real sites need
  their storage; these apps don't, and a port costs deploy configuration.
- **The frame's files sit behind a per-window token, not the cookie.** An
  opaque-origin frame gets no `SameSite=Lax` cookie (verified in Chrome:
  `imb_session` withheld, API 401, mutations 403 on `Origin: null`). So
  `marketplace/sandbox/<token>/` is `@Public()`, and the token, 32 random
  bytes minted by an authenticated call, is the authentication. It is revoked
  when the window closes, on uninstall or update, and after 6 hours unused;
  restarts drop them all.
- **The frame's CSP is the network fence**: `default-src 'none'` and `'self'`
  (plus `blob:`/`data:`) for what the app loads. `'self'` carries no
  credentials, as above. CSP doesn't cover two exits, so they are closed
  separately: WebRTC (a peer connection reached an outside STUN server from
  the frame, measured) is removed by the runtime before the app's code runs,
  and DNS prefetching is off (`X-DNS-Prefetch-Control`).
- **Capabilities: `notify` only**, without actions, rate-limited per window,
  plus the always-present window, appearance and events. `fs`, `http`,
  `intents`, `shortcuts` and `schedule` are refused at install by name; each
  can be added later, one at a time, with its own consent text.
- **`imbatranim.json` in the app's repo, and a derived id** (`x-` plus 12 hex
  of the source's SHA-256). Catalog ids may not start with `x-`.
- **GitHub only** (plus `file:` under the test flag). The URL names a branch,
  tag or full commit, or the default branch; the resolved commit is pinned. A
  bare commit must be the tip of an advertised branch or tag: GitHub serves a
  fork's commits through the parent's URL, so any other commit could be an
  attacker's code shown under the genuine repo's name (and id).
  `git ls-remote` runs in an empty folder under `GIT_CEILING_DIRECTORIES`,
  because git otherwise reads the config of a repository around its working
  directory (an `insteadOf` there rewrote the URL in a test).
- **Consent on every install and update**: repo, commit, capabilities and a
  plain warning, before anything is kept.
- **An app cannot hold the screen.** While its window is in the background,
  a transparent shield covers the frame: the first click only raises the
  window, and nothing the frame says can. `focus`/`show` work only while its
  window is in front and its frame has the keyboard;
  `setTitle` and `notify` are rate-limited per window; a second close within
  10 s of a refusal closes without asking; the window is at most 1600×1000 and
  can shrink to 800×600. Without these, a URL app could draw a fake lock
  screen that stays on top and won't close.
- **A page-wide keyboard guard, because Chrome lets a frame take the
  keyboard.** Measured in Chrome 150: a background frame calling `focus()`
  gets every key the owner types into Notepad, and the page learns only a
  `window` blur, with `activeElement` naming the stale textarea. `inert`,
  `display: none` and the `focus-without-user-activation` policy don't stop
  it, and a plain `focus()` on an element the page already names is a no-op.
  So `keyboardGuard.ts` (one listener for the page) takes the keyboard back
  with `blur(); focus()` to where the owner was, on every page blur that
  leaves focus inside the page. Frames we serve (the sandbox runtime, the
  Browser's host page) report `frame-blur` when their keyboard leaves them,
  which covers a theft from a frame in front, and a URL app's frame is
  blurred when another window comes up over it. An app that takes it twice
  within 10 s is stopped. Verified in Chrome: typing into Notepad and into
  another URL app while a hostile app grabs every 400 ms, every key landed
  where it was typed and the thief was stopped. Rejected: per-frame
  detection from `activeElement` (stale in the real browser, though it
  passes in jsdom).
- **Windows render in a stable DOM order.** They used to be sorted by
  z-index, so raising one moved its DOM node, and a browser reloads an iframe
  whose node moves: a URL app (and the Browser's page) restarted on every
  raise. Each window stacks by its CSS z-index, so DOM order never mattered
  for what is on top.
- **The clone is sized before it is written.** After the fetch and before
  checkout, `.git` and the tree (`ls-tree -r -l`, duplicates counted) must be
  under 512 MB and 20 000 entries; a tiny pack can otherwise expand to
  hundreds of MB on the home volume before consent.
- **Module workers run as classic workers that `import()` the module.**
  Chrome refuses a module worker whose script is a blob from an opaque origin;
  the runtime's shim holds messages until the module has run.

**Residual risks, accepted.**
- A frame can navigate itself; its own CSP cannot stop that. The desktop's
  `frame-src` does (`'self'`, plus the Browser's proxy origin when it is on),
  which is why widening `frame-src` would open an egress path. The proxy is
  not one: its relay wants a session and the proxy's own Origin, and a
  sandboxed frame has neither (and cannot register the proxy's service
  worker). So a navigation reaches only this machine's servers.
- Chrome may run the frame in the desktop's process, so an app that spins
  forever can still freeze the tab.
- The fetch itself is bounded only by its 5-minute timeout; `.git` is
  measured after it. The owner is the one pasting the URL.
- Firefox is not walked; Chrome is. Firefox's SameSite rules for an opaque
  frame may differ, and CORS plus the Origin check are the backstop there.

