# Brief 33 — Lazy-load built-in app shells

Status: **todo** · Promotes the held
[eager-bundle-lazy-load](../../todos/eager-bundle-lazy-load.md) todo. The 2026-07-17
HOLD decision set an explicit trigger: *"promote when a heavy app actually lands
in the eager bundle (the Monaco code editor is the likely one)."* The Monaco
code editor is landing this backlog run (brief for code-editor), so the trigger
is met — doing this **first** means Monaco (and every other new app) never
enters the eager login bundle. This is the documented trigger firing, not a
relitigation of the decision.

## Problem (measured 2026-07-17 @ brief 30)

The eager login bundle is one monolithic chunk — `index-*.js` ≈ **1.30 MB raw /
397 KB gzip** — because **there are zero `React.lazy` boundaries**. Every
add-on's `manifest.component` is a *static* import in each add-on's `index.ts`,
so all app component trees are pulled into the eager chunk. Only the heavy office
*engines* are lazy today (they're dynamically imported inside code paths). As
more apps land, every one grows the eager bundle — directly against the
"lightweight is identity" invariant (41 MiB idle, 1.42 s cold start).

## Decisions (grilled — carried from the todo)

- **Make `manifest.component` a `React.lazy` boundary per app.** Each add-on's
  `index.ts` stops statically importing its component and instead sets
  `component: lazy(() => import('./X').then((m) => ({ default: m.X })))` (the
  components are **named** exports, hence the `.then` shim). The **icon and all
  metadata stay eager** — the Start menu, taskbar, desktop icons, and command
  palette need them before the app is ever opened.
- **`<Suspense>` in the window frame.** `WindowContainer` wraps the rendered
  `<AppComponent>` in a `<Suspense>` with a fast, minimal fallback (a small
  centered spinner/placeholder using existing tokens — no redesign). Only shells
  split, so the fallback is near-instant in practice.
- **Settings too.** Settings is core (declared in `manifest.ts`), but it is not
  on screen at login — lazy-load it the same way for consistency.
- **No hard size target** (per the decision). The acceptance signal is a
  material drop in the eager gzip size; **measure and record before/after** in
  the outcome note. Any real reduction passes.

## Fix

1. **Contract**: widen `AppConfig.component` in `apps/core/src/contract.ts` to
   accept a lazy component (e.g. `ComponentType<{ windowId: string }> |
   LazyExoticComponent<ComponentType<{ windowId: string }>>`), so add-ons can
   assign `lazy(...)` without casts. Keep everything else in the contract the
   same.
2. **Every add-on `index.ts`** (all of `apps/add-ons/*`): replace the static
   component import + `component: X` with the `lazy(() => import(...))` form.
   Leave the icon import and all metadata untouched.
3. **`apps/core/src/manifest.ts`**: make the Settings `component` lazy the same
   way (`lazy(() => import('./modules/settings/Settings').then((m) => ({ default:
   m.Settings })))`).
4. **`apps/core/src/shared/components/window/WindowContainer.tsx`**: wrap the
   `<AppComponent windowId=… />` render in `<Suspense fallback={…}>`.
5. Re-measure the eager `index-*.js` gzip before/after and report both numbers.

## Must preserve (regression surface)

- App open still works for every app; the icon/metadata still render in Start
  menu, taskbar, desktop, and palette **without** opening the app (they must not
  become lazy).
- `multiInstance`, `defaultSize`, `minSize`, command sources, and the ext→app
  open routing all unchanged.
- The office engines stay lazy as before (this brief splits *shells*, a separate
  axis — don't touch the engine dynamic imports).
- No visual redesign; the Suspense fallback is a plain, brief placeholder.

## Verify bar

`turbo typecheck` 13/13, all lint green, `format:check`, `turbo build` ok.
**Acceptance:** eager `index-*.js` gzip is materially smaller than 397 KB and
the office/app component code now appears in per-app chunks (confirm from the
build output). **Human-gated:** every app opens with at most a brief flash of
the fallback, Start menu/taskbar/desktop icons render pre-open, login/first
paint feels the same or faster.

## Invariants

Lightweight is identity — this brief *reduces* the eager bundle, the whole
point. No dependency additions (React's `lazy`/`Suspense` are built in). No
layout/identity change.

## Out of scope

Vendor-chunk tuning / `manualChunks` beyond what falls out naturally, i18n
locale chunk strategy (note if it looks wrong, don't fix here), and the runtime
[addon-manager](../../todos/addon-manager.md) (separate brief; this brief just
makes disabled apps free later).
