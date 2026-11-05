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

## Outcome (2026-11-05)

Done in `afafa4a` (1.144.0) and `31cc78e` (PROTOCOL.md, 1.145.0).

1. **Out of a Linux app.** smithay calls `new_selection` before it stores the
   selection, so the host notes the text type then and, after the round of
   dispatch, asks the app to write it into a pipe
   (`request_data_device_client_selection`). The pipe is read on the event
   loop (`read_clipboard` in `main.rs`), at most 1 MiB, and must close
   within 5 s; then `clipboard` goes to the backend and on to the tab, which
   calls `writeText`. Text types are preferred in the order
   `text/plain;charset=utf-8`, `UTF8_STRING`, `text/plain`, `TEXT`, `STRING`
   (`src/clipboard.rs`); anything else is never read.
2. **Into a Linux app.** Ctrl+V, Ctrl+Shift+V (terminals) and Shift+Insert,
   by physical key, go through `PasteGate` (`linux-windows/clipboard.ts`):
   the tab calls `readText` (10 s at most), sends `clipboard` with the text,
   then the key; keys pressed meanwhile wait behind it, every other key
   goes at once. The host sets a server-side selection
   (`set_data_device_selection`) and writes the text to whichever app asks,
   on a thread of its own.
3. **The agreement rule** (not in the spec): the tab remembers the last text
   both sides agreed on (a Linux copy it wrote, or a paste's text). A paste
   that reads that same text sends nothing, so Firefox pasting its own copy
   keeps its HTML, and a Linux copy the clipboard refused (page not focused)
   isn't overwritten by older text.
4. **A bug found on the way:** nothing called `set_data_device_focus`, so no
   app was ever offered the selection. Copy and paste between two Linux
   apps didn't work before either. `focus_changed` now passes the clipboard
   to the app with the keyboard.
5. Protocol version 4 on both sides. The tab may now send 2 MiB per message
   (was 64 KiB); the backend checks the text (non-empty string, at most
   1 MiB of UTF-8).

**Checked:**
- `cargo test` (24, five new: text type choice, the 1 MiB cap, broken
  UTF-8, the offer covering what apps ask for; the decode of `clipboard`)
  and the new fixture `clipboard.bin`, decoded by the backend's spec.
- Backend: the wayland specs (30), with the tab's text checked by its UTF-8
  length. Core: 12 new tests (paste keys, the agreement rule, refused, empty,
  too large and slow reads, key order around a paste, one read for two
  pastes); typecheck and lint.
- **Walked in the dev container** (rebuilt on 2026-11-05 with Nix and Firefox
  installed, kept for reuse): typed in Firefox's address bar, Ctrl+A,
  Ctrl+C: the text reached the tab's clipboard. Text set on the clipboard
  with `ț ș` pasted into the address bar with Ctrl+V, and with Shift+Insert;
  copying it back out returned it. The headless walk browser refuses the
  real clipboard API even with the permission granted over CDP, so the walk
  replaced `navigator.clipboard` in the page with an in-memory one; the
  host, backend and tab paths are the real ones.
- **Not walked:** the OS's Notepad and a page outside the OS (they need the
  browser's real clipboard), Chrome's permission prompt, and paste between
  two different Linux apps. Those are the owner's, in a normal Chrome.
