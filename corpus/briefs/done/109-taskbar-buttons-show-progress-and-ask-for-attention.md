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

## Outcome (2026-11-23)

Built in `196a6f1` (1.406.0). **Kit commit for imbatranim-apps' next kit sync: `196a6f1`** (`system.window.setProgress`
and `requestAttention`, both optional, with the `SystemProgress` and `SystemProgressState` types exported;
`SHARED_KIT_VERSION` and `PROTOCOL_VERSION` don't move).

- **The store** keeps `progress` (value clamped to 0-100, `none` takes it off) and `attention` on the window,
  neither across a reload. `requestAttention` ignores the focused window; `focusWindow` answers it, and a
  store subscription answers it for a window that comes on top any other way (another closed, a restore).
- **The taskbar** draws the bar as built defaults: 3 px inside the button above the current-task underline
  (offset per theme and for the phone's 48 px button), `bg-primary`, `bg-error`, `bg-on-surface-variant`
  for paused, a third-width segment sweeping across for indeterminate (`task-sweep`, motion-safe; a still
  striped bar under reduced motion). Attention fills the button with `primary-container` and pulses it twice
  (`task-attention`, motion-safe). The keyframes are the desktop's first, in `apps/core/src/index.css`. The
  button's accessible name says the state ("~, 40% done", "failed", "paused at 70%", "working", "wants
  attention").
- **The Terminal**: `lib/progress.ts` reads `OSC 9;4` and passes it to `setProgress`, off after 15 s with no
  update and at the next prompt's A mark; another OSC 9 (an iTerm2 notification) is left alone. `term.onBell`
  asks for attention while the window isn't focused. No sound.

**Not as the brief said:** no `@xterm/addon-progress`. The addon registers the same OSC 9 handler; one OSC
with two numbers doesn't earn a dependency ("lightweight is identity"), and the hand-made reader is tested
on its own. The ui-conventions page was at its 200-line cap, so the two taskbar states went onto item 29's
line rather than a new item.

**Tests:** the taskbar draws each state as its bar and none for none, clamps the value, fills and clears
attention on focus, ignores a focused window's request, and answers a request when the window comes on top
another way; the handle reaches only its own window; `progress.test.ts` reads the five states and the 15 s
reset with fake time; the Terminal sets and clears progress and asks for attention on a bell only when not
focused.

**The walk ran outside Docker** (the daemon is down), with Alpine's bash and the integration, the theme set
through `/api/prefs`: Apricot light and Classic dark, at 1280 and at 390 (Pixel 7). Each of
`printf '\e]9;4;1;40\e\\'`, `;2;40`, `;3`, `;4;70` and `;0` (each followed by `sleep 3`, since the next
prompt clears the bar) drew its bar and label, and the prompt took it off. `sleep 3; printf '\a'` with
Calculator on top (on the phone, the Terminal minimised) filled the button; a click on it cleared it. In
Classic dark the error red sits close to that theme's accent; that is for the look question. The
dev-container walk is the owner's, with the deploy.

`npm run check` exit 0; `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's, with `--question` on the look. Owner step:
`node cli.ts imbatranim-os server`.
