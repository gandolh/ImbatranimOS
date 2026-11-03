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
