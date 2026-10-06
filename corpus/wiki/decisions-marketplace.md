---
summary: Brief 120's calls (2026-10-06) — the three kill-list revisits it required (a runtime installer driven by the in-repo catalog, a supervisor fenced to marketplace servers, native code from outside only at pinned commits), and the build's own calls (commit ids not tags, argv not shell, per-build directories, the allowlisted build environment, only the entry's directory served, the `host` argument to `mount`, capabilities as a fence), with the residual risks accepted.
updated: 2026-10-06
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
  (the brief-48 iframe transport), which is not built. The two stances differ
  on purpose.

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
