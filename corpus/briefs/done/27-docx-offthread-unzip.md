# Brief 27 — Move docx unzip/zip off the main thread (PERF-6, docx slice)

Status: **done** (2026-07-17) · Partially resolves
[office-parsing-blocks-ui-thread](../../todos/office-parsing-blocks-ui-thread.md)
(PERF-6). The xlsx/ExcelJS slice stays open in that todo.

## What & why

`docxNormalize.ts` unpacked/repacked the docx with fflate's **synchronous**
`unzipSync`/`zipSync`, blocking the main thread (freezing the whole desktop)
while a large document was normalized on open. Swapped to fflate's async
`unzip`/`zip` (callback API, promisified), which run off the main thread in
fflate's worker pool. Output is identical to the sync variants, so behavior
is unchanged — only the UI no longer stalls during the unpack/repack.

File: `apps/add-ons/docs/src/engine/docxNormalize.ts` — `unzipSync`→`unzip`,
`zipSync`→`zip` via small `unzipAsync`/`zipAsync` promise wrappers. `strToU8`/
`strFromU8` stay sync (trivial). One file, no new deps, no API change.

## Deliberately deferred (stays in the todo)

The xlsx path (`sheets/src/engine/xlsxBridge.ts`, ExcelJS `load`/`writeBuffer`
+ per-cell iteration) is CPU-bound on the main thread and has no off-thread
API — it needs a real Web Worker with a message protocol. That is a larger,
higher-risk change whose correctness can only be confirmed by opening a real
spreadsheet in a browser (not verifiable headless), so it was not bundled
into this full-auto pass. Left open in `office-parsing-blocks-ui-thread.md`.

## Verify

`turbo typecheck` 13/13, `format` clean, docs lint clean, `build` ✓.
**Human-gated:** open a large docx in Docs — it still opens/edits/saves and
the desktop stays responsive during load.
