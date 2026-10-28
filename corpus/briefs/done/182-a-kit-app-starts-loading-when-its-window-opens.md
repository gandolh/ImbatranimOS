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

## Outcome (2026-10-28)

**Built in `99d6115` (1.44.0), `608ad1e` (1.46.0) and `afa3d56` (1.47.0);
measured in the production image.**

**The first cut did not help.** `99d6115` put a `<link rel="modulepreload">`
for the entry, and the build's stylesheets, into the page from the registry's
`lazy` factory (`kitPreload.ts`). `app.mjs` then went out with the
`KitAppHost` chunk, but an A/B in the production image showed no gain: median
640 ms against 632 from the Open With click to ink. A resource trace said why.
The entry's own imports, the ten shared chunks, still started only about
316 ms after the click. React holds back a lazy component that resolves just
after its fallback showed, for up to 300 ms, and the host's effect, which ran
the import, came after that. A modulepreload fetches the entry, not its
graph.

**What works:** `608ad1e`. The factory loads `kitModule.ts` beside the host
and calls `startKitApp`, which puts the shared kit on the global and imports
the entry at once; the host's effect takes the same import. That is the
brief's second way, starting the import in the factory after
`installSharedKit()`: it needs the host's chunk first, since the shared kit
lives there, but that chunk arrives in about 40 ms, well inside the 300 ms
wait. The modulepreload stays, so the entry is on the wire from the click. One
import per URL; a failed one is forgotten, so the next window asks again
rather than inheriting it. A refused app (brief 175) and an app with no entry
start nothing, and the factory runs as the window renders, so nothing is
fetched before a window opens.

**Step 2:** the installed build lists only its entry and stylesheets
(`installed.entryPath`, `installed.stylePaths`), not the entry's imports, so
nothing more is preloaded. Starting the import early makes the browser fetch
them anyway, at about 78 ms instead of 316.

**The measurement**, as imbatranim-office brief 09 did it: the production
image, the Office suite at `21c5c1d` installed from a local `file://`
repository, NIST SP 800-218 (36 pages) in the home folder, a fresh headless
Chrome per run, Files → right-click → Open with… → PDF, the clock started on
the dialog's Open click and stopped at the first inked pixel in the new
window's canvas, sampled every frame. Two containers on copies of one home
volume, the before image (`0937bba`) and the after image (`608ad1e`),
alternated with PDF Viewer each round:

| Series | after (`608ad1e`) | before (`0937bba`) | PDF Viewer |
|---|---|---|---|
| A, 7 runs each | 550, 540, 524, 680, 521, 533, 574: **median 540** | 711, 699, 630, 772, 671, 644, 641: median 671 | 555, 517, 642, 562, 552, 549, 551: median 552 |
| B, 7 runs each | 529, 628, 546, 548, 567, 668, 527: **median 548** | 661, 766, 588, 572, 794, 668, 605: median 661 | 587, 558, 547, 526, 622, 571, 555: median 558 |

On the same machine the suite's median dropped by 131 and 113 ms, and it now
sits 10 to 12 ms under PDF Viewer, where brief 09 had it 40 ms over. Against
the brief's literal bar, "at least 30 ms from 574", series A's 540 meets it
and series B's 548 misses it by 4 ms; but 574 was brief 09's number on its
own day, and PDF Viewer itself measured 552 and 558 here against 534 there.
The machine was shared with other agents' builds throughout.

The resource trace of one after run: `app.mjs` requested at 11 ms and the
`KitAppHost` chunk finished at 57 ms, so the entry goes out before the host's
chunk is in; the shared chunks at 78 ms; the PDF's download at 333 ms (398
with the first cut).

**Tests:** `kitPreload.test.ts` (new, 6), `KitAppHost.test.tsx` (+3: the
early import is the one the host uses, nothing for a refused app, a failed
import is forgotten; `afa3d56` made two of them wait on the import rather
than a timer, after one failed under the full run's load),
`marketplace.test.tsx` (+1: no fetch before a window, the preload and the
early start when one opens, nothing for a native app). Gates: typecheck,
lint, core tests and the kit e2e suite (`marketplace-kit.e2e-spec.ts`, 7)
pass. The eager set grew by 998 bytes (353 gzipped) for the preload helper
and the refusal checks it calls.
