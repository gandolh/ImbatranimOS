# Brief 31 — X11 apps open through XWayland

## Context

The first wave of Linux apps (briefs 01-06) speaks Wayland only, so a
program that only speaks X11 doesn't open. smithay, which
`apps/wayland-host` is built on, supports XWayland. Left out on purpose on
2026-10-23 ([decisions-linux-apps.md](../../wiki/decisions-linux-apps.md))
and split out of the todo `linux-apps-after-the-first-wave` with the owner
on 2026-11-03.

## Spec

1. Turn on smithay's XWayland support in the host, and start Xwayland on
   demand, when the first X client of a session connects; every Linux app
   gets the `DISPLAY` that reaches it.
2. X11 toplevels become Linux windows like Wayland ones: title, move,
   resize, close, focus, keys and the mouse, through the same protocol to
   the tab.
3. Xwayland comes from Nix like the apps. Choose between the base profile
   and installing it with the first app that needs it: measure its closure's
   size, and keep the image slim unless the size is small. If it is a real
   trade-off, add it to
   [decisions-linux-apps-built.md](../../wiki/decisions-linux-apps-built.md).
4. Update the Linux apps pages of the wiki and `docs/architecture.md` where
   they say Wayland only.

## Must preserve

- Wayland apps behave as today, and a session with no X client starts no
  Xwayland.
- The image's size, unless step 3 decides otherwise.

## Acceptance

- `xterm` (or another small X11-only program from nixpkgs) installed from
  the pane opens in an OS window, takes typing and clicks, and closes.
- Firefox still opens as a Wayland client.
- `cargo test` for the host and the tests of the files changed in
  `apps/core` pass.

## Files you OWN

- `apps/wayland-host/` (Cargo.toml, src/)
- `apps/wayland-host/PROTOCOL.md` if the protocol changes
- the Nix profile or install step that brings Xwayland
- `apps/core/src/modules/linux-windows/` where X11 windows need it

## Outcome (2026-11-05)

Done in `e365ca8` (1.154.0).

1. **On demand.** smithay 0.7's `xwayland` feature. Each session reserves an
   X display when it opens (the first free one from `:0`: the lock file
   `/tmp/.X<n>-lock` and a listening socket at `/tmp/.X11-unix/X<n>`),
   reported as `x11_display` in `session_ready` (protocol 5). `terminalEnv`
   gives the Terminal's shells and Start's launches `DISPLAY=:<n>`. Nothing
   runs until the first X client connects; then the host starts Xwayland.
   smithay starts Xwayland on sockets of its own, which would lose the client
   already waiting, so the host runs it through a launcher: a link named
   `Xwayland` to the host's binary, first on Xwayland's `PATH`, which runs
   the real one with `-listenfd` added for the reserved socket. A session's
   X side runs on an event loop of its own, dispatched from the host's,
   because smithay's window manager needs a loop whose data is the session's
   state. `src/xwayland.rs` and `src/session/x11.rs`; PROTOCOL.md has the
   whole of it.
2. **Windows.** An X11 window becomes a toplevel and an override-redirect one
   a popup (of the window it is transient for, else the X11 window with the
   keyboard, else the newest). `app_id` is the `WM_CLASS` class in lower case
   (`XTerm` → `xterm`, its desktop file), the OS title bar unless Motif hints
   ask for none, `position` moves the X window (X11 menus use screen
   coordinates), `configure` resizes it, `close` sends `WM_DELETE_WINDOW`,
   `focus` gives it X's input focus and raises it (the keyboard's focus is
   now a Wayland surface or an X11 window). X11 apps' pids join `clients`, so
   the cover screen and the session's end reach X11 apps started from a
   Terminal too.
3. **Xwayland stays for the session** once started: with the window manager
   connected, `-terminate` never fires. Idle it is 16 MB RSS (4.5 MB
   anonymous). If it exits, its windows go and the same display is reserved
   again. The session's end shuts the window manager's connection, so its
   event source goes, Xwayland exits, and the lock file and socket are
   removed.
4. **Where Xwayland comes from (step 3).** Measured at the pin: 155 paths,
   421 MiB unpacked, a 126 MiB download; 420 MiB of it beyond the base
   profile (libdecor brings GTK 3 and systemd), 5 MiB beyond Firefox's
   closure. So not the base profile: the Linux apps pane installs it into its
   own profile, `$NIX_STATE_HOME/profiles/imbatranim-xwayland`, as a second
   step of an install when the user's profile then holds libX11, and removes
   it after a removal that leaves none, so Free space reclaims it. The image
   is unchanged. Recorded in
   [decisions-linux-apps-built.md](../../wiki/decisions-linux-apps-built.md).
5. **Not done:** the X11 clipboard isn't bridged to the session's (copy and
   paste works between X11 apps only), and an X11 app's own cursors show as
   the arrow. Todo `x11-apps-clipboard-and-cursors`.

**Checked:**
- `cargo test` for the host: 31 pass, 7 new (the reservation and its clean
  up, a stale lock taken over, the handed-over socket keeping its waiting
  client, refused clients drained, the launcher's arguments, the app id, the
  size limits). Clippy and rustfmt aren't in the Rust image; not run.
- Backend: `tsc`, eslint, and jest for `linux-apps`, `wayland` and `pty`
  (116 pass): `DISPLAY` in `terminalEnv` and in Start's launches, each
  session's `x11_display` kept and dropped, the Xwayland step after an
  install and after a removal, the libX11 check. `apps/core` is unchanged.
- Walked in the dev container (headless Chrome, the new host binary copied
  in): a new session reserved `:0` and ran no Xwayland; Settings → Linux
  apps installed xterm, then Xwayland into its profile; XTerm from Start
  started Xwayland (`-listenfd` for smithay's socket and the reserved one)
  and opened in an OS window with the OS title bar; typed keys ran
  `echo typed-in-x11 $DISPLAY > /tmp/x11-typed` (`:0`); Ctrl+click opened
  xterm's menu as a popup at the pointer and a release on an item chose it;
  dragging the title bar moved the X window and Maximize resized it
  (1278×501, redrawn); the OS close button closed it. Killing Xwayland
  reserved `:0` again and the next X client brought it back. Firefox from
  Start opened as a Wayland client with `DISPLAY` set (no X11 windows).
  Closing the tab stopped Xwayland, Firefox and foot after the grace and
  removed the socket and lock file; the host kept running.
- Not walked: the cover screen freezing an X11 app, the Romanian layout in an
  X11 app, a normal Chrome with real keys.

Walk notes: agent-browser's `keyboard type` reaches no Linux window (no key
codes); CDP `Input.dispatchKeyEvent` with `code` does. Another project's
dev server held the host's 127.0.0.1:5173, so the walk reached the dev
container through a relay container on another port, with Chrome's
`--host-resolver-rules` mapping `localhost:5173` to it (the backend checks
the Origin). The dev container wouldn't start: an earlier sync had copied
`apps/docs`, which the image leaves out (no Docusaurus installed), into
`/app`, failing `turbo dev`; it was removed, and syncs leave `apps/docs` out.
