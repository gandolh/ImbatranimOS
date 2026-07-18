# Brief 35 — Calculator add-on

Status: **todo** · Promotes [calculator-addon](../../todos/calculator-addon.md).
Wave C light app. Easy → junior/sonnet. New package
`apps/add-ons/calculator/`.

## Problem

The desktop has no calculator — a high-recognition staple every DE ships. Pure
client-side, no backend, no new deps.

## Decisions (grilled 2026-07-18)

- **Basic + Programmer mode**, toggled in-app. Basic: `+ − × ÷`, `%`, `±`,
  decimal, clear/back, chained evaluation with correct precedence. Programmer:
  integer HEX/DEC/OCT/BIN display + base switch, bitwise `AND OR XOR NOT`,
  `<< >>`, operating on a 64-bit-safe integer (use `BigInt` for programmer mode
  so shifts/masks don't lose precision).
- **No `eval`.** Implement a small shunting-yard/explicit evaluator — never
  `eval`/`new Function` on input (injection posture, even client-side).
- **Keyboard support**: digits, operators, Enter (=), Backspace, Esc (clear).
- **Single-instance** app (one calculator window). No persistence needed beyond
  optional last-mode in a tiny local store (optional; fine to skip).
- No new dependency (React + core UI kit only).

## Fix

New package `apps/add-ons/calculator/` mirroring an existing add-on's
`package.json` / `tsconfig.json` / `eslint.config.js` shape (deps: just
`@imbatranim/core` + `lucide-react`). `src/index.ts` exports `manifest`
(`icon: Calculator` from lucide, `component: lazy(() => import('./Calculator')…)`,
`multiInstance: false`). `src/Calculator.tsx` + a pure `src/engine/evaluate.ts`
(tokenizer + evaluator; unit-testable pure functions) + `src/engine/programmer.ts`
(BigInt base/bitwise ops). Styling: core tokens + `cn`, Win7-classic B&W+accent,
button grid; no bespoke palette.

## Must preserve (regression surface)

Nothing existing changes — additive package. Only shared-file touch is the
controller's manifest.ts entry + `npm install` (not this package's concern).
Division-by-zero shows a non-crashing error state; float display avoids
`0.1+0.2` noise (round to ~12 sig digits for display).

## Verify bar

`turbo typecheck` (now 14 packages), calculator lint + format green, build ok;
the calculator chunk is its own lazy chunk (brief 33 pattern). **Human-gated:**
basic arithmetic correct incl. precedence; programmer mode base conversions +
bitwise correct; keyboard works.

## Invariants

Lightweight (no deps), identity locked, client-only (no auth/FS surface).

## Out of scope

Scientific functions (trig/log) beyond programmer bitwise, history tape,
unit/currency conversion.

## Outcome (2026-07-18) — Wave C commit `a7632ab`

Shipped. `apps/add-ons/calculator/` (13 files): Basic mode uses a flat
token-list + shunting-yard evaluator (`engine/evaluate.ts`, no `eval`);
Programmer mode uses an accumulator+pending-op flow over 64-bit-clamped `BigInt`
(`engine/programmer.ts`) with HEX/DEC/OCT/BIN base switch + AND/OR/XOR/NOT/`<< >>`
(and arithmetic). Keyboard scoped to the top-most window. Subagent functionally
smoke-tested precedence (2+3×4=14), div-by-zero recovery, sign toggle, base
conversions, NOT 0 = FFFFFFFFFFFFFFFF. No new deps. Own lazy chunk (3.82 KB gz).
`multiInstance: false`. Human-gated feel-check open.
