# Brief 32 — Xlsx parse/serialize off the main thread (PERF-6 xlsx slice)

Status: **todo** · Promoted the xlsx slice of
[office-parsing-blocks-ui-thread](../../todos/office-parsing-blocks-ui-thread.md)
(PERF-6). The docx slice already shipped in
[brief 27](../done/27-docx-offthread-unzip.md); this is the remaining tail.

## Problem

The Sheets engine parses and serializes xlsx **synchronously on the main
thread**. ExcelJS's `load`/`writeBuffer` are async, but the per-cell iteration
between them is CPU-bound and runs on the UI thread
(`apps/add-ons/sheets/src/engine/xlsxBridge.ts` — cell read loop and cell write
loop), so a large sheet freezes the whole desktop for hundreds of ms to
seconds. The pattern to mirror already exists: pdf.js runs in a Web Worker
(`apps/add-ons/pdf-viewer/src/engine/pdf.ts` sets `workerSrc`).

## Decisions (grilled 2026-07-17)

- **Move the whole ExcelJS round-trip into one Web Worker** at the engine layer.
  ExcelJS load + cell→Univer mapping (parse), and Univer→cell + writeBuffer
  (serialize), all run in the worker. This also moves the heavy `exceljs` chunk
  entirely off the main thread's module graph.
- **Keep the public engine boundary identical.** `xlsxToUniver(bytes)` and
  `univerToXlsx(snapshot)` keep their exact signatures and return types so
  `Sheets.tsx` is **unchanged**. Only their internals change from
  "call ExcelJS inline" to "round-trip through the worker."
- **Vite-native worker**, module type:
  `new Worker(new URL('./xlsxWorker.ts', import.meta.url), { type: 'module' })`.
  Lazy by construction — the worker (and thus exceljs) only loads on first
  open/save, same as today's dynamic `import('exceljs')`.
- **One worker instance, reused** across opens/saves (created lazily on first
  use, module-cached like `pdfjsPromise`), with a small request-id correlation
  so parse and serialize can't cross wires.
- **Transfer buffers**: post the input `ArrayBuffer` as a transferable on parse;
  transfer the output `ArrayBuffer` back on serialize. The Univer snapshot
  (`IWorkbookData`) is a plain structured-cloneable object — post it as-is.
- **Identical output.** The cell-mapping code (`cellToUniverStyle`,
  `cellValueToUniver`, the color/number-format helpers, the write mapping) moves
  verbatim into the worker — same intersection Univer renders (values, formulas,
  number formats, bold/italic, font color, solid fills). No fidelity change.

## Fix

1. Add `apps/add-ons/sheets/src/engine/xlsxWorker.ts`: a module worker that owns
   the ExcelJS import and the full cell-mapping code (moved out of the bridge),
   handling two message kinds (`parse` → `Partial<IWorkbookData>`, `serialize`
   → `ArrayBuffer`), replying with the same request id, and propagating errors
   as a structured `{ id, error: message }` reply.
2. Rewrite `xlsxBridge.ts` so `xlsxToUniver`/`univerToXlsx` post to the worker
   and await the correlated reply (Promise per request id), rejecting with a
   real `Error` when the worker reports one. Keep the doc comment's rationale.
3. No component changes; no new dependency (exceljs already present).

## Must preserve (regression surface)

- **Open→edit→save round-trip fidelity** stays exactly as the brief-20 spike
  verified: values, formulas, number formats, bold/italic, font color, solid
  fills survive. The mapping code is moved, not rewritten.
- Errors during parse/serialize still reject the bridge promise with a
  meaningful message so `Sheets.tsx`'s existing error handling fires
  (a corrupt/unsupported file must surface, not hang).
- The dirty flag, explicit Save, close guard, and shared-formula handling
  (the brief-20/review-pass fix) are unaffected — they live above the bridge.
- exceljs stays a lazy chunk (now inside the worker chunk), never in the boot
  bundle.

## Verify bar

`turbo typecheck` 13/13, core + add-on lint green, `format:check`,
`turbo build` ok (confirm the worker emits as its own chunk and the main
`sheets` chunk no longer contains exceljs). **Human-gated:** open a large
`.xlsx`, confirm the desktop stays responsive (no freeze) during open and
save, and that a styled sheet round-trips (bold/fills/number formats intact)
via an independent open.

## Invariants

No new dependency. No visual/behavior change — purely moving CPU work off the
UI thread. "Lightweight is identity": the worker is created lazily and reused,
adding no boot cost.

## Out of scope

Univer's own virtualization (it handles that), the docx slice (done, brief 27),
and any change to the Sheets UI or save flow.
