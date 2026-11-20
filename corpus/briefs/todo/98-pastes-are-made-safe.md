# Brief 98: Pastes into the Terminal are made safe

**Depends on:** nothing. **Runs after:** 97.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 1.

## Context

- The Terminal (`apps/add-ons/repl-interpreter/src/Terminal.tsx`) has two paste
  paths. A keyboard paste is the browser's `paste` event on xterm's textarea:
  xterm.js turns `\r?\n` into `\r` and wraps the text in `ESC[200~` /
  `ESC[201~` when the shell asked for bracketed paste (`Clipboard.ts`). The
  right-click and middle-click paste call `paste()`, which sends
  `navigator.clipboard.readText()` straight to `sendInput`: no bracketing, no
  newline conversion.
- Neither path strips control bytes. Clipboard text holding `ESC[201~` and a
  command ends the bracket early and runs the command; a raw newline or
  carriage return runs whatever came before it. A web page can put any text on
  the clipboard when you copy from it.
- Ghostty fixed three advisories of this kind in 2026 (CVE-2026-26982,
  GHSA-4hwh-wx3w-3fqg, GHSA-v8cw-fg4j-jcc4). Its rule lives in one place,
  `ghostty@d69f9ed:src/input/paste.zig`, and copies xterm (the X11 terminal).
- The shell is BusyBox sh today, bash after brief 104. Whether BusyBox sh asks
  for bracketed paste is unchecked; the rule below works either way.

## Decisions

Technical calls, made by convention (Ghostty and xterm); record any change on
the ticket.

1. **One function for every paste**, in the add-on's `lib/`: the keyboard
   paste (intercept the `paste` event in the capture phase on the host
   element, before xterm's textarea handler), the right-click and middle-click
   paste, and a text drop on the terminal if the browser delivers one.
2. **Suspicious text asks first.** Before anything is changed, the text is
   unsafe if it contains `ESC[201~`, or if bracketed paste is off
   (`term.modes.bracketedPasteMode`) and it contains `\r` or `\n`. Unsafe text
   asks through the kit's `useConfirm()`, showing the first lines (control bytes drawn
   visibly, as `^[` and `␍`), with Paste and Cancel; Cancel is the default.
3. **Then strip.** Replace these bytes with a space, as xterm does: NUL, BS
   (0x08), ENQ, EOT, ESC, DEL, and the tty control keys 0x03, 0x1C, 0x15,
   0x1A, 0x11, 0x13, 0x17, 0x16, 0x12, 0x0F. Tab, `\n` and `\r` stay.
4. **Then `term.paste(text)`**, never `sendInput`: xterm's public paste does
   the newline conversion and the bracketing by the shell's current mode.
5. No size cap (Ghostty has none for pastes). No setting to turn it off.

## Files you OWN

- `apps/add-ons/repl-interpreter/src/Terminal.tsx`, a new `src/lib/paste.ts`
  and its test.
- Corpus: `wiki/status.md` (append to a line, the page is at its cap),
  `log.md`.

## What to do

1. The function and its tests first. Port Ghostty's cases from `isSafe` and
   `isSafeWith` (`"hello\r"`, `"hello\r\nworld"`, `"he\x1b[201~llo"`, tab
   kept) and the strip list. Show the right-click path's failure on today's
   code with a test on the component (`sendInput` receives the raw text).
2. Wire every path through it. The Ctrl+Shift+V comment in `Terminal.tsx`
   explains why keyboard paste goes through the native event; keep that, and
   make sure one paste still arrives once.
3. Walk it in the dev container (reuse `infrastructure-dev-1`) at 1280,
   Apricot light: a right-click paste of `echo one` + newline + `echo two`
   asks first; `printf` a clipboard string with `\x1b[201~` and see the
   dialog; a string with `\x03` arrives with a space; a plain one-line paste
   goes straight in. Shots, read.

## Acceptance

- [ ] Every paste path goes through the one function; the tests show today's
  failure and pass after.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.
