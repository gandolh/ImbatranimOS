# Brief 171 — Popups, then Firefox in a window

## Context

After 168 (Firefox runs under Nix), 169 (output) and 170 (input and title
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

- Everything 169 and 170 walked with foot.
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

- The Nix setup from 168, except to fix something the walk proves broken
  (say so in the outcome).
- Every add-on, and the marketplace.
