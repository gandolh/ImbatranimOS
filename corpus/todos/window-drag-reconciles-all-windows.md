---
title: Window drag/resize reconciles every open window each pointer frame
created: 2026-07-17
status: captured
tags: [core-contract, perf, debt]
---

# Window drag/resize re-renders every open window per pointer frame

Found in the 2026-07-17 review pass (PERF-1). The core window system
recomputes every open window's subtree on every pointer frame during a
drag or resize. `Window.tsx` has no `React.memo`, and both the window
body and its `ResizeHandle`
(`apps/core/src/shared/components/window/Window.tsx:31-34`) subscribe to
the whole `windows` array. `WindowContainer.tsx:7` also subscribes the
entire `s.windows`. Each `updatePosition`/`updateSize` call replaces the
array (`apps/core/src/shared/store/windowStore.ts:338-348` map a fresh
array every call), so a single drag frame invalidates every subscriber —
docs, sheets, pdf, and terminal subtrees all re-render dozens of times a
second while one window moves.

Suggested approach: wrap `Window` in `React.memo`; subscribe to a stable
id list (`useShallow` over `windows.map((w) => w.id)`) rather than the
full array; read live geometry from `useWindowStore.getState()` inside
the drag handler instead of subscribing to it; drive the live drag with a
CSS transform / ref and commit the final position to the store only on
drag-end.

Deferred because this touches the core window system directly — high
regression risk (snapping, z-order, focus, multi-window layout), and it
needs the app running to validate that live drag still feels right. Not a
tail-end refactor. Note PERF-2 (debounced layout persistence) from the
same review was already fixed in this pass.
