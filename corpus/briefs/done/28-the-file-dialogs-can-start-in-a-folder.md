# Brief 28 — The file dialogs can start in a folder

## Context

Found by imbatranim-office while building DWG opening (2026-10-28).
`system.fs.pickSave` takes `title`, `extensions` and `suggestedName`
(`packages/ui/src/system.ts`, `PickSaveOptions`), and the OS's
`FilePicker` (`apps/core/src/shared/components/files/FilePicker.tsx`)
always opens at the home root. So "save a DWG drawing as a `.dxf` next to
it" cannot go through the dialog: CAD confirms a fixed name beside the DWG
instead, and every editor's Save as starts at home.

The owner settled it on 2026-11-03 as two briefs: this one adds the option
here; imbatranim-office's brief "Save as opens where the file is" then
syncs the kit and uses it. Promoted from imbatranim-office's todo
`2026-10-28-os-save-dialog-start-folder`.

## Spec

1. Add `startIn?: { root: string; path: string }` to `PickOpenOptions`, so
   `pickOpen` and `pickSave` both take it: the folder the dialog opens in.
   A `path` naming a file means the folder it is in.
2. Carry it through the file portal (`apps/core/src/system/filePortal.tsx`)
   to `FilePicker`, which opens there instead of the home root.
3. A `startIn` the app may not read (an unknown root, a path outside its
   jail, a folder that no longer exists) falls back to today's start, the
   home root, without an error. The dialog still lets the user walk
   anywhere they could before.
4. Document the option in `PickOpenOptions`' doc comment (the kit has no
   separate guide), and bump `packages/ui`'s version as a backward-compatible
   kit change.

## Must preserve

- Calls without `startIn` behave exactly as today.
- The jail: `startIn` never shows a folder the app couldn't reach by
  walking.

## Acceptance

- Tests: `pickSave({ startIn })` opens `FilePicker` in that folder; a
  file path opens its folder; a bad root or a missing folder opens the home
  root.
- A short walk: a kit app's Save as with `startIn` opens in the folder.
- Typecheck, lint and the tests of `packages/ui` and the portal pass.

## Files you OWN

- `packages/ui/src/system.ts` (the option and its doc comment)
- `apps/core/src/system/filePortal.tsx`
- `apps/core/src/shared/components/files/FilePicker.tsx`
- their tests

## Outcome (2026-11-03)

**Built in `6fa7771` (version 1.121.0; kit `@imbatranim/ui` 1.0.0 → 1.1.0).**
- `startIn?: FileChoice` on `PickOpenOptions`, so `pickOpen` and
  `pickSave` take it; its doc comment says what a file path means, what
  falls back, and that an older desktop ignores it. `pickDirectory` takes
  its own options and was left as it is.
- `createSystemHandle` passes it to `requestPick`, the portal's request
  carries it, and `FilePicker` resolves it once before its first listing
  (`resolveStart`): list `path` as a folder; failing that, list its parent
  and accept it if `path` is a file there; else the home root. The check is
  the same authed `/files` listing the dialog browses with, so the jail is
  the backend's. A root the dialog doesn't offer and a `..` segment fall
  back before any request. While it resolves the dialog shows "Loading…", not
  the home root, and the start's listing is reused rather than fetched twice.
- The kit's package version went to 1.1.0 (package.json and the lockfile's
  entry). `SHARED_KIT_VERSION`, which a kit app must match exactly, is a
  different number and was not touched: changing it would refuse every kit
  app built for the current one.

**Checked:**
- `filePortal.test.tsx` (11), the real handle, portal and picker over a fake
  `/files` that refuses unknown paths: `pickSave` opens in a named folder
  (one request, no home detour), in a named file's folder, and in the Notes
  root; a root it doesn't offer, a missing folder, a missing file, a path the
  jail refuses and a `..` path each open at the home root with no error and
  no request carrying `..`; no `startIn` opens at home as before; Save
  lands in the start folder and Up is enabled; `pickOpen` takes it too.
- In the dev container, Code Editor's Save as patched (in the container
  only) to start beside `Two/a.txt`: the dialog opened at `/Two` and saved
  there.
- Typecheck, lint; core's full suite (658) and the kit's (39) pass.
