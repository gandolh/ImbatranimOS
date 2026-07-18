# Brief 31 — Virtualize the long lists (TanStack Virtual)

Status: **todo** · Promoted
[virtualize-long-lists](../../todos/virtualize-long-lists.md) (from the
2026-07-17 "should we use TanStack to optimize the UI" discussion).

## Problem

There is **zero list virtualization** in the repo, and two hot surfaces render
every row (verified 2026-07-17 on `main` @ brief 30):

1. **`apps/add-ons/system-monitor/src/components/ProcessTable.tsx`** —
   `sorted.map((p) => …)` renders **all** processes (100–300+ on a busy box)
   and it re-renders on **every poll**: `POLL_MS = 1500` in
   `systemQueries.ts`. Worst offender.
2. **`apps/add-ons/file-manager/src/components/FileList.tsx`** — renders **all**
   directory entries; a folder with thousands of files mounts thousands of
   nodes.

Dominant list-render cost, felt most on the 2 GB kiosk.

**Axis note:** this is a *runtime rendering* fix — it does **not** shrink the
eager bundle. The bundle axis (React.lazy shell splitting) is deliberately held
as a todo ([eager-bundle-lazy-load](../../todos/eager-bundle-lazy-load.md)),
per the 2026-07-17 decision, until a heavy app makes it pay.

## Decisions (grilled 2026-07-17)

- **Scope: both ProcessTable + FileList.** `FolderTree` is out of scope
  (usually small; would add tree-flattening complexity for marginal payoff).
- **Dependency: centralize in `@imbatranim/core`.** Add
  `@tanstack/react-virtual` to core and expose a thin `useVirtualList` helper
  through core's public surface (`apps/core/src/index.ts`); the two add-ons
  consume it via `@imbatranim/core`. This keeps the eslint import-boundary rule
  intact (add-ons import `@imbatranim/*` only from core) and guarantees a single
  version + shared overscan/estimate defaults.
- **Always-virtualize** (no "only above N rows" threshold) for one consistent
  code path. *(Fixed by author — user delegated the non-load-bearing calls.)*
- Query stays exactly as-is — it's already well configured
  (`queryClient` staleTime 30s, processes poll only while the tab is visible).
  This brief adds nothing to the data layer.

## Fix

1. **core**: add `@tanstack/react-virtual` (^3) dependency. Add a minimal
   `useVirtualList` wrapper around `useVirtualizer` (standardizes
   `estimateSize`/`overscan≈8`, takes `{ count, getScrollElement }`) and export
   it from `apps/core/src/index.ts`. Keep it a thin passthrough — no bespoke
   abstraction beyond sane defaults.
2. **ProcessTable.tsx**: put a ref on the scroll container; virtualize over the
   already-sorted array; render only the virtual rows (absolute
   `transform: translateY` or top/bottom padding-spacer technique). Keep the
   sortable header **outside** the virtualized body and use CSS-grid rows (not
   `<table>`) so columns stay aligned. Preserve sort (`sortKey`/`sortDir`), the
   kill mutation + `invalidateQueries`, and the row layout.
3. **FileList.tsx**: virtualize the entry list with the same helper.

## Must preserve (regression surface)

- **File-manager keyboard nav is the key integration risk:**
  `useListKeyboardNav` arrow-key movement must call
  `virtualizer.scrollToIndex(activeIndex)` so the focused row stays mounted and
  visible (a virtualized row that's scrolled out is unmounted).
- File-manager: selection (`useFileSelection`), context menu, double-click /
  Enter open, clipboard (`useFileClipboard`), drag/upload, and preview-pane
  sync all unchanged.
- **Scroll position stays stable across the 1.5 s process refetch** — react-query
  keeps previous data; don't remount the scroller on refetch. Reordering when
  metrics change is inherent (not a regression).
- Process kill, sort direction toggle, and the `{n} procs` count still correct.

## Verify bar

`turbo typecheck` 13/13, `format:check`, add-on + core lint green,
`turbo build` ok. **Human-gated:** System Monitor → Processes with many procs
scrolls smoothly, sort + kill still work, no jump/flicker on the 1.5 s refetch;
a directory with 1000+ entries scrolls smoothly, arrow-key nav moves selection
**and scrolls it into view**, context menu / open / preview all work. Feel-check
on the 2 GB kiosk.

## Invariants

No visual redesign — same rows, same columns, same behavior; only the number of
mounted DOM nodes changes. Identity/layout locked (Win7-classic). **One new
dep** (`@tanstack/react-virtual`) — justified per "dependency additions need a
reason": headless, tiny, solves measured jank; centralized in core so there's a
single version.

## Out of scope

TanStack **Table** (defer to a future DB-client brief — pairs with Virtual then),
TanStack **Router** (N/A — window-manager desktop, not URL-routed), Sheets
(Univer virtualizes itself), and `FolderTree`.

## Outcome (2026-07-17) — commit `e8652b5`

Shipped as specified. `@tanstack/react-virtual` added to `@imbatranim/core`
only; a thin `useVirtualList` helper (overscan 8, `estimateSize`/
`getScrollElement` params) is exported from `apps/core/src/index.ts` and consumed
by both add-ons via `@imbatranim/core` — the eslint import-boundary rule stays
intact, single version. `ScrollArea` gained a `viewportRef` so add-ons can hand
the virtualizer the real scroll element. ProcessTable and FileList now render
only the visible window (CSS-grid rows, header outside the virtualized body,
translateY spacers); file-manager `useListKeyboardNav` calls
`scrollToIndex(activeIndex)` so arrow-key selection stays mounted. Scroll
position is stable across the 1.5 s process refetch (react-query keeps prior
data; no scroller remount). All gates green (typecheck 13/13, lint, format,
build). Human-gated feel-check on the 2 GB kiosk still open.
