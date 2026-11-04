# Brief 41 — Copy and paste between Linux apps and the desktop

## Context

Copy and paste between a Linux app and the rest of the OS (and the computer
the browser runs on) doesn't work. A page may write the clipboard freely but
reads it only with permission: Chrome asks once per site, Firefox asks on
every paste. Grilled with the owner on 2026-11-04: **both ways, on the keys,
plain text only**.

## Spec

1. **Out of a Linux app.** When a Linux app sets the Wayland selection
   (`wl_data_device`, offered as text), the host sends the text to the tab,
   and the tab writes it to the real clipboard (`navigator.clipboard.writeText`).
   Copy in Firefox, paste in an OS app or anywhere on the computer.
2. **Into a Linux app.** Ctrl+V (and Shift+Insert) in a focused Linux window:
   the tab reads the real clipboard (`readText`, which asks permission the
   first time in Chrome), sends the text to the host, which offers it as the
   session's selection and then forwards the key, so the app pastes it.
3. Plain text only (`text/plain;charset=utf-8` and the usual aliases). Other
   types are ignored on both sides.
4. If the browser refuses the read, the paste goes through with whatever the
   Linux side already had, and nothing breaks.

## Must preserve

- Keyboard input's latency for every other key.
- No clipboard polling: reads happen only on a paste key.
- The real-os-gaps rejection of a clipboard manager with history stands; this
  is a bridge, not a history.

## Acceptance

- In the dev container: text copied in Firefox pastes into the OS's text
  editor and into a page outside the OS; text copied outside pastes into
  Firefox with Ctrl+V.
- Tests for the selection messages pass, with `cargo test` for the host.

## Files you OWN

- `apps/wayland-host/src/` (selection handling) and `PROTOCOL.md`
- `apps/core/src/modules/linux-windows/` (clipboard reads and writes)
