# Brief 84 — Linux apps share the PRIMARY selection

## Context

Brief 83's walk found that stock xterm's Shift+Insert pastes PRIMARY, and the
Wayland host bridges only CLIPBOARD (brief 48), so a desktop copy pasted with
Shift+Insert gives nothing. The walk had to start xterm with
`-xrm 'XTerm*VT100.translations: #override Shift <Key>Insert: insert-selection(CLIPBOARD)'`.

Today PRIMARY lives only among X11 apps (Xwayland's own), Wayland apps have
none (the host doesn't offer the primary selection protocol), and nothing from
the desktop reaches it. Brief 48 kept PRIMARY out because bridging it to the
tab would make every selection a clipboard change. This brief bridges it
inside the session and in from the desktop, never out, so that reason still
holds. Promoted from the todo `xterm-shift-insert-pastes-the-clipboard` in the
2026-11-09 grill.

## Depends on

- brief 48 (the X11 clipboard bridge: the host's selection holders and the
  round trip that confirms X's owner before a paste).
- brief 83 (the vendored smithay 0.7.0; its INCR fix covers large PRIMARY
  pastes too).

## Owner decisions (settled 2026-11-09)

1. Highlighting text in a Linux app stays among the session's Linux apps
   (middle click pastes it there) and never reaches the desktop clipboard.
   Only an explicit copy does, as on GNOME and KDE, and as the built-in
   Terminal does (it copies on Ctrl+Shift+C, not on a highlight).

## Controller calls (by convention; the owner may veto)

2. Bridge PRIMARY instead of shipping xterm with a Shift+Insert resource.
   It's what Linux desktops do, and it fixes every X11 app that pastes
   PRIMARY (xterm's Shift+Insert and middle click, rxvt, Emacs' X build), not
   one app.
3. One PRIMARY per session, shared by its Wayland apps
   (`zwp_primary_selection_v1`, smithay's `primary_selection`) and its X11
   apps (PRIMARY through the window manager), the way Xwayland shares it on
   GNOME and KDE.
4. Text the tab hands over for a paste fills PRIMARY as well as CLIPBOARD,
   like TigerVNC's viewer (`SetPrimary`, on by default). The tab hands text
   only when the clipboard changed since the two sides last agreed
   (`LinuxClipboard.agreed` in `apps/core/src/modules/linux-windows/clipboard.ts`),
   so a paste of unchanged text leaves a Linux app's highlight in PRIMARY.
5. Middle click stays a plain click, with no clipboard read. A read would put
   a permission check, and in Firefox a Paste prompt, in front of every middle
   click, including opening a link or closing a tab in a Linux Firefox; brief
   41 reads only on the paste keys. So middle click pastes the last Linux
   highlight, or the last desktop text a paste key handed over. The built-in
   Terminal's middle click does read the clipboard, but it's one web app, not
   a session of apps that use middle click for other things.
6. Plain text only, with the same types and the same 1 MiB cap as CLIPBOARD.

## What to do

1. Host, Wayland: offer the primary selection protocol to the session's
   clients (`PrimarySelectionState`, `PrimarySelectionHandler`,
   `delegate_primary_selection!` from the vendored smithay). A Wayland app's
   PRIMARY reaches the other Wayland apps through smithay, as CLIPBOARD does.
2. Host, X11: in the window manager's handlers in `src/session/x11.rs`
   (`allow_selection_access`, `send_selection`, `new_selection`,
   `cleared_selection`), handle `SelectionTarget::Primary` next to
   `Clipboard`. An X11 app's PRIMARY becomes the session's PRIMARY (Wayland
   apps can paste it), and the session's PRIMARY becomes X11's. Keep brief
   48's confirm-before-paste round trip for PRIMARY too; without it xterm
   pasted stale text.
3. Host: when the tab hands text (`set_clipboard`), offer it as PRIMARY as
   well. The host tracks PRIMARY's holder the way it tracks the clipboard's
   (`HostSelection`), in a second slot, not a shared one: a highlight
   replaces PRIMARY and leaves CLIPBOARD alone.
4. PRIMARY never goes to the tab. The read that sends a Linux copy to the tab
   (`start_clipboard_read`) runs for CLIPBOARD only, and a test pins it.
5. Update the comments that say "PRIMARY stays between X11 apps"
   (`src/clipboard.rs`, `src/session/x11.rs`), the built line of the
   revisited decision in `corpus/wiki/decisions-linux-apps-input-files-look.md`
   ("The X11 clipboard bridge"), and status.md.
6. The tab's clipboard code shouldn't need to change. If it does, say why in
   the outcome note.

Self-review before the walk: no `unwrap` on anything an app sends, a closed
pipe or a vanished owner ends the paste quietly, and the paste writer's
deadline from brief 48 covers PRIMARY reads too.

## Files you OWN

- `apps/wayland-host/src/` and its tests
- `corpus/`

## Files you must NOT touch

- `apps/wayland-host/vendor/smithay/`. If smithay lacks something, stop and
  say so.
- The built-in Terminal (`apps/add-ons/repl-interpreter/`).

## Acceptance

- Host tests for the pure parts: the tab's text sets both selections; a
  highlight (Wayland or X11) replaces PRIMARY only; PRIMARY is never read for
  the tab; a paste from PRIMARY reads whoever holds it.
- `cargo test` for the host passes.
- A walk in the dev container (host work, so it gets one), set up like 83's:
  rebuild the host in the cached `rust:1.97-alpine` container and copy it in.
  Use stock xterm (no `-xrm`) and Firefox:
  - Copy on the desktop, Shift+Insert in xterm: it arrives. A 70 KB copy
    arrives whole.
  - Highlight in xterm, middle click in a Firefox text field: it arrives.
    Highlight in Firefox, middle click in xterm: it arrives.
  - Highlight in xterm, then paste on the desktop (Notepad): the earlier
    desktop copy comes out, not the highlight.
  - Ctrl+V in Firefox and Ctrl+Shift+V in xterm paste as before, and a copy in
    Firefox still reaches the desktop clipboard.
  - A middle click on a link in Firefox opens it with no clipboard prompt.
