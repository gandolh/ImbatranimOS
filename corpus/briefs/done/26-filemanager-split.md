# Brief 26 — Split the FileManager god component

Status: **done** (2026-07-17) · Promoted
[file-manager-god-component](../../todos/file-manager-god-component.md)
(CS-3, 2026-07-17 review).

## Outcome (2026-07-17)

FileManager.tsx **752 → 531 lines**; `FileManager` is now a thin
orchestrator. Six focused units extracted: `hooks/useFileSelection`,
`useFileClipboard`, `useDeleteFlow` (the two delete states collapsed into one
`{kind:'single',target}|{kind:'batch'}|null` union, CS-4 `Promise.allSettled`
partial-failure banner preserved), `usePaneResize`, `useListKeyboardNav`, and
`lib/buildMenuItems.tsx` (pure menu-descriptor builder — `.tsx` because it
emits JSX icons). Rename, new-folder/new-office-file, upload handlers, and
menu-open state kept inline (cohesive with the orchestrator). "Move, don't
rewrite" — shift-range selection was NOT invented (the app never had it). A
sonnet behavior-preservation review traced every unit line-by-line against
the pre-diff code: **no drift**; the one scoped `eslint-disable
react-hooks/refs` (around the `buildMenuItems` call) confirmed a genuine
false positive. Gates: typecheck 13/13, lint 13/13, build ✓.
**Human-gated:** in-browser walkthrough of every concern.

## Problem

`apps/add-ons/file-manager/src/FileManager.tsx` (~750 lines, ~16 state
hooks) mixes many independent concerns: selection, clipboard, single+batch
delete (two intertwined states `deleteTarget`/`batchDeletePending`), inline
rename, upload (input + dropzone), new-office-file templating, an inline
context-menu descriptor tree, the preview-pane splitter (ResizeObserver +
hand-attached mouse listeners), and keyboard navigation.

## Fix (behavior-preserving extraction — one cohesive refactor)

Carve the concerns out of `FileManager.tsx` into focused units under
`apps/add-ons/file-manager/src/`; `FileManager` becomes a thin orchestrator.
Extract at least:

- `hooks/useFileSelection.ts` — the multi-select Set logic + anchor/range.
- `hooks/useFileClipboard.ts` — copy/cut/paste state + the paste mutation
  orchestration.
- `hooks/useDeleteFlow.ts` — collapse `deleteTarget` + `batchDeletePending`
  into ONE discriminated union (`{kind:'single', target} | {kind:'batch'}
  | null`) and own the confirm→mutate→error flow (keep the CS-4
  `Promise.allSettled` partial-failure reporting exactly).
- `lib/buildMenuItems.ts` — the context-menu descriptor tree as a pure
  builder `buildMenuItems(ctx) => MenuItem[]`.
- `components/PaneSplitter.tsx` (or `hooks/usePaneResize.ts`) — the
  preview-pane resize wiring (ResizeObserver + mouse listeners + the
  persisted width/collapse behavior) as a reusable piece.
- Keyboard nav (`handleListKeyDown`) can move to `hooks/useListKeyboardNav.ts`
  or a small helper — keep the exact key handling.

## Non-negotiable: behavior identical

Everything the app does today must work unchanged: root switching, path
breadcrumb nav, multi-select (click/ctrl/shift), inline rename, clipboard
copy/cut/paste, single delete, batch delete WITH the error banner
(CS-4), upload via file input AND dropzone, "New" office-file templating,
the full context menu, splitter drag + persisted width/auto-collapse, and
keyboard navigation. No visual change, no new deps. This is a refactor, not
a redesign — if a clean extraction would change behavior, keep it inline and
note why.

## Verify bar

`turbo typecheck` 13/13, `format:check` 14/14, file-manager lint green,
`turbo build` ok. A focused review pass for behavior preservation.
**Human-gated:** in-browser walkthrough of every concern above.

## Invariants

Identity/layout locked; authed api client for all FS ops (unchanged); no
new deps.
