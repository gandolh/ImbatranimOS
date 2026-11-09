# Brief 82 — The sandboxed URL app path goes

## Context

Since brief 74 an app from a URL builds from source and runs natively once
it is verified or trusted (`imbatranim.json` version 2). The prebuilt,
sandboxed kind (version 1) still installs into an opaque-origin frame.
Owner decision 6 of brief 74
([decisions-app-identity-and-trust.md](../../wiki/decisions-app-identity-and-trust.md#url-apps-run-natively-once-trusted-revisits-2026-10-07))
said the frame goes in its own step once nothing uses it. Promoted from the
todo `retire-the-sandboxed-url-app-path` in the 2026-11-09 backlog grill.

The only version 1 manifest in the owner's repos is
`games/hollow/os-app/imbatranim.json` in game-engine. Hollow already
installs natively from the Marketplace catalog (`marketplace/hollow.json`),
so that file is a leftover second way in.

## Depends on

- brief 74 (native URL installs).

## Owner decisions (settled 2026-11-09)

1. Retire it now. Nothing the owner uses installs that way.
2. A sandboxed install still on a machine shows in Settings as "no longer
   supported" with Uninstall. It no longer opens.

## What to do

1. Remove the version 1 path: its manifest schema and check, the install
   route's prebuilt branch, the opaque-origin frame and its runtime, the
   per-window sandbox tokens and their routes, the sandbox's headers, its
   share of the keyboard guard, and the sandbox bridge. A version 1 URL is
   refused at the check with a plain message ("This app uses the old
   format, which this OS no longer installs").
2. A row of a sandboxed install that's still in the database lists in
   Settings → Apps as "no longer supported", with Uninstall working as
   before and no Open.
3. In game-engine: delete `games/hollow/os-app/imbatranim.json` and whatever
   only it used (check the build scripts), in its own commit there.
4. The corpus: the decision page and the URL-app wiki say the path is gone;
   the todo is promoted.

## Files you OWN

- `apps/backend/src/modules/marketplace/` (the URL install), the sandbox
  modules and routes, `apps/core/src/` (the frame, its runtime, the keyboard
  guard's sandbox part, Settings' URL-app rows), `packages/ui` if the bridge
  types live there
- in game-engine: Hollow's `os-app/` leftovers
- their tests, `corpus/`

## Files you must NOT touch

- The native URL path from brief 74; catalog descriptors.

## Acceptance

- Tests: a version 1 URL is refused at the check with the message; a
  version 2 URL still checks, trusts and installs; a leftover sandboxed row
  lists as no longer supported, can't open and uninstalls; the sandbox
  routes are gone (404); the keyboard guard's tests pass without the frame.
- Backend and core typecheck, the marketplace* and app-identity e2e specs,
  core's marketplace and settings tests pass; game-engine's build still
  builds Hollow for the catalog.
- Walk steps in the outcome for the owner (Settings with a leftover row,
  if one is on the box).

## Outcome (2026-11-09)

Built by a subagent on `main`, ready for deploy. Commits: imbatranimOS
`a857f57` (1.281.0, the code) and the corpus commit with this note;
game-engine `2de99ac6` (Hollow's prebuilt copy).

Removed:
- backend: `app-manifest.ts` (the version 1 schema; `MANIFEST_FILE` and
  `MAX_MANIFEST_BYTES` moved to `manifest-file.ts`), the check's prebuilt
  validation and the install route's prebuilt branch, `sandbox-tokens.ts`,
  `sandbox-headers.ts`, `sandbox/runtime.js` and its asset entry in
  `nest-cli.json`, the five sandbox routes (`POST apps/:id/sandbox`,
  `DELETE sandbox/:token`, the shell, `runtime.js` and `app/*`), the
  version 1 row reader `readUrlAppRow`, and the audit log's sandbox-token
  redaction (the query-string strip stays).
- core: `SandboxedAppHost`, `sandboxBridge`, `keyboardGuard` and their
  tests, the registry's sandboxed branch, the consent card's sandboxed kind
  and Settings' sandboxed row.
- the Browser's host page no longer posts `frame-blur`, which only the
  keyboard guard listened for.
- game-engine: `games/hollow/os-app/` (manifest, README, committed `dist/`),
  `scripts/sync-os-app.mjs`, the `build:os-app` script and its `.gitignore`
  exception; `docs/games.md`, `docs/getting-started.md`, `hollow-overview.md`,
  `status.md` and a log entry there. `build:os`, which the catalog builds, is
  unchanged (typechecked; the catalog never pointed at `os-app/`).

Kept: `FRAME_EMBEDDER_POLICY` and the `frame-src` fence (wording only), the
CSP `sandbox` token on Linux app pages, the native `x-` routes from brief 74,
and the `runtime` column (a leftover row can still hold `sandboxed`).

What it does now:
- A version 1 `imbatranim.json` is refused at the check with 400 "This app
  uses the old format, which this OS no longer installs." (the brief's
  sentence plus a full stop), and its clone is deleted.
- A `sandboxed` row lists under `problems`, not `apps`, with `appId` and
  `retired: { name, source }` read leniently from the row (the id and no
  source when they no longer read). So it never reaches the registry: no
  Open from Settings, Start or search. Install, built files, lease, server
  and its WebSocket answer 404 for it. Uninstall removes the row, its
  `apps/<id>@*` folder, its log and caches, and with the box its data.
- Settings → Marketplace shows it as a URL-app row: name, From a URL, a
  "No longer supported" badge, its source line, and Uninstall only (with
  "Also remove its data").
- A native install from a URL over a leftover row replaces it, as before.

Choices made here, not owner calls:
- The brief's "Settings → Apps" is read as Settings → Marketplace. The Apps
  section is the enable/disable list over the registry, which a leftover row
  never joins; Uninstall lives in the Marketplace section.
- The keyboard guard went whole. It installed its listeners only when a
  sandbox frame registered, and the sandboxed host was its only caller, so
  its "share" was all of it; the acceptance line about its tests holds
  vacuously.
- Identity is untouched: `installGroupOf` still counts a leftover row as an
  install, so an app token could be minted for its id if anything asked.
  Nothing can, since it never opens. The tightening, if wanted, is one line
  in `installed-apps.ts`: `isUninstalledUrlApp` also true for a `sandboxed`
  row. The app-identity e2e fixture now inserts a native row.

Self-review:
- Nothing references removed code: grep over `apps/`, `infrastructure/`,
  `docs/`, `marketplace/` and the README for the sandbox's names, routes,
  headers, tokens and messages finds only the 404 tests and history wording.
  `packages/ui`'s comments about a future sandboxed transport are untouched.
- A leftover row is tested over HTTP: listing (also with a damaged row),
  every native route and the WebSocket 404 with a session (401 without),
  pasting its URL again is refused and leaves its files, uninstall removes
  the row and its folder, a second uninstall is 404.
- The sandbox routes answer 404 with and without a session, under the
  desktop's headers. `security-headers.ts` changed in comments only; the
  remaining routes are asserted to carry the desktop's policy.
- No new async paths: the retired row reader is synchronous.

Checks run: backend `tsc --noEmit`, eslint and prettier on changed files;
jest marketplace, logs, security-headers, app-identity, db and browser units;
e2e marketplace-url (22, rewritten: the check, clone limits, pending, full
commit ids, the version 1 refusal, the gone routes, the leftover row),
marketplace-url-native (14), marketplace, suite, kit, wasm, app-identity,
security and browser; core `tsc -b`, eslint and prettier on changed files,
vitest settings, marketplace, registry and window (264); game-engine
`npm run typecheck -w @hollow/client` and its corpus lint. Skipped: full
suites, the PTY e2e, a full `build:os` and the browser walk.

Owner steps: push imbatranim-apps first (it has an unpushed commit), push
game-engine any time, push this repo, then `node cli.ts imbatranim-os deploy`
from vps-deploy.

Walk: Settings → Marketplace on the VPS. A row reading "No longer supported"
is a leftover sandboxed install: Uninstall it, and the row and its folder
under `~/.imbatranim/apps/` (`x-<12 hex>@…`) go. With no such row there is
nothing to walk; pasting a version 1 app's URL shows the refusal.
