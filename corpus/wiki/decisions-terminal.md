---
summary: Terminal calls of 2026-11-20, from the Ghostty research. A Terminal's shell outlives a close it didn't mean for 30 s and comes back with its screen (revisits the 2026-08-06 deferral of reattach), and bash replaces BusyBox sh as the Terminal's shell, so background jobs follow the usual Unix hang-up (revisits 2026-11-03). Also the run order of briefs 98-116 and what each waits on.
updated: 2026-11-20
---

# Decisions: the Terminal (2026-11-20)

Made after [research-ghostty.md](research-ghostty.md) on the owner's word
("pick the best way, you can revert old decisions"). Each revisit is noted
where the old call lives.

## A Terminal's shell outlives a close it didn't mean

_2026-11-20._ Revisits "tmux reattach = future" (2026-08-06,
[decisions.md](decisions.md)) and the reattach line in
[real-os-gaps.md](real-os-gaps.md). When a Terminal's socket closes without
the tab saying it meant to (a reload, a dropped connection, a phone tab put
in the background), the backend keeps the pty for 30 s. A reconnect from the
same window within that time takes it back and gets its screen. Closing the
window still ends the shell at once.

- The window keys its pty by the desktop session id the PTY URL already
  carries plus a token the window keeps across a reload. A duplicated tab
  that brings a key already attached is refused and starts a fresh shell, as
  the Wayland session does with a reused id.
- A detached pty counts toward `MAX_SESSIONS`, and sign-out and the
  revocation sweep end it like an attached one. The idle cover screen
  doesn't freeze a Terminal: a build keeps running under it.
- It lives in the backend that already owns the ptys. No new process.

Rejected: tmux or dtach in the image as the session holder (a second
terminal emulator between the pty and xterm, its own key bindings and
scrollback, and a dependency); libghostty-vt snapshots (its C API broke
compatibility several times in 2026 and has no 1.0); no grace, as today.
**Why**: a reload or a dropped phone connection kills the running command
with no warning, while Linux apps already survive the same thing for 30 s.
VS Code's persistent terminals do the same with a pty host and a headless
xterm, so the shape is proven.

## Bash is the Terminal's shell

_2026-11-20._ Revisits "A Terminal's background jobs live with the session"
(2026-11-03, [decisions-linux-apps-built.md](decisions-linux-apps-built.md)),
which rejected bash. The Terminal's shell becomes bash from Alpine, as the
`imbatranim` user's login shell.

- Background jobs follow the usual Unix rule. Closing a Terminal window hangs
  up its bash, which passes SIGHUP to its jobs. A job started with `nohup`,
  `disown` or `setsid` survives and lives as long as the desktop session, as
  before. A reload or a dropped socket no longer hangs anything up (the call
  above), which was the 2026-11-03 decision's reason.
- *Consequence*: an app started with a bare `&` now ends when its Terminal
  window is closed. That is a change the owner sees, so brief 104's hand-back
  leads with it.

Rejected: keeping BusyBox sh (it doesn't ask for bracketed paste and has no
hook that runs before a command, so every multi-line paste would need a
prompt and command marks couldn't tell when a command starts); zsh or fish
(larger, and not the Linux default); hanging up every process group when a
pty ends (the 2026-11-03 rejected option). **Why**: bash is the default
interactive shell on mainstream Linux; readline turns bracketed paste on by
default since bash 5.1; `PS0` marks a command's start, which OSC 133 needs;
Ghostty and VS Code ship shell integration for it. Its cost is a few MB on a
488 MB image; brief 104 measures it.

## Run order of briefs 98-116

| Brief | What | Waits on |
|---|---|---|
| 98 | Pastes are made safe | nothing |
| 99 | Terminal links open http and https only | nothing |
| 100 | Hidden windows stop polling | nothing |
| 101 | Benchmark workloads and the measuring recipe | nothing |
| 102 | A Terminal's shell outlives a close it didn't mean | nothing |
| 103 | A reattached Terminal gets its screen back | 101, 102 |
| 104 | Bash is the Terminal's shell | 102 |
| 105 | The shell marks its prompts and the window takes titles | 104 |
| 106 | A long command's end is a toast; closing asks only while one runs | 105 |
| 107 | Jump between prompts; a click moves the cursor in the prompt | 105 |
| 108 | A Terminal opens in a folder | 105 |
| 109 | Taskbar buttons show progress and ask for attention | nothing (98-108 not needed) |
| 110 | A Linux app asks for attention | 109 |
| 111 | Terminal programs learn the light or dark mode | nothing |
| 112 | The Wayland host gets its own agent rules | 101 |
| 113 | xterm's WebGL renderer, measured | 101 |
| 114 | PTY output batched only when it floods, measured | 101 |
| 115 | The Wayland host encodes off its event loop, measured | 101, 112 |
| 116 | A debug overlay for Linux windows | nothing |
