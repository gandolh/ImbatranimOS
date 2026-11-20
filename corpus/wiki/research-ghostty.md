---
summary: Read 2026-11-20, Ghostty 1.4.0 (2026-10-27) and its source at d69f9ed, for ideas the OS can use. Terminal changes worth briefs (paste safety, title and finished-command toasts from shell marks, a link handler, and a shell that outlives a reload, which revisits the 2026-08-06 reattach deferral), three to measure first (WebGL renderer, adaptive PTY batching, encoding off the Wayland host's event loop), a host debug overlay to borrow, taskbar progress for the owner's taste, ghostty-web watched and not adopted, and three habits for every repo. Nothing measured yet; every number is Ghostty's. Promoted the same day to briefs 98-116.
updated: 2026-11-20
---

# Research: what Ghostty can teach the OS (2026-11-20)

The owner asked what Ghostty, the terminal emulator, and its source can teach
imbatranimOS and imbatranim-apps, mostly about performance. I read the
README, HACKING.md, the AGENTS.md files, the 1.3.0 (2026-03-09) and 1.4.0
(2026-10-27) release notes, the source at `ghostty@d69f9ed` (2026-11-19) and
coder's ghostty-web at `835eb27`. Nothing was installed or run. Docker was
down, so the numbers below are Ghostty's and ours are owed. Ghostty's speed
comes from structure (pty reading and parsing on separate threads, a renderer
that holds the lock briefly and redraws dirty rows, memory allocated late and
compressed when idle), and its core is now a library, libghostty-vt.

## Verdicts

| # | Idea | Where in the OS | Verdict | Size |
|---|---|---|---|---|
| 1 | Make pastes safe | Terminal add-on | adopt | small |
| 2 | A shell that outlives a reload or a dropped socket | `pty` module, `usePtyConnection` | adopt, revisits a deferral | medium |
| 3 | Shell marks: title, finished-command toast, close guard | Terminal, ash profile | adopt in parts | small to medium |
| 4 | Taskbar progress and attention (OSC 9;4, bell) | kit, taskbar | borrow, owner's taste | medium |
| 5 | A link handler for OSC 8 | Terminal add-on | adopt | small |
| 6 | xterm's WebGL renderer | Terminal add-on | measure first | small |
| 7 | Batch PTY output only when it floods | `pty-session.ts` | measure first | small |
| 8 | Encode frames off the host's event loop | `apps/wayland-host` | measure first | medium |
| 9 | A debug overlay for Linux windows | host, `linux-windows` | borrow | small to medium |
| 10 | Fuzz the host's inbound decoder | `apps/wayland-host/src/protocol.rs` | low, skip for now | small |
| 11 | ghostty-web in place of xterm.js | Terminal add-on | watch | none now |

Promoted 2026-11-20 to briefs 98-116, in the run order and with the two
revisits in [decisions-terminal.md](decisions-terminal.md); 10 and 11 are not.

## Terminal

**1. Pastes.** Ghostty 1.3 and 1.4 fixed three paste advisories:
CVE-2026-26982 (control bytes in a paste ran commands), GHSA-4hwh-wx3w-3fqg (a
carriage return wasn't treated as a line end) and GHSA-v8cw-fg4j-jcc4 (drag
and drop skipped the check). Its rule lives in
`ghostty@d69f9ed:src/input/paste.zig`. It always replaces NUL, BS, ENQ, EOT,
ESC, DEL and the tty control keys (Ctrl+C, \, U, Z, Q, S, W, V, R, O) with
spaces, as xterm does. Then `isSafeWith` decides whether to ask. With
bracketed paste on, a paste is unsafe only if it contains the frame end
`ESC[201~`. Without it, any CR or LF is unsafe, because each one runs a
command.

The Terminal's right-click and middle-click paste (`Terminal.tsx`, `paste()`)
send `readText()` straight to `sendInput`, skipping even xterm.js, so a
multi-line paste goes in unbracketed with raw newlines. The keyboard path goes through xterm.js, which
only turns `\r?\n` into `\r` and brackets when the shell asked
(`Clipboard.ts`). Nothing strips ESC, so clipboard text holding `ESC[201~`
and a command breaks out of the bracket. The shell is busybox ash (`$SHELL`
unset, `adduser -D` gives `/bin/sh`, no bash). I couldn't check whether ash
asks for bracketed paste. If it doesn't, every newline in a paste runs.

Proposal: send both paths through xterm's `term.paste()` after Ghostty's strip
list, and ask with the kit's dialog when `term.modes.bracketedPasteMode` is off
and the text has CR or LF, or when it holds `ESC[201~`. Ghostty's `isSafe`
tests port as they are.

**2. A shell that outlives a reload.** `pty-session.ts` kills the pty when the
socket closes, and `buildPtyUrl` carries only the size. A reconnect after a
dropped socket gets a new shell. A reload brings the Terminal window back (the
layout is in `sessionStorage`) with a fresh prompt and the running command
gone. Linux apps get a 30 s grace for this
([decisions-linux-apps.md](decisions-linux-apps.md)), and a backgrounded phone
tab drops sockets often. Reattach was deferred on 2026-08-06 ("tmux reattach =
future", [decisions.md](decisions.md);
[real-os-gaps.md](real-os-gaps.md) calls a server-side store "the shape of the
killed daemon"), so this is a revisit and the owner's call.

libghostty-vt can snapshot and restore a terminal's state
(`example/c-vt-snapshot`), but its API "broke compatibility several times"
this cycle. The lighter path is the tab's own project on the server:
`@xterm/headless` 6.0.0 with `@xterm/addon-serialize` 0.14.0. After a close
the tab didn't mean (a reload, a drop) the pty runs on for 30 s and feeds a
headless terminal. A reconnect carrying the window's session id gets the
serialized screen, then live output. Closing the window still kills it, so the
tab must mark a deliberate close; the brief picks how. The id must be bound to
the signed-in session.

**3. Shell marks.** Ghostty's shell integration emits OSC 133 (prompt start,
input start, command start, command end with exit code) and OSC 7 (working
directory). With those it skips the close prompt at an idle prompt, jumps
between prompts, moves the cursor on a click inside the prompt, and since 1.3
notifies when a long command finishes in an unfocused terminal
(`notify-on-command-finish`). The Terminal today uses no OSC handlers and
ignores titles and bells.

If busybox ash expands `$PWD` and `$?` in `PS1` (unchecked), a script can emit
prompt start, input start, the last exit code and OSC 7 from the prompt. The
gateway spawns ash with no arguments, a non-login shell that reads only
`$ENV`, so the brief sets `ENV`. Ash has no preexec hook, so "command started"
becomes the Enter key after an input-start mark. In order of payoff:

- Title from OSC 0/2 through `system.window.setTitle`, which the kit already
  has. Programs set titles themselves, so this needs no shell work.
- A `system.notify` toast when a command over N seconds ends while the window
  isn't focused.
- A close guard (`system.window.onCloseRequest`) that asks only while a
  command runs.
- A new Terminal window starting in the last OSC 7 directory.

**4. Taskbar progress and attention.** Programs report progress with
`OSC 9;4;state;percent` (0 off, 1 running, 2 error, 3 indeterminate, 4
paused). Ghostty draws a bar and drops it after about 15 s without an update,
since a killed program never clears it (`website/docs/vt/osc/conemu.mdx`).
Windows 7 drew this on the taskbar button, so it fits the OS's skeleton. A
bell could flash the button, as Ghostty's `bell-features = attention` asks the
window manager to. Both need a kit addition, and `packages/ui` is a contract
imbatranim-apps vendors. The look is the owner's call.

**5. Links.** xterm.js opens OSC 8 links after a native `confirm()` and sets
`location.href` to any scheme (`OscLinkProvider.ts`, `defaultActivate`). The
desktop's CSP (`script-src 'self'`) should stop `javascript:` links (not
tried), so this reads as hardening and UX. Ghostty 1.4 fixed two advisories where crafted
links opened local files or custom schemes (GHSA-cw69-wm67-5pv8,
GHSA-mfw9-xcr3-7gfp). Set `linkHandler` to allow `http` and `https`, confirm
with the kit's dialog, and drop other schemes.

**6. WebGL renderer, measure first.** The Terminal uses xterm.js's default DOM
renderer. Ghostty's speed rests on a GPU renderer that redraws dirty rows;
xterm.js's version of that is `@xterm/addon-webgl` (0.19.0), which also draws
box-drawing glyphs itself so lines join. Chromium
keeps a small fixed number of WebGL contexts per page (16 on desktop, as I
understand it) and drops the oldest, so handle `onContextLoss` by falling back
to the DOM renderer. Ghostty 1.4 frees a hidden tab's GPU memory (385 MiB down
to 18 MiB with 20 hidden tabs, rebuilt in under a millisecond), so dispose the
addon while `useWindowVisible` is false. Test beside a Linux window, where
Chromium's renderer once crashed during a zoom. Measure `cat` of a large file
and typing latency, DOM against WebGL.

## Backend and the Wayland host

**7. Batch PTY output only when it floods.** macOS hands a pty reader at most
about 1 KiB per read, so Ghostty 1.4 split reading into a gather thread and a
parse thread (`ghostty@d69f9ed:src/termio/Exec.zig`, the `ReadThread`
comment) and gained 25% to 55% throughput. The part that transfers is the
rule. A batch goes out at the first empty read unless at least 1 KiB gathered.
Only a saturated stream waits, for a budget well under a frame, so typing stays
immediate. `pty-session.ts` sends one WebSocket frame per node-pty data event,
with 1 MiB/256 KiB backpressure. Linux reads are larger, so the win may be
small. Count frames per second during `cat` of a large file first.

**8. Encode off the event loop, measure first.** The host runs one calloop
thread; its only `thread::spawn` calls write pastes (`session.rs`). JPEG, WebP
and VP8 encoding run inline, about 9 to 10 ms of CPU per 720p frame
([research-video-in-linux-windows.md](research-video-in-linux-windows.md)).
Ghostty 1.4 took every OpenGL call off the GTK main thread for the same reason
it drains the pty apart from parsing: nothing slow sits in front of input.
Under one CPU a thread adds no capacity. It would only stop a key or a buffer
release from waiting behind an encode. Measure keystroke-to-frame in one window
while a video plays in another, and build only if the 95th percentile moves.

**9. A debug overlay.** Ghostty's inspector is devtools for the terminal. Ours:
a toggle that tints damage rectangles by encoding and shows frames and bytes
per second per Linux window, so the next measuring round runs live.

**10. Fuzzing, low value here.** AFL++ found about ten crashes in Ghostty's
parser (1.3 notes). Our host's inbound side is JSON our backend writes, decoded
by serde into a `Result` (`protocol.rs`, `next_inbound`), so a fuzz target would
mostly test serde. The fixtures already pair the host's encoder with the
backend's decoder, which is Ghostty's codec rule (`compress/AGENTS.md`).

## ghostty-web: watch, don't adopt

It wraps libghostty-vt compiled to WASM (about 400 KB) in an xterm.js-style
API. The last stable release is 0.4.0 (2025-12-09), with `-next` prereleases
since (latest 2026-11-18). It draws with Canvas 2D, has a fit addon only and
no search, which the Terminal uses. Its benchmark (`bench/versus.ts`) times
parsing only, and Android typing is untested. Better complex-script shaping
doesn't justify 400 KB and lost search. Look again when libghostty tags 1.0
(promised before Ghostty 1.5, March 2027) and ghostty-web moves to the
official WASM build, as its README plans.

## Already fine, and what doesn't carry over

Checked: every `requestAnimationFrame` in imbatranim-apps is one-shot or on
demand (CAD, pdf, slides). Minimized windows stay mounted under
`display: none`, and only System Monitor reads `useWindowVisible`. The one
poll that keeps going is Logs' follow mode, a request every 3 s (`Logs.tsx`);
pausing it while hidden is a one-line fix, as Ghostty stops hidden tabs.
xterm.js pauses its renderer when hidden. Not for us: SIMD parsing and page
memory live inside Ghostty's engine (ours is xterm.js), DMABUF and the native
renderers are GPU work, and the macOS 1 KiB pty cap doesn't apply on Linux.

## Habits for every repo

- **Notes per folder.** Ghostty keeps AGENTS.md in ten folders, each with the
  folder's trade-off priorities in order, its test command and how to verify
  and benchmark. This repo's `.claude/rules/` already does it for the backend
  and the web workspaces; `apps/wayland-host`, which no check touches, has none.
- **Benchmarks on fixed, recorded data.** Generate inputs once, keep them out
  of the repo, reuse identical files across revisions, compare medians with
  hyperfine, never run two at once (`src/benchmark/AGENTS.md`). Ghostty tuned
  its 1.3 I/O work on about 4 GB of real asciinema recordings. Brief 89's
  `testsrc2` clip was the fixed half; a recorded real session is the other.
- **Safe defaults for untrusted output.** Ghostty turns off what output could
  abuse (window resize, screen checksums), previews a clipboard read before
  allowing it, and caps clipboard writes at 64 MiB. The checklist suits Postern,
  Satchel and newspapper; I haven't checked them against it.
