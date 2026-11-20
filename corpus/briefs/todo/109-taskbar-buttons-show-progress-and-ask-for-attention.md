# Brief 109: Taskbar buttons show progress and ask for attention

**Depends on:** nothing (105's prompt marks help, not needed). **Runs after:** 108.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 4.

## Context

- Programs report progress with `OSC 9;4;<state>;<percent>` (ConEmu's
  sequence, also read by Windows Terminal and Ghostty): 0 none, 1 normal,
  2 error, 3 indeterminate, 4 paused. A killed program never clears it, so
  Ghostty resets the state after about 15 s without an update
  (`website/docs/vt/osc/conemu.mdx`). xterm.js has an addon for it,
  `@xterm/addon-progress` (0.2.0, no peer dependencies declared on
  2026-11-20; check it loads on xterm 6 before relying on it).
- Windows 7 drew progress across the taskbar button and flashed the button
  of a window that wanted attention; Windows 11, GNOME (urgent windows) and
  macOS (a bouncing Dock icon) all keep some form of it. The OS keeps the
  Win7 taskbar skeleton and picks current UX for the details.
- Ghostty's bell asks the window manager for attention by default
  (`bell-features = attention`). The Terminal ignores the bell today.
- Taskbar buttons are drawn in `apps/core/src/shared/components/taskbar/Taskbar.tsx`
  from the window store. Apps reach their window through `system.window`
  (`packages/ui/src/system.ts`; two handles in
  `apps/core/src/system/createSystemHandle.ts`, the windowless one warns).

## Decisions

The look is a built default, asked on the end move.

1. **The kit**: `system.window.setProgress({ state, value? })` with the five
   states above (`"none" | "normal" | "error" | "indeterminate" | "paused"`,
   `value` 0-100), and `system.window.requestAttention()`. Optional members,
   not a breaking change: neither `SHARED_KIT_VERSION` nor `PROTOCOL_VERSION`
   moves, and a caller checks the member exists.
2. **Progress on the button**: a 3 px bar along the button's bottom edge,
   inside it, above the focus underline: the accent for normal, the error
   token for error, `on-surface-variant` for paused (the theme has no warning
   token; don't add one here), a sweeping segment for
   indeterminate (a still, striped bar under reduced motion). The phone's
   48 px icon button shows the same bar.
3. **Attention**: the button takes the accent container fill and pulses
   twice (motion-safe), then stays filled until the window is focused. A
   focused window ignores the request.
4. **The Terminal**: `@xterm/addon-progress` maps to `setProgress`, with
   Ghostty's 15 s reset and a reset at the next prompt when 105's marks are
   there. A bell while the window isn't focused calls `requestAttention`. No
   sound.

## Files you OWN

- `packages/ui/src/system.ts`, `apps/core/src/system/createSystemHandle.ts`,
  `windowStore.ts`, `Taskbar.tsx`, their tests.
- `apps/add-ons/repl-interpreter/` (`package.json` for the addon,
  `Terminal.tsx`, a new `lib/progress.ts`, tests).
- Corpus: `wiki/ui-conventions.md` (the two taskbar states),
  `wiki/status.md` (append to a line), `log.md`.

## What to do

1. Store and taskbar tests: each state renders its bar; attention clears on
   focus; the reset after 15 s of fake time.
2. The kit members, the taskbar, the Terminal wiring.
3. Walk it in the dev container in Apricot light and Classic dark, at 1280
   and 390: `printf '\e]9;4;1;40\e\\'`, then `;2;`, `;3`, `;4;70`, `;0`;
   `sleep 3; printf '\a'` with another window focused. Shots, read.

## Acceptance

- [ ] Progress and attention show on the button and clear as described.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`,
  with `--question` on the look; the outcome note names the kit commit for
  imbatranim-apps' next kit sync.
