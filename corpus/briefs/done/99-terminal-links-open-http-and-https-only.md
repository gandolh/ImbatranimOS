# Brief 99: Terminal links open http and https only

**Depends on:** nothing. **Runs after:** 98.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 5.

## Context

- Two kinds of link reach the Terminal. Plain URLs in the output go through
  `@xterm/addon-web-links`, whose regex only matches `http://` and `https://`,
  and `Terminal.tsx` opens them with `noopener,noreferrer`. OSC 8 hyperlinks
  (a program names the target, the text can say anything) go through xterm's
  `linkHandler` option, which the Terminal doesn't set.
- With no `linkHandler`, xterm.js asks with a native `confirm()` and then sets
  `location.href` to the target, whatever its scheme
  (`node_modules/@xterm/xterm/src/browser/OscLinkProvider.ts`,
  `defaultActivate`). The desktop's CSP (`script-src 'self'`) should stop a
  `javascript:` target; nobody has tried it.
- Ghostty 1.4 fixed two advisories where a crafted link opened local files or
  custom URL schemes (GHSA-cw69-wm67-5pv8, GHSA-mfw9-xcr3-7gfp). It now blocks
  unsafe targets and confirms custom schemes.

## Decisions

1. **`http` and `https` open; nothing else does.** Any other scheme (`file:`,
   `javascript:`, `data:`, an app scheme) shows a kit toast, "The Terminal
   opens only web links", and nothing opens. The URL is parsed with `new URL`;
   a parse failure is refused the same way.
2. **The target shows before the click.** Hovering an OSC 8 link shows its
   full URL in the kit's `Tooltip` at the pointer (`linkHandler.hover` / `leave`),
   since its text can differ from where it goes. A click opens it in a new
   browser tab with `noopener,noreferrer`, like the plain URLs. No confirm
   dialog: the native `confirm()` goes away.
3. On a phone (no hover), a tap on an OSC 8 link whose text isn't its URL
   asks through the kit's `useConfirm()`, naming the host, with Open and
   Cancel (the repo's web rules forbid native dialogs).

## Files you OWN

- `apps/add-ons/repl-interpreter/src/Terminal.tsx`, a new `src/lib/links.ts`
  and its test.
- Corpus: `wiki/status.md` (append to a line), `log.md`.

## What to do

1. `links.ts`: the scheme check and the decision table, with tests for
   `https://x`, `HTTP://X`, `file:///etc/passwd`, `javascript:alert(1)`,
   `vscode://x`, a malformed URL.
2. Set `linkHandler` on the xterm instance; route the web-links addon's
   callback through the same open function.
3. Walk it in the dev container: `printf '\e]8;;https://example.com\e\\text\e]8;;\e\\\n'`
   shows the URL on hover and opens on click; the same with `file:///etc/passwd`
   and `javascript:alert(1)` shows the toast; at 390 (phone) the tap dialog
   names the host. Shots, read.

## Acceptance

- [ ] Only http and https targets open; the native `confirm()` is gone.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.

## Outcome (2026-11-22)

Built in `dde199e` (1.387.0). `src/lib/links.ts`: `webLinkTarget` (parsed with `new URL`, http and https only) and
`linkAction`, the decision table (refuse; open; ask on a screen with no hover when an OSC 8 link's text isn't
its address, naming the host). The Terminal sets xterm's `linkHandler` (`allowNonHttpProtocols: true`, so a
refused scheme reaches the handler and says why instead of doing nothing), and routes the web-links addon's
callback through the same `openLink`. A refusal is a toast, "The Terminal opens only web links"; an open is a
new tab with `noopener,noreferrer`; the native `confirm()` is gone. Tests: `links.test.ts` (7: `https://x`,
`HTTP://X`, `file:///etc/passwd`, `javascript:alert(1)`, `vscode://x`, a malformed URL, the table) and six
component cases in `Terminal.test.tsx`.

**Deviation:** the hover target is not the kit's `Tooltip` component but an element in its tokens
(`bg-inverse-surface`, `text-inverse-on-surface`, `rounded-control`, the tooltip shadow) placed at the
pointer: the kit's `Tooltip` wraps a trigger element, and an OSC 8 link is a range of cells. Moving the kit to
a pointer-anchored tooltip would be a kit brief.

**Walk** (on the host, Docker's daemon is down; BusyBox `printf` with `\033`): at 1280 in Apricot light,
hovering an OSC 8 link to `https://example.com` showed the URL at the pointer and a click opened a new tab;
`file:///etc/passwd` and `javascript:alert(1)` links showed the toast and opened nothing. **At 390 the phone
case could not be walked:** in headless Chromium's touch emulation xterm 6 never hovers or activates an OSC 8
link from a tap (a mouse hover in the same phone context does). The tap question is covered by the component
test; checking it on a real phone is the owner's.

`npm run check` exit 0; `bash corpus/lint.sh` OK. Owner step: `node cli.ts imbatranim-os server`.

