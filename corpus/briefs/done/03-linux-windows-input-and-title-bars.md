# Brief 03 — Linux windows: input and title bars

## Context

Brief 02 puts a Linux app's window into an OS window, output only. This brief
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
- Brief 02's output path and its per-session isolation.

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

## Outcome (2026-11-02)

Built in `3996293` on `claude/linux-apps-layer`, and walked outside the
container as 02 was: the backend, Vite, the host, Ubuntu's foot 1.16.2 and
gtk3-demo 3.24, in headless Chromium driven by Playwright with real pointer
and keyboard events. Owed by the owner: the same walk in Chrome on the dev
container, whose image now adds `gtk+3.0-demo`, and a look by hand at the
keys the browser keeps (below), which synthetic events can't test.

Walked, all passing (14 checks):

- foot asked for server-side decoration and got the Win7 title bar.
- Typing `touch /tmp/…` and Enter in foot ran it; Backspace, ArrowUp
  (recalling and editing the last command), Tab completion and Ctrl-C (on a
  `sleep 30`) each did their job, checked by the file each command made.
- The wheel scrolled foot's scrollback; a mouse drag selected text.
- Dragging the OS window's corner made foot reflow, 700×500 to 849×579.
- Ctrl+K opened the command palette while foot had the keyboard.
- gtk3-demo got a frame and no OS title bar, one bar (its own), and its shadow
  was cropped by its window geometry; dragging its header bar moved the OS
  window (by 150, 83 for a drag of 160, 90, the difference being the drag
  that starts the move).
- The OS close button asked foot to close, and its window went. foot then
  ended once its shell had; it stays a zombie until the Terminal's shell
  reaps it, which is that shell's business.

How it works:

- **Keyboard.** `KeyboardEvent.code` to evdev codes (`keymap.ts`), so keys
  are physical; the host's US xkb keymap makes the characters. Browser
  repeats (`e.repeat`) are dropped and apps repeat from `repeat_info`
  (500 ms, 25 Hz). Keys held when the window loses the keyboard are released.
  The desktop keeps the registered shortcuts of the Global and Window
  management scopes (`desktopKeys.ts`, ranges such as `ctrl+alt+1…4`
  included): the palette, Alt+Tab, workspaces, and Ctrl+W, Ctrl+M and
  Ctrl+Enter for the window itself. Everything else, Escape and the Editing
  scope included, goes to the app.
- **The keyboard is US only** (owner, 2026-10-23): Romanian letters don't
  type in Linux apps yet.
- **Keys the browser keeps**, which a page can't capture outside fullscreen
  with keyboard lock: Ctrl+N, Ctrl+Shift+N, Ctrl+T, Ctrl+Shift+T, Ctrl+W
  (Chrome closes the tab before the desktop or the app sees it),
  Ctrl+Shift+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp and Ctrl+PageDown, and
  whatever the viewer's own OS takes first (Alt+F4, Super, Alt+Tab on the
  viewing machine). This list is from Chrome's documented behaviour, not
  tested: synthetic events skip the browser's shortcuts.
- **Pointer.** Surface coordinates from the canvas; buttons as `BTN_*`; a
  mouse wheel sends `axis_value120` in whole notches (15 per notch as the
  value), a touchpad sends smooth pixels. The body captures the pointer on a
  press, so a drag that leaves the window keeps going to the app.
  cursor-shape-v1 names become CSS cursors; an app that sets a cursor surface
  gets the default arrow.
- **Focus.** The window manager's focused window (`topVisibleWindowId`)
  decides: a Linux window gets `wl_keyboard.enter` and `activated`, the
  others lose them, and focusing any other window sends focus to none.
- **Resize and states.** The window body's size is the app's window
  geometry; a `ResizeObserver` sends `configure` (at most every 50 ms while
  dragging), clamped to the app's min and max, with `maximized` from the
  window manager. smithay handles the configure and ack ordering.
- **Apps that draw their own title bar.** `move` and `resize` requests start
  the window manager's drag or edge resize from where the pointer is;
  `show_window_menu` is ignored. Maximize, minimize and fullscreen map to
  the window manager's actions; it has no fullscreen, so fullscreen
  maximizes.
- **xdg-decoration.** A new decoration object gets server-side; a request
  for client-side is honoured; no preference means server-side. An app that
  never binds the protocol (GTK 3) gets the frame only. The window manager's
  hook is one `frameOnly` prop on `Window`, which hides the title bar with
  `display: none` rather than restructuring the component, so the theme
  briefs' edits to it merge cleanly.
- **The backend checks the tab's input** field by field (`wayland-input.ts`):
  button and key code ranges, finite coordinates, bounded scroll, sizes
  clamped. Anything else is dropped before the host sees it.

Not done, and left for later briefs: popups (menus and tooltips; 04),
subsurfaces (04), snapping a window dragged by its app's own bar, and
following a size the app picks on its own (the OS window keeps the size the
window manager gave it, and the picture is cropped or padded). A Linux
window's taskbar button still has no icon.

Checks: `npm run typecheck` and `npm run lint` (51 tasks), the backend's
unit tests (828, 4 new) and e2e suite (184), core's tests (581 in 44 files,
4 new), `cargo test` (10) and `cargo clippy --all-targets -- -D warnings`.

The owner's run:

```bash
npm run dev     # rebuilds the dev image (it now has gtk3-demo); then, in the Terminal at http://localhost:5173:
#   foot &                   type, scroll, select, resize, close
#   gtk3-demo &              drag its header bar
```
