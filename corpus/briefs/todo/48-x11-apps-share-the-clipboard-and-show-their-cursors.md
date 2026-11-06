# Brief 48 — X11 apps share the clipboard and show their own cursors

## Context

Promoted on 2026-11-06 from the todo `x11-apps-clipboard-and-cursors`
(found building brief 31). X11 apps open through Xwayland, but two things
stop at its edge (`apps/wayland-host/PROTOCOL.md`, the end of the X11
section: "Not yet"):

- **The clipboard.** Copy and paste works between X11 apps only, not with
  Wayland apps, the desktop or the computer the browser runs on. Brief 41
  bridged the session's `wl_data_device` selection with the tab as plain
  text; `apps/wayland-host/src/session/x11.rs` notes the X11 side isn't
  bridged ("The X11 clipboard isn't bridged to the session's yet"). smithay's
  X11 window manager can bridge them (`XwmHandler::new_selection` and
  `send_selection`, `X11Wm::new_selection` and `send_selection`). The
  session's selection handlers hold the tab's text as their user data
  today, so a source from X11 needs a second kind.
- **Cursors.** The host forwards cursor-shape-v1 names as a CSS cursor;
  an app that sets a cursor **surface** instead gets `default`
  (`session.rs`, `cursor_image`). Every X11 app does (xterm's I-beam shows
  as the arrow), and so do GTK 3 apps that draw their own cursors.

## Owner decisions

Settled on 2026-11-06: **both in one brief**, the clipboard bridge and the
cursor images. The smaller calls, with the default this brief builds:

1. **What the cursor carries.** Default: the cursor surface's image as a
   small PNG (or the frame format the host already uses) with its hotspot,
   sent only when it changes, and kept per session so a reload's `resync`
   resends it. The tab shows it as `cursor: url(...) x y, default`. At
   scale 2 (the HiDPI cap) the image is sent at the scale it was drawn at,
   and the tab sizes it in CSS pixels.
2. **Size limit.** Default: at most 128x128 image pixels; a bigger cursor
   surface falls back to `default`.
3. **Clipboard kinds.** Default: plain text only, the same as brief 41
   (`UTF8_STRING`, `text/plain;charset=utf-8` and the X11 `STRING` /
   `TEXT` targets). Images and rich text stay out.

## What to do

1. The X11 selection bridge: when an X11 app takes `CLIPBOARD`, the
   session's selection becomes an X11-backed source (the second kind of
   user data), so Wayland apps and the tab read it through the same path
   brief 41 built; when a Wayland app or the tab sets the selection, X11
   apps can paste it (`send_selection`). PRIMARY stays as it is.
2. Cursor images: in `cursor_image`, a `CursorImageStatus::Surface` reads
   the surface's buffer and hotspot and sends a new message (or extends
   `cursor`) per decision 1; PROTOCOL.md documents it and the host's
   protocol version goes up by one. The tab applies it on the Linux
   window under the pointer and clears it when the pointer leaves.
3. PROTOCOL.md's "Not yet" line goes.
4. Tests: `cargo test` for the selection kinds and for the cursor message
   (an image, its hotspot, the size limit, no resend when unchanged);
   Vitest for the tab's cursor style.
5. A walk in the dev container: copy in xterm and paste in the desktop's
   Notes and in Firefox, and back the other way; xterm shows its I-beam
   over text.
6. Corpus: the Linux apps pages, status and log.

## Files you OWN

- `apps/wayland-host/src/` (`session.rs`, `session/x11.rs`, `protocol.rs`)
  and `apps/wayland-host/PROTOCOL.md`
- `apps/backend/src/modules/wayland/` only if the new message needs passing
  through
- `apps/core/src/modules/linux-windows/` (the cursor style) and its tests
- the corpus pages in step 6

## Acceptance

- The tests above pass; `cargo test` in the cached rust container.
- The walk: text copied in xterm pastes in Notes and Firefox, and the other
  way round; xterm's own cursor shows.
- **Owner steps:** push this repo, then `node cli.ts imbatranim-os all`
  from vps-deploy.
