# Brief 111: Terminal programs learn the light or dark mode

**Depends on:** nothing. **Runs after:** 110.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md).

## Context

- The Terminal restyles itself when the desktop flips between light and dark
  (`Terminal.tsx`, the theme effect), but the programs inside it aren't told.
  An editor started in dark keeps its dark colours on a light terminal.
- Ghostty, kitty, foot and Contour implement the "dark and light mode
  detection" sequences: a program enables reports with `CSI ? 2031 h`, asks
  with `CSI ? 996 n`, and the terminal answers `CSI ? 997 ; 1 n` for dark or
  `CSI ? 997 ; 2 n` for light, and sends the same unasked when the mode
  changes while reports are on. Neovim uses it to set `background`.
- xterm.js doesn't implement it. Its parser takes extra CSI handlers
  (`term.parser.registerCsiHandler`); a handler that returns false leaves the
  sequence to xterm.

## Decisions

1. Handle `CSI ? 2031 h` / `l` (keep the flag per window, return false so
   xterm still sees other modes in the same sequence), `CSI ? 996 n` (answer
   with the current mode), and `DECRQM` for 2031 (`CSI ? 2031 $ p`, answer set
   or reset) so programs can detect support.
2. When the desktop's mode changes and the flag is on, send the report once.
3. The flag resets with the terminal (RIS), as xterm's own modes do.

## Files you OWN

- `apps/add-ons/repl-interpreter/src/`: `Terminal.tsx`, a new
  `lib/colorSchemeReports.ts`, tests.
- Corpus: `wiki/status.md` (append to a line), `log.md`.

## What to do

1. Tests on a headless xterm: the query answers; a mode change with the flag
   on sends one report, with it off sends none; `CSI ? 2031 ; 1049 h` still
   switches to the alternate screen.
2. The handlers.
3. Walk it: in the Terminal, `printf '\e[?2031h'`, flip the desktop's mode
   in Settings, and read the report with `cat -v`.

## Acceptance

- [ ] Reports and answers as above; xterm's other modes unaffected.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.

## Outcome (2026-11-23)

Built in `5db01db` (1.410.0). `lib/colorSchemeReports.ts` registers five handlers on the window's xterm:
`CSI ? … h` and `… l` note 2031 and return false, so xterm still takes every mode in the sequence
(`CSI ? 2031 ; 1049 h` switches to the alternate screen); `CSI ? 996 n` answers `CSI ? 997 ; 1 n` (dark) or
`; 2 n` (light); `CSI ? 2031 $ p` answers `CSI ? 2031 ; 1 $ y` or `; 2 $ y`, and any other DECRQM stays
xterm's; `ESC c` turns reports off. The Terminal sends replies through the connection's input path (so a
reattach's replay, which mutes input, never answers twice) and, in its theme effect, sends one report when
the mode (not the accent) changes while reports are on.

**Tests** run on a real `@xterm/xterm` in jsdom, never opened (its parser runs all the same; `@xterm/headless`
isn't a dependency of the workspace and wasn't needed): the query in both modes, one report per change with
reports on and none with them off, the mixed sequence with 1049 both ways, DECRQM before and after, RIS, and
nothing after dispose. The Terminal's test answers a query through its input path.

**The walk ran outside Docker** (the daemon is down): `printf '\e[?996n'; cat -v` showed `^[[?997;1n` in dark;
`printf '\e[?2031h'; cat -v`, then Settings → Appearance → Light showed `^[[?997;2n` and Dark `^[[?997;1n`.
The dev-container walk is the owner's, with the deploy.

`npm run check` exit 0; `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's. Owner step: `node cli.ts imbatranim-os server`.
