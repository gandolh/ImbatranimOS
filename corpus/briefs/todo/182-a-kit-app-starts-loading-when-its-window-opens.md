# Brief 182 — A kit app starts loading when its window opens

## Context

Found in imbatranim-office brief 09's walk (2026-10-28). From the Open With
click to ink on the 36-page NIST file, the suite's PDF takes a median of
574 ms and the built-in PDF Viewer 534 ms (7 fresh-browser runs each; the
numbers are in that repo's `corpus/wiki/pdf.md`). Most of the gap comes before
the file download: the suite's `app.mjs` and about ten shared chunks load only
after the window has mounted, and take about 70 ms past Chrome's six
connections. PDF Viewer's chunk loads as its window opens.

The owner decided on 2026-10-28 that the gap does not hold back retiring PDF
Viewer and norPDF (brief 167), and that the fix belongs in the OS, since it
helps every kit app.

The load today, in order:

1. The window mounts and `React.lazy` in `toAppConfig`
   ([`marketplace.tsx`](../../../apps/core/src/shared/registry/marketplace.tsx),
   around `:259`) imports the `KitAppHost` chunk.
2. [`KitAppHost.tsx`](../../../apps/core/src/modules/marketplace/KitAppHost.tsx)
   mounts; its effect (around `:76`) calls `installSharedKit()`, then
   `loadModule(entry)` and `addKitStyles(…)` together.
3. `app.mjs` evaluates and its own imports fetch the shared chunks.

`installSharedKit()` must run before the module **evaluates** (the module reads
the global as it does), not before it is fetched.

## Spec

1. Start fetching the kit app's entry module (and its styles) as soon as the
   window opens, in parallel with the `KitAppHost` chunk, not after the host
   mounts. A `<link rel="modulepreload">` for the entry, or starting the
   import in the `lazy` factory after `installSharedKit()`, are two ways; pick
   one and say why in the outcome.
2. If the installed build lists its entry's static imports, preload those too,
   so the shared chunks don't wait for `app.mjs` to parse. If it doesn't, say
   so in the outcome and leave it.
3. A window closed before the load finishes leaves nothing behind that breaks
   the next open.

## Must preserve

- Sandboxed and native marketplace apps load as they do now.
- Nothing of a kit app is fetched before its window opens (brief 33: no app
  code in the eager bundle, nothing fetched up front).
- The CSP (`script-src 'self'`); no `blob:` modules.
- Brief 175's refusals and brief 176's rebuild still work.

## Acceptance

- The suite's PDF, measured as imbatranim-office brief 09 did (Open With →
  ink on the NIST file, 7 fresh-browser runs, production image): the median
  drops by at least 30 ms from 574 ms. Record the runs.
- The network panel shows `app.mjs` requested before the `KitAppHost` chunk
  has finished, not after.
- `npm run typecheck`, `npm run lint`, `npm test -w @imbatranim/core` and the
  kit e2e suite pass.

## Files you OWN

- `apps/core/src/shared/registry/marketplace.tsx` (`toAppConfig`)
- `apps/core/src/modules/marketplace/KitAppHost.tsx` and the kit loading
  helpers it calls, with their tests
- corpus: this brief's outcome, `wiki/status.md`, `log.md`

## Files you must NOT touch

- `apps/core/src/shared/store/*`: briefs 164–167 and 169 own it.
- The kit build in imbatranim-office; if the fix needs it to emit a chunk
  list, stop and write that down for a brief there.
