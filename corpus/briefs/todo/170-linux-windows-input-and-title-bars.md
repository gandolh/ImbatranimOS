# Brief 170 — Linux windows: input and title bars

## Context

Brief 169 puts a Linux app's window into an OS window, output only. This brief
makes it usable: pointer, keyboard, focus, resize, close, and the title bar
rule the owner settled on 2026-10-23
([decisions-linux-apps.md](../../wiki/decisions-linux-apps.md)).

**Title bars follow the app.** An app that asks the display to draw its title
bar gets the Win7 one. An app that draws its own, as Firefox and most GTK apps
do, gets no OS title bar: just the window frame and a taskbar button, and
dragging its own bar moves the OS window. This is a deliberate exception to
the locked Win7 chrome, for Linux windows only. Keep the frame and the taskbar
button, and don't "fix" it by adding a second bar.

**The keyboard is US only** for now (owner, 2026-10-23). A layout setting is a
later brief, so typing Romanian letters in a Linux app won't work yet. Say so
in the outcome.

## Spec

1. **Pointer.**
   - Motion, buttons and wheel or touchpad scroll go to the surface under the
     pointer, in surface coordinates.
   - Scroll maps to `wl_pointer.axis`, using `axis_value120` where the client
     binds a seat version that has it.
   - Implement `cursor-shape-v1` so apps can name their cursor, and map the
     names to CSS cursors. A client that sets a cursor surface instead gets the
     default arrow.
2. **Keyboard.**
   - Map `KeyboardEvent.code` to evdev keycodes with a table, and send a US
     xkb keymap from libxkbcommon.
   - Modifiers are tracked by the host's xkb state.
   - Key repeat uses `wl_keyboard.repeat_info`; ignore the browser's own
     repeats (`e.repeat`).
   - While a Linux window has focus, keys go to the app, except the desktop's
     global hotkeys (`useGlobalHotkeys.ts` and the registered hotkeys with a
     global scope), which keep working.
   - Browser-reserved combinations the page can't capture stay with the
     browser. List them in the outcome.
3. **Focus.**
   - Focusing an OS window sends `wl_keyboard.enter` and sets the toplevel's
     `activated` state; focus leaving sends `leave`.
   - Only one Linux window per session has keyboard focus.
4. **Resize and states.**
   - Resizing an OS window sends `xdg_toplevel.configure` with the new size,
     respecting the toplevel's min and max.
   - Maximize, minimize and fullscreen requests from the app map to the
     window manager's own actions.
   - Configure and ack ordering follows xdg-shell.
5. **Close.** The OS close button sends `xdg_toplevel.close`. The app decides
   what happens, and may ask to save or refuse. The OS window closes when the
   toplevel is destroyed, not on the click.
6. **Apps that draw their own title bar.**
   - Honour `xdg_toplevel.move` and `resize` requests by starting the window
     manager's own drag or edge resize from the current pointer position.
   - `show_window_menu` may be ignored.
7. **xdg-decoration.**
   - Implement `zxdg_decoration_manager_v1`. An app that asks for
     server-side decoration gets the Win7 title bar with its title.
   - An app that asks for client-side decoration, or never binds the protocol,
     gets the frame-only window.
   - Prefer server-side when an app offers both.

## Must preserve

- Global hotkeys, Alt-Tab, the command palette and Escape handling in every
  non-Linux window.
- The window manager's own move and resize for every other app.
- Brief 169's output path and its per-session isolation.

## Acceptance

In Chrome on the dev container, using foot (and one GTK test client from
Alpine's repos that draws its own title bar):

- typing a command in foot runs it; Ctrl-C, arrows, Tab and Backspace work;
- selecting text with the mouse works, and so does scrolling with the wheel;
- resizing the OS window makes foot reflow;
- the OS close button closes foot;
- foot asking for server-side decoration shows the Win7 title bar;
- the GTK client shows one bar (its own), and dragging that bar moves the OS
  window;
- the desktop's global hotkeys still fire while foot has focus.

The test suites, `cargo test` and `cargo clippy` pass. The outcome lists what
was walked and the keys the browser keeps.

## Files you OWN

- `apps/wayland-host/**`
- `apps/backend/src/modules/wayland/**`
- `apps/core/src/modules/linux-windows/**`, plus the smallest hooks needed in
  the window manager for frame-only windows and app-started moves and resizes

## Files you must NOT touch

- `useGlobalHotkeys.ts` and the hotkey registry, except to read which keys
  are global.
- Every add-on, and the marketplace.
