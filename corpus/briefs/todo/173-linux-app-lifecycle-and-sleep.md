# Brief 173 — Linux app lifecycle and sleep

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
last of 168 to 173.

## Spec

1. **Reload grace.**
   - When a session's Wayland WebSocket closes, the backend keeps the session
     and its apps for 30 s.
   - A WebSocket arriving with the same desktop session id (169) within that
     time resumes it. The host sends the toplevel list and a full frame of
     every window, and the compositor reopens their OS windows.
2. **Ending a session.**
   - After the grace period, every app launched for the session (from Start,
     per 172, each in its own process group) gets SIGTERM to its process
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
   - Brief 97's idle cover (`useIdleLock.ts`, the 5, 15 or 30 minute setting)
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

- Brief 97's cover screen, its setting and its media check for `<audio>` and
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

- `apps/backend/src/modules/pty/**`, except to read the session id 169 added.
- The cover screen's own UI and sign-in flow.
