# Brief 45 — The phone's keyboard types into a Linux app (prototype)

## Context

A Linux window is a canvas in a focusable `div` that reads physical
`KeyboardEvent.code`, so Android shows no on-screen keyboard for it
(confirmed in Chrome's Android emulation on 2026-11-06:
[research-native-apps-via-wayland-measured.md](../../wiki/research-native-apps-via-wayland-measured.md)
§3; the real-phone steps are there too). This brief takes in the todo
`linux-apps-take-the-phones-keyboard`, filed from that measurement. The owner asked on 2026-11-06 whether the UI
could reach the tab as a description instead of pixels.
[research-remote-ui-rendering.md](../../wiki/research-remote-ui-rendering.md)
found no remote-UI option worth building, and the cheapest path to the phone
keyboard is the protocol the apps already speak: text-input-v3. When a text
field gains focus, GTK 3, GTK 4 and Qt 6.8 tell the display its purpose, the
text around the cursor and the cursor's rectangle, and they take composed and
committed text back. The host registers the protocol as a stub today
(`stubs.rs`: "Input methods: none yet"). This brief is a prototype: it proves
the path on a phone before anyone polishes it. Drafted 2026-11-06, not filed
on brief-board.

## Owner decisions before building

1. **Build it at all?** It improves Linux apps as optional installs, which
   [open-questions.md](../../wiki/open-questions.md) asks the owner to
   confirm. Recommended: yes, since Android is the main phone.
2. **When does text go through the hidden input?** Only after a touch tap in
   a Linux window, or always while a field is active (which also gives
   desktop users the browser's dead keys and IMEs)? Recommended: touch only
   for the prototype. Desktop keyboards keep today's key path.
3. **Composing text**: shown inside the app as preedit (the app underlines
   it), or sent only when committed? Recommended: preedit, as phones expect.
4. **Password fields** (purpose `password`/`pin`, hint `sensitive_data`):
   turn off suggestions and autocorrect in the hidden input. Recommended: yes.
5. **Scope**: GTK 4 and Firefox only, or Qt apps too? X11 apps through
   Xwayland are out either way. Recommended: GTK 4 and Firefox; note in the
   outcome what a Qt app does.

## Spec

1. The host turns text-input-v3 on for real. For the focused toplevel it
   keeps each committed state (enabled, content purpose and hints,
   surrounding text with cursor and anchor, cursor rectangle) and sends it
   to the backend as a new JSON message after every client commit. It takes
   back committed text, preedit text with its cursor, and a delete of bytes
   around the cursor, and sends them as `commit_string`, `preedit_string`
   and `delete_surrounding_text` followed by `done` with the right serial.
   smithay 0.7's `text_input` relays to an input-method-v2 client. Either
   drive it through an input method inside the host or handle the protocol
   directly, and say which in the outcome.
2. The backend relays the new messages both ways, checks every field as it
   does for the input messages, and caps text at the protocol's 4000 bytes.
3. The tab keeps a hidden input in each Linux window: an `<input>`, or a
   `<textarea>` for the `multiline` hint. It sits at the cursor rectangle and
   has an `inputmode` from the purpose (email, url, tel, numeric, decimal,
   text). It mirrors the surrounding text and selection, so backspace and
   autocorrect see the current word. When the app enables text input after a
   tap in that window, the tab focuses the hidden input. When the app
   disables it or focus leaves, the tab blurs it. `beforeinput` and
   composition events become the messages in step 1. Enter, Tab, Escape and
   the arrows still go as keys.
4. On Android, Chrome may refuse to raise the keyboard when `focus()` runs
   after the round trip, outside the tap's user activation. Measure it. If
   it refuses, focus the hidden input on the tap itself, and blur it when the
   app doesn't enable text input within a short wait. Record which one works.
5. PROTOCOL.md documents the messages, and the host's `hello` version goes
   up by one.

## Must preserve

- Desktop keyboards type exactly as today (physical keys, the US and Romanian
  layouts), and an app that never enables text input behaves as now.
- Copy and paste with Linux apps, and the desktop shortcuts the browser
  keeps.
- Surrounding text is never logged and never leaves the session's socket.

## Acceptance

- On an Android phone against the dev container, or in Chrome with touch
  emulation for everything but the keyboard itself: a tap in a GTK 4 text
  field (`gtk4-demo` or GNOME Text Editor) and in Firefox's address bar
  raises the keyboard. A typed word, a swipe-typed word and an autocorrected
  word arrive in the app. Backspace deletes in the app. An email field shows
  the email keyboard, and a password field shows no suggestions.
- The outcome notes the time from tap to keyboard, which focus approach
  step 4 needed, and what a Qt app did, if one was tried.
- `cargo test` for the host covers the state forwarding and the new
  messages. Vitest covers the purpose-to-`inputmode` map and the mapping from
  `beforeinput` and composition events to messages.

## Files you OWN

- `apps/wayland-host/src/` (`stubs.rs`, a text-input module, `protocol.rs`)
- `apps/wayland-host/PROTOCOL.md`
- `apps/backend/src/modules/wayland/` (relaying and checking the messages)
- `apps/core/src/modules/linux-windows/` (the hidden input and the mapping)
