# Brief 74 — URL apps install natively once verified or trusted

## Context

Since 2026-10-07 an app installed from a URL is treated as malicious.
- It runs prebuilt in an opaque-origin frame, with `notify` only, and
  nothing of it runs on the machine.
- Its repo carries the built module and an `imbatranim.json` app manifest
  (`marketplace/README.md`, "Apps from a URL").
- The code is in `apps/backend/src/modules/marketplace/`
  (`marketplace-url.service.ts`, `source-url.ts`, `url-app-record.ts`,
  `app-manifest.ts`, `sandbox*`). Ids are derived as `x-` plus 12 hex.

On 2026-11-06 the owner revisited that: every app should run natively, like
a Windows install. Verified apps install smoothly; unverified ones show a
warning and install natively only if the owner trusts them
([decisions-app-identity-and-trust.md](../../wiki/decisions-app-identity-and-trust.md#url-apps-run-natively-once-trusted-revisits-2026-10-07)).
The research behind the warning's shape is in
[research-unix-and-windows-conventions.md](../../wiki/research-unix-and-windows-conventions.md):
Windows SmartScreen, macOS Gatekeeper and Flathub's verified badge. Promoted
from the todo `url-apps-install-natively-once-trusted`.

## Depends on

- Brief 63, since `verified.json` lives in imbatranim-apps;
- brief 68 (identity);
- brief 69 (data folders);
- brief 70 (file grants).

A native URL app gets the same rules as every installable app.

## Owner decisions (settled 2026-11-06)

1. **The verified list** is `verified.json` in imbatranim-apps. Each entry
   names a repo and a pinned commit. The OS reads it at a commit pinned with
   each OS release, so nothing changes between updates and an OS update
   brings the newer list.
2. **A verified app** installs like a Marketplace app, with no warning, and
   updates like one.
3. **An unverified app** shows a warning first, with these parts:
   - the publisher, meaning the GitHub owner and repo, and the commit;
   - the capabilities it asks for;
   - a plain line saying that a trusted app acts as the owner, Terminal
     included;
   - "Trust and install" behind a "More info" step, as Windows SmartScreen
     does.

   The choices are trust or cancel; there is no sandboxed option. Each new
   commit asks again.
4. **A native URL app builds from source** at its pinned commit, from a
   descriptor in its repo, like a Marketplace app. The same capabilities
   fence, identity rules and file grants apply.
5. **Settings → Marketplace shows each app's source**, with a Verified badge
   or "Trusted by you".
6. **The sandboxed frame path** (the frame, its tokens and its share of the
   keyboard guard) is retired in its own todo once nothing uses it. Until
   then, URL apps installed sandboxed keep working.

## What to do

1. **The repo's file.** `imbatranim.json` grows a v2 shape for native apps,
   the catalog descriptor's fields minus `source`:
   - `type`, `build` (argv `install` and `command`, `entry` or `output` and
     `apps`);
   - `server` for a service app;
   - `sharedKit`, `capabilities`, windows, `opens` and the hooks.

   Validate it with the catalog's own schema. A v1 file (prebuilt) stays
   readable for the sandboxed path until it is retired.
2. **The verified list.**
   - In imbatranim-apps, `verified.json` holds entries of repo, commit and a
     short note, with a test that checks the shape.
   - In this repo, a sync script copies it at a given commit into
     `marketplace/verified.json` with the commit recorded, and has a
     `--check` mode, like the office repo's `kit:sync`.
   - The image carries the copy, so reading it needs no network, and the
     recorded commit is the pin.
3. **Installing from a URL.**
   - Resolve the URL to a commit, as today.
   - If the repo and commit are in `verified.json`, install natively with
     no warning.
   - Otherwise show the warning per decision 3, and on trust, install
     natively.
   - Native install is the catalog's installer path (clone at the commit,
     allowlisted build environment, per-build directory, the same limits),
     with the id still derived (`x-…`) so it can't clash with the catalog.
   - The trust record keeps the source, the commit and when it was trusted.
4. **Updates.** A verified app moves when `verified.json`'s entry moves. An
   unverified app's newer commit shows the warning again before it builds.
5. **Settings** (Marketplace) shows each URL app's source with a Verified
   badge or "Trusted by you", and the commit.
6. **Tests:**
   - a verified entry installs without a warning;
   - an unverified one is refused until trusted;
   - trust is per commit, so a new commit asks again;
   - the descriptor is validated;
   - a v1 prebuilt app still installs sandboxed;
   - the sync script's check fails when out of date.
7. **Walk** in the dev container from `file://` repositories:
   - a verified fixture installs and runs in the page;
   - an unverified fixture shows the warning (publisher, capabilities, the
     acts-as-you line, More info), then trust installs it;
   - a new commit asks again;
   - the badges show in Settings.
8. **Corpus:**
   - decisions-marketplace.md: a revisit note pointing to the new page,
     already there;
   - the README's "Apps from a URL";
   - glossary (verified app, trusted app), status, log;
   - a todo for retiring the sandbox per decision 6.

## Files you OWN

- `apps/backend/src/modules/marketplace/` (URL install, app manifest v2,
  trust records, `verified.json` reading), the Marketplace settings pane,
  `marketplace/verified.json` and its sync script
- `marketplace/README.md`, in imbatranim-apps: `verified.json` and its test

## Files you must NOT touch

- The sandbox runtime and frame code, which a later todo retires.
- Catalog descriptors.

## Acceptance

- Tests green; the walk holds.
- An unverified app can't run without the owner's trust at its exact
  commit.
- **Owner check** after the pushes and a deploy: install a known app from its
  URL on the VPS and read the warning.

## Outcome (2026-11-09)

Built by a subagent on `main`, ready for deploy. Commits: imbatranim-apps
`e3b01e0` (`verified.json`, empty, and `tools/verified.test.ts`);
imbatranimOS `6ccf623` (1.232.0, `marketplace/verified.json`, `verified.ts`
and `npm run verified:sync`), `5b9c005` (1.233.0, the native install and
Settings) and `029fa13` (1.234.0, the server upgrade asks about the app only
after the session).

What it does now:
- `imbatranim.json` at `schemaVersion: 2` is a catalog descriptor without
  `id`, `source` and `runtime`, parsed by the catalog's own schema
  (`native-manifest.ts`). `build.entry` is one app, which takes the derived
  `x-…` id; `build.output` with `apps` is several, each `<derived>-<its id>`
  (its id at most 25 characters). Version 1 stays the sandboxed path.
- The check clones and measures as before. A version 2 commit answers
  `runtime: native` and `verified`; `POST url/install` needs `trust: true`
  unless the copy of the verified list names the repo, folder and commit
  (403 otherwise). The install builds the checked clone in place with the
  catalog's installer (allowlisted env, per-build dir, the same limits).
- The trust record lives in the row's `source` JSON (`trust: { by:
  'verified' | 'owner', at }`), with the source and commit; no ledger step.
  It goes with the uninstall. A new commit is a new check, so it asks again.
- A verified app's listed `ref` is the list's commit, so Settings shows
  Update when the list moves and `POST apps/:id/install` builds that commit.
  For a trusted app the same route rebuilds its own commit only.
- The native routes (built files, lease, server proxy, its WebSocket) take a
  native URL app as a catalog app; they refuse a sandboxed row, and an `x-`
  id with no native row, instead of every `x-` id.
- A prebuilt check over a native install is refused (409): uninstall first.
  A native install over a sandboxed one replaces it and revokes its tokens.
- Settings: the warning card for an unverified commit (App, Publisher,
  Commit, what it asks for, "A trusted app runs as you…", More info, then
  Trust and install; Cancel; no sandboxed choice), the Verified card for a
  verified one, and each URL app's row with its source line and a Verified or
  Trusted by you badge; Check for update only on a trusted app.

Choices made here, not owner calls:
- A branch URL whose tip is ahead of the verified commit gets the warning, as
  the brief reads (resolve, then match the commit). A verified app has no
  Check for update; pasting its URL again offers the newer commit with the
  warning.
- `loadCatalog` skips `verified.json`, so no catalog app can be called
  `verified`.
- The sync script is tested with `node --test scripts/verified-sync.test.mjs`,
  which `npm test` doesn't run.

Not done here: the todo `uninstalled-url-apps-read-as-built-ins` lies in
`installed-apps.ts`, outside this brief's files. Native URL apps widen it:
an `x-` id no row holds reads as a built-in and gets `system`. The one-line
fix there: treat `isUrlAppId(appId) && installGroupOf(...) === null` as gone.
New todo per decision 6: `retire-the-sandboxed-url-app-path`.

Checks run: backend typecheck, eslint and prettier on changed files; jest
marketplace, app-identity and db units (427); the marketplace*, app-identity
and file-grants e2e specs (97, with the new `marketplace-url-native`, 12);
core `tsc -b`, eslint and vitest for the registry, marketplace and settings
(364); the sync script's 6; imbatranim-apps' `tools/verified.test.ts` (4) and
its node typecheck. Skipped: full suites, the PTY e2e and the browser walk.

Owner steps: push imbatranim-apps, then this repo, then `node cli.ts
imbatranim-os deploy` from vps-deploy; then install a known app from its URL
on the VPS and read the warning. Which repos go into `verified.json` is
question 1 on the board.

Walk, for the walk agent (dev container, `MARKETPLACE_ALLOW_LOCAL_REPOS` on;
two `file://` repos: one with a version 2 `imbatranim.json` whose build writes
`dist/<name>.mjs` exporting a `mount(el)` that writes text, one prebuilt
version 1):
1. Paste the version 2 URL: the warning shows App, Publisher, Commit, the
   capabilities and the acts-as-you line, with More info and Cancel and no
   Install. More info, then Trust and install: the row says From a URL and
   Trusted by you with its source line; Open renders the app in the page.
2. Commit again in the fixture; Check for update shows the warning again;
   trust installs the new commit.
3. Edit `marketplace/verified.json` locally with a `file://` entry (repo,
   `subdir`, commit; keep `from` and `commit`): pasting the URL shows the
   Verified card and Install with no warning. Move the entry to a newer
   commit: the row says An update is available; Update builds it.
4. The version 1 fixture still installs sandboxed. Revert the local
   `verified.json` (`npm run verified:sync -- <apps checkout> --check` passes
   again).
