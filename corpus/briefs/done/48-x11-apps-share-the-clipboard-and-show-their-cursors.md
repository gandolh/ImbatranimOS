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

## Outcome (2026-11-06)

Built in `7378699` (1.185.0). Ready for deploy on the board.

1. **The clipboard bridge.** X11 CLIPBOARD text and the session's selection
   now copy both ways (`src/session/x11.rs`, `clipboard.rs`). The host's
   selection has two kinds, the tab's text and an X11 source with its mime
   type, and a paste reads from either. Only CLIPBOARD is bridged; PRIMARY
   stays inside X. The host offers the current text when Xwayland starts and
   clears it when Xwayland stops.
2. **Cursor images.** `src/cursor.rs` turns a cursor surface into a PNG
   (flate2 and a CRC, no new crate), with its hotspot and scale, and the
   existing `cursor` message gains an `image` (protocol 9, `PROTOCOL.md`'s
   "Not yet" line removed). Images over 128 px fall back to `default`. The
   host sends a cursor only when it changes, once per round, and a reload's
   resync resends it. The tab's `cursorCss` checks the base64, size, scale and
   hotspot before building `url(...)`, with `image-set` at 2x. The backend has
   the matching v9 `CursorImage` type.
3. **Review and debugging fixes.**
   - The paste writer thread could block forever on a stalled reader. smithay
     hands the host a non-blocking pipe that cut pastes at 64 KiB; the writer
     now clears `O_NONBLOCK` and writes through `write_within`, a non-blocking
     write polled for `POLLOUT` up to a 5 s deadline.
   - X11's `STRING` target is transcoded to Latin-1.
   - Stale and empty pastes after xterm owned CLIPBOARD had one root cause:
     smithay's `X11Wm::new_selection` only queues the ownership request. The
     host now waits for X to confirm the owner, with a round trip
     (`get_randr_primary_output`) in `x11_offer_clipboard`.

**Checks run.** Host cargo 83 tests plus 1 integration; backend jest 37; core
vitest 93. A walk in the dev container: the cursor message carries an image
and the tab styles `url(data:image/png`; double-click a word in xterm reaches
the tab clipboard; Ctrl+V in Notes and Firefox; copy in Notes and Firefox,
then Shift+Insert in xterm; a GTK3 app's own cursor at device pixel ratio 2
gives an `image-set` at 2x; a reload over xterm shows the same cursor after
resync; a 200 KB paste was checked after the second fix round.
**Skipped.** The walk script's X11-at-DPR-2 step: X11 stays at scale 1 by
brief 33's decision, so that was the script's error, not a bug.

**Accepted limits.**
- A paste over 64 KiB into xterm stalls (smithay's INCR, below). The owner
  accepted it on 2026-11-06 and asked for a todo:
  [x11-pastes-over-64-kib-reach-child-windows](../../todos/x11-pastes-over-64-kib-reach-child-windows.md).
- If the X11 app that copied quits, a Wayland paste gets nothing (the same
  rule as Wayland, brief 41). STRING-only X11 apps beyond the Latin-1 case
  aren't otherwise bridged.
- A clipboard manager re-owning CLIPBOARD overwrites the tab clipboard, one
  extra hop and no loop.
- A cursor scale above 2 clamps to 2 (wrong size and hotspot, no panic); an
  app setting its cursor before the first commit hides it briefly; animated X
  cursors resend the PNG per commit, with no rate limit.
- X11 areas with no cursor of their own show X's `left_ptr`.

**Left for the owner.** After the deploy: in Chrome, open xterm with
`-xrm 'XTerm*selectToClipboard: true'` and check that hovering shows the
I-beam, that a copy in xterm pastes into Notes, and the reverse. The
walk's unreproduced report that xterm gives no window after the last X client
closes was not seen again (Xwayland never exits while the window manager is
connected).
