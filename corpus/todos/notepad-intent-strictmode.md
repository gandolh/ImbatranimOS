---
title: Notepad consumes open-intents in a render selector (StrictMode-unsafe)
created: 2026-07-17
status: captured
tags: [add-on, bug, dev-only]
---

# Notepad open-intent consumption is StrictMode-unsafe

Found while building brief 19 (2026-07-17): notepad calls
`useIntentStore((s) => s.consumeIntent(...))` inside a render selector.
Under React StrictMode's double render (dev), the first render drains
the one-shot intent before paint, so open-from-Files can arrive empty;
Vite also logs the "getSnapshot should be cached" warning. The four
office add-ons ship the safe pattern instead: consume once in a
ref-guarded effect via `useIntentStore.getState().consumeIntent(windowId)`,
latched into a per-window store (see
`apps/add-ons/pdf-viewer/src/store/openedFileStore.ts`). Port that
pattern to notepad. Prod behavior is unaffected (no StrictMode double
render), which is why this is debt, not a shipped bug.
