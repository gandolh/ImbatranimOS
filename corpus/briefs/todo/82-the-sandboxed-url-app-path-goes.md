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
