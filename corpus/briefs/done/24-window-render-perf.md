# Brief 24 — Stop drag/resize from reconciling every window & app

Status: **done** (2026-07-17) · Promoted
[window-drag-reconciles-all-windows](../../todos/window-drag-reconciles-all-windows.md)
(PERF-1, 2026-07-17 review).

## Outcome (2026-07-17)

Done by one senior agent (indivisible core change). `WindowContainer` now
subscribes (via `useShallow`) only to `{id,appId,zIndex,isVisible}` per
window; `Window` is `React.memo` and reads its own instance via
`s.windows.find(w=>w.id===windowId)`; `ResizeHandle` reads `getState()` in
its drag handler instead of subscribing. Because untouched windows keep
their object reference and the container's projected list is unchanged
during a drag, only the moving window's chrome re-renders — the container
doesn't, so every app's `<AppComponent>` child element stays referentially
stable and no app subtree reconciles mid-drag. No transform-based drag
(kept per-frame store updates so snapping is byte-identical). Guard for the
close frame sits after all hooks (rules-of-hooks). Gates: typecheck 13/13,
lint 13/13, build ✓. **Human-gated:** in-browser drag/resize smoothness +
no-flicker across multiple open apps.

## Problem

During a drag/resize the whole desktop reconciles ~60×/s: `Window` isn't
memoized, `WindowContainer` subscribes the entire `s.windows` array, and
every `ResizeHandle` subscribes it too — so one `updatePosition`/
`updateSize` per pointer frame invalidates every open app's subtree
(docs/sheets/pdf/terminal). Dominant drag-jank source on the 2 GB kiosk.

## Key invariant (verified)

`updatePosition`/`updateSize`/`focusWindow` map `w.id===id ? {...w} : w`, so
**untouched windows keep their exact object reference**. A per-window store
selector therefore re-renders only the window that actually changed.

## Fix (single cohesive change — 3 files)

1. **WindowContainer** (`apps/core/src/shared/components/window/WindowContainer.tsx`):
   stop subscribing the full array. Subscribe (via `useShallow`) to a derived
   list of only the fields that drive structure/order/focus —
   `{ id, appId, zIndex, isVisible }` per window. Compute order + `maxZIndex`
   + `isFocused` from that. Render `<Window key={id} windowId={id}
   isFocused={…} minSize={…}>{<AppComponent windowId={id}/>}</Window>` —
   do NOT pass `instance`. Because position/size are no longer in this
   subscription, WindowContainer does not re-render during a drag, so the
   `<AppComponent>` child elements stay referentially stable and never
   reconcile mid-drag.
2. **Window** (`Window.tsx`): wrap the export in `React.memo`. Drop the
   `instance` prop; read own state internally:
   `const instance = useWindowStore((s) => s.windows.find((w) => w.id === windowId))`
   (guard `undefined` for the closing frame). Now a drag only re-renders the
   one moving window's chrome; its `children` element is unchanged so the app
   body is not reconciled.
3. **ResizeHandle** (`Window.tsx`): remove `const windows = useWindowStore(
   (s) => s.windows)`; inside the drag handler read
   `useWindowStore.getState().windows.find((w) => w.id === instanceId)`. Keep
   the `updatePosition`/`updateSize` selectors (stable fn refs). Stops all 8
   handles re-rendering every frame.

Out of scope (optional future micro-opt): transform/ref-based live drag that
commits to the store only on drag-end. Keeping the per-frame store update
means snap detection and behavior stay byte-identical — lower risk.

## Must preserve (regression surface)

Snapping (`detectSnapRegion` + `snapWindow`/`unsnap`), focus-on-drag-start,
maximize/restore, minimize (`isVisible`), z-order, and the App.tsx layout
persistence effect. Behavior identical — only render frequency changes.

## Verify bar

`turbo typecheck` 13/13, `format:check` 14/14, add-on+core lint green,
`turbo build` ok. **Human-gated:** in-browser drag/resize of two+ open
windows still snaps, focuses, and feels smooth; other apps don't flicker.

## Invariants

Identity/layout locked (Win7-classic) — no visual change. No new deps.
