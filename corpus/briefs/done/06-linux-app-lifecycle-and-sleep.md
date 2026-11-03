# Brief 06 — Linux app lifecycle and sleep

## Context

Settled 2026-10-23 ([decisions-linux-apps.md](../../wiki/decisions-linux-apps.md),
"A Linux app lives with its tab, and sleeps under the cover screen"):

- A Linux app belongs to the tab that started it. A reload reconnects to it
  within a grace period of about 30 s, and closing the tab ends it.
- While the tab is open, the tab's apps are frozen (SIGSTOP, per process
  group) when the cover screen comes up, by idle timeout or by hand, and
  resumed when it's uncovered.
- A Linux app that is still drawing holds the idle cover off, the way a
  playing video does.
- A hidden tab or a minimized window gets no images and no redraw requests.

This keeps the session rule in [os-layering.md](../../wiki/os-layering.md):
closing the tab is logging out, and reloading is the screen redrawing. The
feature is on on every machine, the VPS included (owner, 2026-10-23). Run this
last of 01 to 06.

## Spec

1. **Reload grace.**
   - When a session's Wayland WebSocket closes, the backend keeps the session
     and its apps for 30 s.
   - A WebSocket arriving with the same desktop session id (02) within that
     time resumes it. The host sends the toplevel list and a full frame of
     every window, and the compositor reopens their OS windows.
2. **Ending a session.**
   - After the grace period, every app launched for the session (from Start,
     per 05, each in its own process group) gets SIGTERM to its process
     group, then SIGKILL after 5 s.
   - The host then closes the session's socket and removes it.
3. **Apps started from the Terminal** follow Unix hang-up rules. The PTY
   still dies with its socket, as today, so its shell's jobs get SIGHUP and
   end on a reload, as they would when a terminal window closes on any Linux
   desktop. One started with `setsid`, `nohup` or `disown` survives the shell.
   It is then a client of the session's socket, and the session's end
   disconnects it; kill its process group too, found through the client's
   credentials (`SO_PEERCRED`). Write this rule into the Terminal's section
   of `docs/`, where a user would look for it.
4. **Sleep under the cover screen.**
   - The idle cover of 2026-08-06 (`useIdleLock.ts`, the 5, 15 or 30 minute setting)
     and the manual cover tell the backend when the desktop is covered or
     uncovered.
   - Covered: SIGSTOP each of the session's app process groups. Uncovered:
     SIGCONT.
   - While frozen, the host doesn't count missed `xdg_wm_base` pings against
     a client, and doesn't wait on its frame callbacks.
5. **Drawing holds the cover off.** Extend the idle lock's `isMediaPlaying`
   check: a Linux window that received a frame in the last few seconds counts
   as playing media. A video in Firefox keeps the desktop awake; a still page
   doesn't.
6. **Hidden means quiet.**
   - When `document.visibilityState` is `hidden`, the session's frames stop
     and the host withholds `wl_surface.frame` callbacks, so well-behaved apps
     stop redrawing.
   - A minimized OS window gets the same, per toplevel.
   - Visible again: one full frame, then normal flow.

## Must preserve

- The idle cover screen, its setting and its media check for `<audio>` and
  `<video>`.
- The Terminal's current behaviour on socket close.
- Per-session isolation. A frozen session never freezes another tab's apps.

## Acceptance

In Chrome on the dev container:

- Firefox launched from Start survives a reload with its tabs intact.
- After closing the tab, a Terminal in a second tab shows Firefox's processes
  gone within 40 s.
- With the cover up, `ps -o pid,stat` shows Firefox's processes in state `T`;
  uncovering resumes them and the window repaints.
- A playing video in Firefox keeps the idle cover from engaging; a still page
  lets it engage on time.
- A hidden tab's WebSocket carries close to zero bytes per second, and
  Firefox's CPU drops accordingly. Record the numbers.
- All suites, `cargo test` and `cargo clippy` pass.

## Files you OWN

- `apps/wayland-host/**`
- `apps/backend/src/modules/wayland/**`, `apps/backend/src/modules/linux-apps/**`
- `apps/core/src/modules/linux-windows/**`
- `apps/core/src/shared/hooks/useIdleLock.ts` (the media check and the
  cover notifications only)
- `docs/` (the Terminal hang-up note)

## Files you must NOT touch

- `apps/backend/src/modules/pty/**`, except to read the session id 02 added.
- The cover screen's own UI and sign-in flow.

## Outcome (2026-11-03)

Built in `ab44333` on `claude/linux-apps-layer` (1.85.0) and walked in the
dev container (rebuilt, so tini is PID 1) in headless Chromium: 9 checks,
all passing.

**Reload grace.** A session outlives its socket by 30 s. A socket with the
same desktop session id (a reload keeps it in `sessionStorage`) takes it
back: the backend sends the host the new viewport and `resync`, and the host
announces every mapped window again (toplevels, then popups), the cursor
and its clients, and sends each window whole. The first walk found a race:
the new page's socket could arrive before the old page's close, read as a
duplicated tab (4409), and the tab took a new id, orphaning its apps. A
second socket now waits up to 2 s for the first to close before it is
refused.

**Ending a session.** After the grace, or at once when the sign-in ends,
the host goes or the backend stops: the session's process groups get
SIGCONT and SIGTERM, SIGKILL 5 s later, and then the host closes the
socket. A socket for that id meanwhile is told 4410 (still ending) and
retries. The groups are those Start launched (recorded per session in a
`SessionApps` registry in the Wayland module, which the Linux apps pane
now writes to) and those of the socket's clients: the host reads each
client's pid with `SO_PEERCRED` and sends the list (`clients`); the backend
takes each one's group from `/proc`, leaving out a Terminal shell's own
(a session leader with a terminal) and its own.

**Sleep under the cover.** The desktop's connection watches the auth
store's `locked`, so the idle cover and Start → Cover both count, and says
`cover` on change and on every (re)connect. The backend sends the groups
SIGSTOP or SIGCONT and the host `freeze`: while frozen it sends no frames
and answers no frame callbacks; woken, it redraws every window. The host
sends no `xdg_wm_base` pings at all, so a frozen client has none to miss.

**Drawing holds the cover off.** `isMediaPlaying` also counts a Linux
window that drew a frame of at least 64×64 pixels in the last 3 s, so a
video does and a blinking caret or a small spinner doesn't.

**Hidden means quiet.** `visibilitychange` sends `visibility`; a window
minimized or on another workspace sends `toplevel_visible`. The host then
sends that session's (or window's) frames no more and withholds its frame
callbacks; shown again, one whole frame and normal flow.

**tini** (owner's call) is PID 1 in both images (`apk add tini`,
`ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]`), so processes whose
parent died are reaped: the walk's end found 0 zombies, where the 02/03
walk had left a dozen.

The walk:

- Firefox launched from Start, with two tabs, survived a reload: the same
  pid, its window back, titled "Walk two — Mozilla Firefox".
- A `setsid foot` from the Terminal survived the reload too, its window
  back.
- Start → Cover stopped every process of Firefox's group (10 in state
  `T`); Uncover resumed them and frames came again.
- With a video playing: 237 kB/s and 28 frames/s on the socket, Firefox
  17% of a core; with the tab hidden, 0 kB/s and Firefox 7.5% (it still
  decodes, it no longer draws); shown again, 28 frames/s; with its window
  minimized, 0 frames.
- With the idle cover at 5 minutes: 5.5 minutes of the video playing left
  the desktop uncovered; 5.5 minutes paused covered it.
- After closing the tab, a Terminal in a second tab counted no Firefox or
  foot process left at 38 s, and no zombies.

The hidden tab was simulated: headless Chromium keeps a background page
visible, so the walk set `document.visibilityState` and sent the
`visibilitychange` event the desktop listens for.

**Not as the brief assumed: Terminal jobs and the hang-up rule.** The
decision and Spec 3 expect a Terminal's jobs to get SIGHUP and end on a
reload. Tested with `sleep`: the foreground job ends (the kernel's hang-up
to the terminal's foreground group), but a background job (`sleep 1001 &`)
survives, as `setsid` does, because BusyBox `sh` passes no SIGHUP to its
jobs; it then lives until the session ends. foot ignores SIGHUP itself, so
it survives even in the foreground. Making the PTY's end hang up the
shell's whole session is a change to the PTY module, which this brief may
not touch; it is the owner's call (in status.md). `docs/architecture.md`
says what happens today.

**Firefox's crash helper** daemonizes into a session of its own (parent
PID 1), outside Firefox's group, so it is neither frozen nor signalled; it
exits by itself with Firefox (seen: nothing left 30 s after the tab
closed).

**After a reload** Linux windows reopen where a new window opens, not
where they were: the saved layout leaves Linux windows out (since 02).

**Departures from "files you own":** the Dockerfile (tini), and
`infrastructure/README.md` (a line on the lifetime and tini).

Checks: `npm run typecheck` (26) and `npm run lint` (25), core's tests (587
in 47 files, 1 new), the backend's unit tests (854 in 54 suites, 7 new) and
e2e suite (184), `cargo test` (11) and `cargo clippy --all-targets -- -D
warnings`. The prod image builds and boots with tini as PID 1, 489 MB.
