# Brief 04 — Popups, then Firefox in a window

## Context

After 01 (Firefox runs under Nix), 02 (output) and 03 (input and title
bars), this brief closes the gap between a test client and a real app: the
menus, dropdowns and tooltips that Firefox and every GTK app open as popups.
Then it walks Firefox in an OS window and measures what it costs. Firefox is
the first Linux app ([decisions-linux-apps.md](../../wiki/decisions-linux-apps.md)).

## Spec

1. **`xdg_popup`.**
   - Position each popup from its `xdg_positioner` relative to its parent,
     including constraint adjustment (flip and slide) against the session's
     output.
   - Draw it in an overlay above its parent OS window, where it may extend
     past the parent's edges.
   - Nested popups stack.
   - An explicit grab dismisses the popup chain on a click outside it
     (`popup_done`).
   - Popups follow their parent when the OS window moves.
2. **`wl_subsurface`.** Compose subsurfaces into the parent's canvas in
   order, with their offsets and sync mode.
3. **What Firefox binds at startup.** Run it with `WAYLAND_DEBUG=1`, and stub
   anything it needs to start that is out of scope here:
   - `wl_data_device_manager` (the clipboard, a later brief);
   - `zwp_text_input` (input methods);
   - `xdg_activation`;
   - `wp_viewporter` and `wp_fractional_scale`, if requested.

   A stub answers correctly and does nothing visible. List every global
   Firefox asked for and which ones are stubbed.
4. **Scale.** `wl_output` scale stays 1. On a screen whose
   `devicePixelRatio` is above 1, Linux windows look soft. Note it as known;
   it is not fixed here.
5. **The Firefox walk.** In Chrome on the dev container, start Firefox from
   the Terminal and check:
   - it opens in an OS window with its own title bar;
   - you can load a page, open and switch tabs, and type in the URL bar, whose
     dropdown appears;
   - the right-click menu, the hamburger menu and a `<select>` dropdown open,
     and close on an outside click;
   - tooltips show;
   - a file downloads to `~/Downloads` and shows in Files;
   - the window resizes and closes;
   - a video plays, silently, since sound is a later brief.
6. **Measure and record** in the outcome note, in a short table:
   - Firefox's RSS idle on one page, and with five tabs;
   - CPU while idle, while scrolling, and while a video plays;
   - WebSocket bytes per second in each case;
   - frame rate while scrolling.

   These numbers decide whether lossless frames are enough and whether the
   VPS can carry it.

## Must preserve

- Everything 02 and 03 walked with foot.
- Per-session isolation: Firefox in tab A never shows in tab B.

## Acceptance

- Every line of the walk in Spec 5 passes, or the outcome names what doesn't
  and why.
- The table from Spec 6 is in the outcome note and in `log.md`.
- The test suites, `cargo test` and `cargo clippy` pass.

## Files you OWN

- `apps/wayland-host/**`
- `apps/backend/src/modules/wayland/**`
- `apps/core/src/modules/linux-windows/**`

## Files you must NOT touch

- The Nix setup from 01, except to fix something the walk proves broken
  (say so in the outcome).
- Every add-on, and the marketplace.

## Outcome (2026-11-03)

Built in `9a607b6` on `claude/linux-apps-layer` (1.81.0) and walked in the
dev container, in headless Chromium driven by Playwright with real pointer
and keyboard events (not Chrome: the session has no Chrome, and Chromium is
its open-source build). Every line of Spec 5 passes.

**Subsurfaces.** Each window (toplevel or popup) is composed from its
surface tree: the root's buffer and its subsurfaces in stacking order, at
their offsets, clipped to the root's size; a synchronized subsurface's
state shows with its parent's commit; a moved, added or removed subsurface
redraws the window. Pixels stay premultiplied, as clients send them.
Firefox needs this to show at all: it draws its content into a subsurface
(desync, with an empty input region, so input goes to the GTK surface
under it). Pointer input goes to the topmost surface whose input region
holds the point.

**Popups.** Placed from the positioner and kept on the output with
smithay's flip, slide and resize, against where the tab says the parent
sits (a new `position` message from each window body). Their ids share the
toplevels' space, so frames, acks and pointer input name either. The tab
draws them in a layer above every window, following their parent every
frame while open; they may extend past the parent's edges. A grabbing
popup has the keyboard; popups nest.

What the walk found about Firefox, which shaped this:

- **Firefox takes no explicit grab for its menus.** It closes them itself
  when its window loses the keyboard. So a press outside every Linux
  window (`press_outside`) takes the keyboard from the session's apps, as
  a click elsewhere does on any desktop, and grabbing popups get
  `popup_done`; the next press in a Linux window or the next focus change
  gives it back. Sending `popup_done` to Firefox's menus instead closed
  them, but left Firefox believing one was open, and its next click was
  spent closing it.
- **Firefox draws `<select>` dropdowns and tooltips inside its window**
  when they fit; only its menus and panels (the context menu, the
  hamburger menu, the downloads panel) are `xdg_popup`s.
- **Firefox grew 52 px on every launch**: the host announced a new window
  before reading the geometry committed with its first buffer, so the OS
  window took the whole image, shadows included, and the next configure
  told Firefox that size, which it saved. The geometry is read first now.

**What Firefox binds** (`WAYLAND_DEBUG=1`, Firefox 159): `wl_compositor`,
`wl_subcompositor`, `wl_shm`, `wl_seat`, `wl_output`, `xdg_wm_base`,
`wl_data_device_manager` (real, within the session), `wp_cursor_shape_manager_v1`
(real), and four stubs: `xdg_activation_v1` (tokens handed out, requests
ignored), `zwp_text_input_manager_v3` (no input method), `wp_viewporter`
(viewports not applied; scale 1 means they match the buffer) and
`wp_fractional_scale_manager_v1` (preferred scale 1). It does not bind
`zxdg_decoration_manager_v1` (GTK 3), so it gets the frame and draws its own
title bar.

**Scale.** `wl_output` scale stays 1; on a screen whose `devicePixelRatio`
is above 1, Linux windows look soft. Known, not fixed here.

The walk, all passing: Firefox opens in an OS window with its own title
bar; typing in the URL bar shows its dropdown and Enter loads the page; a
new tab opens and the tabs switch; the right-click menu, the hamburger menu
and a `<select>` open, take a click and close on a press outside; a tooltip
shows and goes; a file downloads to `~/Downloads` and shows in Files; the
window resizes (1450 to 1203 px from its left edge) and closes from
Firefox's own button, its processes gone; a video plays, silently.

| Firefox 159, one window | idle, one page | idle, five tabs | scrolling | video playing |
|---|---|---|---|---|
| PSS, all its processes | 506 MB | 593 MB | 507 MB | 573 MB |
| RSS, summed (counts shared pages again) | 1,113 MB | 1,234 MB | 1,116 MB | 1,208 MB |
| Firefox CPU, % of one core | 2.9 | 1.8 | 22.4 | 16.5 |
| Wayland host CPU, % of one core | 0.2 | 0.2 | 19.1 | 6.2 |
| WebSocket, server to tab | 0 kB/s | 0 kB/s | 160 kB/s | 239 kB/s |
| Frames per second | 0 | 0 | 13.4 | 28.4 |

Measured over 10 s each (scrolling 8 s, a wheel step every 40 ms) on a
1398×854 window, 12 Firefox processes. The video is a 20 s synthetic WebM
(flat colours and a moving caption, 640×360 shown at 480 px wide), so its
bandwidth understates a real film, which lossless frames would carry at
several times this. Idle costs nothing on the wire; scrolling is held to
about 14 frames a second by the host's WebP encoding (19% of a core) and
the one-frame-in-flight ack, not by the link.

**Chromium's renderer crashed** (the tab's page died, "Aw, Snap" in
Chrome's terms) when an OS window's opening or closing zoom ran while a
Linux window was on screen and drawing: Firefox's own window as it opened
(4 times in 6), and another app opening beside Firefox playing a video (3
in 4). The same in Playwright's headless shell and the full Chromium build,
with or without the GPU; not reproduced in a page holding only a canvas and
a zooming element, so the trigger needs more of the desktop. Painting
nothing, or zooming no window, made it stop. So while a Linux window is
open, windows open and close with the fade and without the zoom (a
`fadeOnly` prop on `Window`, set by `WindowContainer`): Firefox starting
then crashed 0 times in 5, a download panel followed by Files 0 in 4, and
an app opening beside a playing video 1 in 5. Whether Chrome with a GPU
crashes at all is the owner's to check.

**Departures from "files you own":** `Window.tsx` and `WindowContainer.tsx`
gain that one prop and its use, the way 03 added `frameOnly`. The Nix setup
is untouched.

**Harness only** (not in the repo): the dev container on the host network
with the session's proxy, and a Firefox policy trusting the proxy's CA.
Firefox's "make Firefox your default browser?" modal, which blocks input to
the page, was answered as a person would ("Don't show this message
again"). The walk holds Shift itself for capitals, as in the 02/03 walk.

Checks: `npm run typecheck` (26 tasks) and `npm run lint` (25), core's
tests (584 in 45 files, 3 new), the backend's unit tests (830, 2 new) and
e2e suite (184), `cargo test` (11) and `cargo clippy --all-targets -- -D
warnings`. The backend's backup tests failed once while this session's
disk was full, and passed once it was freed.
