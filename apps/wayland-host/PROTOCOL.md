# The Wayland host's protocols

Two connections carry a Linux app's windows to the tab that shows them:

```
Linux app ──Wayland──▶ Wayland host ──control socket──▶ backend ──/api/wayland──▶ tab
```

This file is the one description of the control socket and of what
`/api/wayland` carries, and of the session's sound (see "Sound"). The Rust
side is `src/protocol.rs`; the backend's is
`apps/backend/src/modules/wayland/wayland.protocol.ts`; the desktop decodes
frames in `apps/core/src/modules/linux-windows/frames.ts`. The fixtures in
`protocol-fixtures/` are written by the Rust tests (`UPDATE_FIXTURES=1 cargo
test`) and decoded by the backend's, so a layout change fails one side until
both agree with this file.

All integers are little-endian.

## The control socket

The backend listens on `$XDG_RUNTIME_DIR/imbatranim-wayland/control.sock`
(the directory is mode 0700) and starts the host with
`--control <that path> [--encoding webp|deflate] [--xwayland <path>]`, the
last naming the Xwayland binary in its Nix profile (see "X11 apps" below;
without it, sessions get no X display). The host connects once; when either
side closes, the host exits and the backend tells every open session.

Every message is:

| Field | Size | |
|---|---|---|
| length | u32 | bytes that follow (kind and payload) |
| kind | u8 | 1 JSON, 2 frame, 3 sound |
| payload | length − 1 | |

Messages over 64 MiB are refused, and a malformed one ends the connection.

### JSON, backend to host

| `type` | Fields | Meaning |
|---|---|---|
| `session_open` | `session`, `width`, `height`, `ratio` | A tab wants Linux apps. Listen on `$XDG_RUNTIME_DIR/wayland-<session>` with one output of the tab's viewport size, its scale the ceiling of `ratio`, the tab's `devicePixelRatio` (see "Scale"). |
| `session_close` | `session` | The tab went away. Disconnect the session's clients and remove its socket. |
| `output` | `session`, `width`, `height`, `ratio` | The tab's viewport or its `devicePixelRatio` changed. |
| `frame_ack` | `session`, `toplevel` | The toplevel's last frame went to the tab and the socket has room: it may send another. |

A session id is 16 to 64 characters of `A-Z a-z 0-9 - _`; anything else is
refused on both sides.

| `focus` | `session`, `toplevel` (or `null`) | Keyboard focus moved to this toplevel's OS window, or to a window that isn't a Linux app's. The toplevel gets `wl_keyboard.enter` and `activated`; the others lose them. |
| `pointer_motion` | `session`, `toplevel`, `x`, `y` | The pointer, in the toplevel's surface coordinates. |
| `pointer_button` | `session`, `toplevel`, `button`, `pressed` | A Linux button code, `BTN_LEFT` (0x110) to `BTN_TASK` (0x117). |
| `pointer_axis` | `session`, `toplevel`, `dx`, `dy`, `v120x`, `v120y`, `wheel` | Scroll in surface pixels; from a wheel, also in 120ths of a notch. |
| `pointer_leave` | `session` | The pointer left the session's Linux windows. |
| `key` | `session`, `keycode`, `pressed` | A Linux (evdev) key code, to the focused toplevel. The host's xkb state (the session's keymap, US until `keyboard_layout` says otherwise) tracks modifiers; apps repeat keys themselves. |
| `keyboard_layout` | `session`, `layout` | The keyboard layout chosen in Settings → Linux apps: `us` or `ro` (Romanian, standard). The host builds its xkb keymap and sends it to every client (`wl_keyboard.keymap`), so running apps type in it at once. Keys stay physical; an unknown id changes nothing. |
| `configure` | `session`, `toplevel`, `width`, `height`, `maximized` | The OS window's size for the app's window geometry, clamped to the app's limits, sent as `xdg_toplevel.configure`. |
| `close` | `session`, `toplevel` | The OS close button: `xdg_toplevel.close`. The app decides. |
| `position` | `session`, `toplevel`, `x`, `y` | Where the toplevel's window geometry starts on the output (the tab's viewport), after the OS window moved or resized. Popups are kept on the output from it. |
| `press_outside` | `session` | The owner pressed outside every Linux window. The keyboard leaves the session's apps, which close the menus they track themselves, and popups holding a grab get `popup_done`. The next press in a Linux window or the next `focus` gives the keyboard back. |

| `resync` | `session` | A tab took the session back after a reload: announce every mapped window again (toplevels, then popups), the cursor and the clients, and send each window whole. |
| `freeze` | `session`, `frozen` | The backend froze the session's apps (SIGSTOP) under the cover screen, or woke them: meanwhile no frames go and no frame callbacks are answered; after, every window is sent whole. |
| `visibility` | `session`, `visible` | The tab was hidden or shown: a hidden session gets no frames and its apps no frame callbacks, so well-behaved apps stop drawing; shown again, every window is sent whole. |
| `toplevel_visible` | `session`, `toplevel`, `visible` | The same for one toplevel and its popups: its OS window was minimized, or moved to another workspace, or shown again. |
| `clipboard` | `session`, `text` | A paste key in a Linux window: the tab read its clipboard. The host offers the text (at most 1 MiB of UTF-8, as `text/plain;charset=utf-8`, `text/plain`, `UTF8_STRING`, `TEXT` and `STRING`) as the session's selection, to the app with the keyboard first. The key follows in the next message. |
| `text_edit` | `session`, `toplevel`, and any of `delete` (`before`, `after`), `commit`, `preedit` (`text`, `cursor_begin`, `cursor_end`) | The tab's hidden input changed the text of the field with text-input focus in `toplevel` (see "Text input"). |

In the pointer messages, `toplevel` names a toplevel or a popup: their ids
share one space within a session.

### JSON, host to backend

| `type` | Fields |
|---|---|
| `hello` | `version` (9) |
| `session_ready` | `session`, `display` (the socket name, `wayland-<session>`), `x11_display` (the X display number reserved for the session's X11 apps, or `null`) |
| `session_failed` | `session`, `reason` |
| `toplevel_created`, `toplevel_updated` | `session`, `toplevel`, `title`, `app_id`, `width`, `height`, `scale`, `geometry`, `decorations`, `min_width`, `min_height`, `max_width`, `max_height` |
| `toplevel_destroyed` | `session`, `toplevel` |
| `popup_created`, `popup_updated` | `session`, `popup`, `parent`, `x`, `y`, `width`, `height`, `scale`, `geometry`, `grab` |
| `popup_destroyed` | `session`, `popup` |
| `clients` | `session`, `pids` |
| `cursor` | `session`, `name`, and `image` (`png`, `width`, `height`, `scale`, `hotspot_x`, `hotspot_y`) when the app drew its own |
| `request` | `session`, `toplevel`, `action`, `edges` |
| `clipboard` | `session`, `text` |
| `text_input` | `session`, `toplevel`, `enabled`, `purpose`, `hints`, `text`, `cursor`, `anchor`, `rect`, `cause` |

A toplevel is created when it first shows a buffer, and destroyed when the
app destroys it or removes its buffer. `width` and `height` are its image's
size in surface coordinates, and `scale` the image pixels to each (see
"Scale"); `geometry` (`x`, `y`, `width`, `height`) is the part of the
image that is the window, without shadows (the whole image when the app set
none). `decorations` is `server` when the app asked for the OS title bar
(xdg-decoration) and `client` when it draws its own or never asked. The
limits are the app's on its geometry, 0 for none. Toplevel ids are unique
within a session.

A popup (a menu, a dropdown, a tooltip: `xdg_popup`) is created when it
first shows a buffer. `parent` is the toplevel or popup it opened from; `x`
and `y` are its window geometry's top-left relative to the parent's window
geometry, after the host kept it on the output (the positioner's flip, slide
and resize, against the output less the parent's `position`). `width`,
`height` and `geometry` are as for a toplevel. `grab` says it holds an
explicit grab: it has the keyboard, and a press in another app's window or
`press_outside` closes it. Popups get frames, acks and pointer input like
toplevels, by their id.

A window's image is its root surface's buffer with its subsurfaces composed
over and under it in stacking order, at their offsets, clipped to the root's
size; a synchronized subsurface's state shows with its parent's commit.

`clients` lists the pids of the processes connected to the session's
socket (read with `SO_PEERCRED`), and of the X11 apps with a window (their
`_NET_WM_PID`), whenever one comes or goes. The backend
uses them, with the process groups of the apps it started from Start, to
freeze the session's apps under the cover screen and to stop them when the
session ends; it doesn't forward them to the tab.

`clipboard` is text an app copied: when an app with the keyboard sets the
`wl_data_device` selection and offers a text type, the host reads it through
a pipe (preferring `text/plain;charset=utf-8`, then `UTF8_STRING`,
`text/plain`, `TEXT`, `STRING`) and sends it once the app closes its end.
More than 1 MiB, or nothing within 5 s, sends nothing. Other types (images,
files) are never read. The selection follows the keyboard: the focused app
is offered the current one, and only it may set a new one. An X11 app's
`CLIPBOARD` is the session's selection too (see "X11 apps").

`cursor` is the cursor the app asked for: the CSS name it gave with
cursor-shape-v1, or `none` when it hid the cursor. An app that draws its own
on a cursor surface (every X11 app through Xwayland, GTK 3 apps) gets `name`
`default` and an `image`: the surface's buffer as a PNG (straight alpha,
base64), its `width` and `height` in image pixels, the `scale` it was drawn
at (image pixels per CSS pixel, 1 or 2), and the hotspot in CSS pixels from
its top-left, kept inside the image. The tab shows it as
`cursor: url(...) x y, default`, through `image-set(... 2x)` at scale 2. A
cursor surface over 128 pixels either way gets `default` with no image, and
one with no buffer `none`. The host sends `cursor` once per round of events
and only when it changed (a new name, image or hotspot), keeps it for
`resync`, and sends `default` when the pointer leaves an app, which then
sets its own again.
`request` passes an app's `xdg_toplevel` requests to the window manager:
`move`, `resize` (with `edges`: `n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`),
`maximize`, `unmaximize`, `minimize`, `fullscreen` and `unfullscreen`.

### Text input

The host speaks text-input-v3 (`zwp_text_input_manager_v3`) itself, for the
phone's keyboard: the tab's hidden input is the session's input method, and
these two messages are how it talks to the app. Text-input focus follows the
keyboard's, on Wayland surfaces only (X11 apps get none): the app with the
keyboard gets `enter` for its surface, and `leave` when the keyboard goes,
which starts its fields over. Only one text input in the session is enabled
at a time.

`text_input` says what the enabled field is, after a commit by its app that
changed it, or when focus moved. The host sends it at most once per round of
events, so focus moving between two fields in one round arrives as the new
field alone.

| Field | |
|---|---|
| `toplevel` | The toplevel the field is in. A field in a popup names the popup's toplevel. |
| `enabled` | The app wants text. When `false` (the app disabled it, or focus left the field, the window or the session's apps), the other fields are empty: `purpose` `normal`, `hints` `[]`, `text` `null`, `cursor` and `anchor` 0, `rect` `null`, `cause` `input_method`. |
| `purpose` | The field's content purpose, by its name in the protocol: `normal`, `alpha`, `digits`, `number`, `phone`, `url`, `email`, `name`, `password`, `pin`, `date`, `time`, `datetime`, `terminal`. |
| `hints` | Its content hints, by name: `completion`, `spellcheck`, `auto_capitalization`, `lowercase`, `uppercase`, `titlecase`, `hidden_text`, `sensitive_data`, `latin`, `multiline`. |
| `text` | The text around the cursor, without the preedit (at most 4000 bytes, the protocol's limit), or `null` when the app doesn't say. |
| `cursor`, `anchor` | The cursor and the selection's anchor, as byte offsets in `text` on character boundaries (equal without a selection). |
| `rect` | The cursor's rectangle (`x`, `y`, `width`, `height`) in the toplevel's surface coordinates, or `null`. |
| `cause` | What changed the text in this commit: `input_method` (an edit from the tab) or `other`. |

`text_edit` changes the field's text: the host sends the app
`delete_surrounding_text`, `commit_string` and `preedit_string` for the parts
present and not empty, then `done` with the number of commits the app has
made (the serial it expects). The app applies them together, in that order:
`delete` removes `before` bytes before the cursor and `after` bytes after it,
outside the selection (cut to the text the app reported); `commit` is
inserted at the cursor, replacing the selection; `preedit` is shown at the
cursor, underlined, until the next edit replaces it (an edit without one
clears it), its cursor at byte offsets `cursor_begin` and `cursor_end` (-1 for
none; left out, or not on a character boundary, at the end). An edit for a
toplevel that no longer has the enabled field is dropped. Text over 4000
bytes, or holding a NUL, is refused; the backend refuses it first.

The text in either message is never logged, and goes only to the session's
own socket.

### Scale

Everything in these messages is in surface coordinates: window sizes and
geometry, limits, positions, popup offsets, the pointer and scrolling. They
are the tab's CSS pixels, so a window has the same size at every scale.
Only frames are in image pixels.

The output's scale is the ceiling of the tab's `devicePixelRatio`, from 1 to
2 (a ratio a hundredth above a whole number counts as that number), and its
mode is the viewport times the scale, so apps see the viewport as its
logical size. A phone at a ratio of about 3 gets scale 2: a little soft, for
under half the pixels of scale 3 under the VPS's memory cap. Apps learn it the three ways they listen: every surface enters
the output (`wl_surface.enter`, where GTK reads it), the preferred buffer
scale (`wl_surface` version 6), and the fractional scale's preferred scale,
the same whole number (an app that binds `wp_fractional_scale_v1`, as Firefox
may, uses only that one). When the ratio changes, every window's surfaces
leave the output and enter it again, so apps that read the scale only on
`enter` look again.

A surface's size in surface coordinates is its viewport's destination when
it set one (`wp_viewport.set_destination`; an app drawing at the fractional
scale does), else its buffer's size over its buffer scale. A viewport's
source rectangle (cropping) is not applied. A window's `scale` is its root
surface's buffer pixels per surface coordinate, rounded, from 1 to 2: 2 for
an app that drew for a scale-2 output, 1 for one that didn't. Its image is
`width × scale` by `height × scale` pixels; a subsurface drawn at another
scale is resampled to the window's, nearest pixel. Surface damage is grown to
whole buffer pixels. When a window's scale changes, it is announced again
(`toplevel_updated`, `popup_updated`) before its first frame at the new one,
and that frame covers the whole image.

The tab lays each window's canvas out at `width` by `height` CSS pixels,
holding the frame's pixels: on a screen whose ratio is 2, one image pixel is
one device pixel, and the window is as big as at scale 1.

X11 apps draw at scale 1 (rootless Xwayland ignores the output's scale
without `-hidpi`), so their windows have `scale` 1 and the tab enlarges them,
as before.

### X11 apps

A session reserves an X display when it opens, as an X server would: the
first free `n` from 0 gets the lock file `/tmp/.X<n>-lock` and a listening
socket at `/tmp/.X11-unix/X<n>`. `session_ready` names it, and the backend
gives the tab's Terminal shells and the apps it starts from Start
`DISPLAY=:<n>` beside `WAYLAND_DISPLAY`. Nothing runs on it yet: a session
with no X client starts no Xwayland.

The first X client to connect starts Xwayland (smithay's, rootless, one
more Wayland client of the session), and the host becomes its window
manager. smithay starts Xwayland on sockets of its own, so the host runs it
through a launcher: smithay runs `Xwayland` from `PATH`, which finds a link
to the host's own binary (in `imbatranim-wayland/xwayland/`, beside the
control socket), and the host, started under that name, runs the real
Xwayland with smithay's arguments plus `-listenfd` for the socket the client
is waiting on. When the binary is missing (no app that speaks X11 is
installed), the waiting client is refused and the next one waited for.

Xwayland then stays until the session ends (about 16 MB idle). If it exits
or crashes, its windows go and the same display is reserved again, so the
`DISPLAY` already handed out keeps working. When the session ends, the host
closes the window manager's connection, Xwayland exits, and the lock file
and socket are removed.

An X11 window becomes a toplevel like a Wayland app's: the same messages,
ids, frames and input. Its `title` is the X title, its `app_id` the
`WM_CLASS` class in lower case (`XTerm` → `xterm`, which usually names its
desktop file), its `geometry` the whole image, its limits the size hints,
and `decorations` is `client` only when it asked for none through Motif
hints. `position` moves the X window to where the tab shows it, since X11
apps place their menus in screen coordinates; `configure` resizes it there
and sets its maximized state; `close` sends `WM_DELETE_WINDOW` (or destroys
a window that doesn't take it); `focus` gives it the X input focus and
raises it. Its move, resize, maximize, minimize and fullscreen requests
(`_NET_WM_MOVERESIZE` and `_NET_WM_STATE`) come as `request`.

An override-redirect window (a menu, a tooltip) becomes a popup of the X11
window it is transient for, else of the X11 window with the keyboard, else
of the newest one, at its X position relative to that window's. It holds no
grab: X11 menus grab inside Xwayland.

The window manager bridges the clipboard, plain text only. When an X11 app
takes `CLIPBOARD` offering text (`UTF8_STRING` or `TEXT`, which smithay names
`text/plain;charset=utf-8` and `text/plain`), it becomes the session's
selection: Wayland apps paste it through the window manager, and the host
reads it the same way and sends it as `clipboard`, as for a Wayland app's
copy. An X11 copy without text (an image) empties the session's selection;
when the X11 app lets it go, or Xwayland exits, a selection that was its copy
empties too. When the tab's text (a paste) or a Wayland app's text becomes
the selection, the window manager takes `CLIPBOARD` and offers it to X11
apps as `UTF8_STRING`, `TEXT` and `STRING`, writing the text as UTF-8; a
Wayland copy without text leaves them an empty `CLIPBOARD`. Xwayland starting
offers what the selection already holds. `PRIMARY` stays between X11 apps.

X11 apps draw their own cursors: Xwayland sets them as cursor surfaces, which
reach the tab as `cursor` images.

### Frames, host to backend

| Field | Size |
|---|---|
| session id length | u8 |
| session id | that many bytes |
| body | the rest (below) |

The backend strips the session id and sends `[2] + body` to that session's
WebSocket, unchanged.

### Sound, host to backend

Laid out as a frame: the session id's length (u8), the id, then the body.
The backend strips the id and sends `[3] + body` to that session's
WebSocket, unchanged.

| Field | Size | |
|---|---|---|
| sequence | u32 | the packet's 20 ms frame number in the session's mix |
| packet | the rest | one Opus packet: 20 ms (960 samples) of 48 kHz stereo |

## Sound

Each session runs a sound server of its own, in the host: it listens on
`$XDG_RUNTIME_DIR/imbatranim-sound/<session>` (the directory is mode 0700)
from `session_open` until `session_close`, and speaks PulseAudio's native
protocol there. The backend gives the session's apps (Start and the
Terminal) `PULSE_SERVER=unix:<that path>`, and `PULSE_COOKIE` naming a file
beside it, so libpulse keeps its cookie out of the home folder; no cookie is
checked, the directory is the access control. Apps play through libpulse as
on any desktop (Firefox does); nothing else is installed for it.

What the server does: the handshake (no shared memory: samples come inline
on the socket), one sink, `tab`, at 48 kHz stereo float, which the server
info names as the default, and no sources, so recording is refused; playback
streams of unsigned 8-bit, 16-bit, 32-bit, 24-in-32-bit or float samples,
1 to 32 channels, at any rate up to 384 kHz (mono plays on both sides, other
layouts are folded into stereo, other rates are resampled, linearly); cork,
flush, trigger, prebuffer and drain, the buffer attributes PulseAudio would
pick, requests for more data, `STARTED`, underflows and overflows; a
stream's volume and mute; timing queries. Introspection lists come back
empty, an app's own sink volume and anything else it asks is acknowledged
and ignored or refused.

While a stream plays (uncorked, past its prebuffer, not dry), the host mixes
every stream of the session in real time, every 10 ms for whatever time
passed (at most 200 ms after a stall), and each whole 20 ms of the mix
becomes one Opus packet at 128 kbit/s. A frame quieter than a 16-bit
sample's last bit is not sent, though it keeps its sequence number, and with
nothing playing the clock stops; when it starts again the sequence skips one,
so a gap in the numbers always marks a break in the sound. Apps are told the
sink's latency is 60 ms, about what the trip and the tab's buffer add, so a
video player shows each picture beside its sound.

Under the cover screen (`freeze`) the clock stops and the part of a frame
not sent is dropped; the apps are frozen anyway. On waking the mix starts
again from then, without playing the time it slept. Hiding the tab or
minimizing a window doesn't stop the sound.

## The body of a frame

| Field | Size | |
|---|---|---|
| toplevel | u32 | |
| width | u32 | the window's whole image, in pixels (its `width × scale`) |
| height | u32 | |
| rectangle count | u16 | |
| rectangles | | each below |

Each rectangle:

| Field | Size | |
|---|---|---|
| x, y, w, h | 4 × u32 | in image pixels |
| encoding | u8 | 1 deflate (zlib) RGBA, 2 lossless WebP, 3 JPEG (lossy) |
| length | u32 | |
| data | length | |

Deflate data inflates to exactly `w × h × 4` bytes of RGBA, row by row. The
first frame of a toplevel, and the first after its size changes, covers the
whole image.

JPEG is only sent with `--encoding webp`, for a region that keeps changing (a
video): one at least 240×135 that was redrawn in six of the window's last
eight frames, and only where every pixel is opaque. Only that region goes
lossy; the rest of a rectangle around it (text beside a video) is sent as
lossless WebP in its own rectangles. Once the region has been still for
eight ticks (about a quarter of a second) it is sent once more, lossless, so
a paused video ends up sharp. A window that isn't playing anything is sent
lossless exactly as before. The constants are in `pixels.rs`.

## Flow control

A toplevel has at most one frame in flight. The host sends a toplevel's frame
at most every 33 ms, only when it has damage and no frame in flight, and
holds the toplevel's `wl_surface.frame` callbacks while one is. The backend
sends `frame_ack` once the WebSocket's buffered amount is below 512 KiB.
Damage that arrives meanwhile is folded into the next frame, so a slow link
gets the latest picture rather than a queue, and the app draws less often.

## `/api/wayland`

`GET /api/wayland?session=<id>&width=<w>&height=<h>&ratio=<r>`, upgraded, with the
Terminal's checks (the session cookie, Origin, and a 30 s sweep that closes
the socket when the sign-in ends). One socket per session id.

Server to tab: binary frames (`[2] + body`) and sound packets (`[3] + body`,
dropped while the socket holds over 1 MiB, never held back and never
acknowledged), and JSON text: the host's
toplevel, popup and `text_input` messages without `session`, and `{"type":"unavailable","reason"}`
before a close with code 4503. First of all, `{"type":"session","resumed"}`:
`true` when the socket took back a running session (below), so the windows the
resync announces are ones the tab had and go back to their places, and `false`
for a new session, whose toplevel ids may repeat an old session's.

Tab to server, JSON text: `{"type":"viewport","width","height","ratio"}`
(the viewport in CSS pixels and the `devicePixelRatio`, sent on a resize and
when the ratio changes: another screen, a page zoom), the
input messages above (`focus` to `press_outside`), `visibility`,
`toplevel_visible`, `keyboard_layout` (sent on connect and on every
change), `clipboard` and `text_edit`, without `session`; the backend checks
each field and adds the session. A message is at most 2 MiB, room for a paste's 1 MiB
of text. The host's `clipboard` reaches the tab as `{"type":"clipboard","text"}`
and the tab writes it to the clipboard.

The tab reads its clipboard only on a paste key in a Linux window (Ctrl+V,
Ctrl+Shift+V, Shift+Insert), and holds the keys after it until the read
settles: the `clipboard` message goes before the key. It sends none when the
text is what the two sides last agreed on (text a Linux app copied, or the
last paste), so an app pasting its own copy keeps its richer types; nor when
the read is refused, empty, over the limit or takes over 10 s. `{"type":"cover","covered"}` is the backend's own: it freezes or
wakes the session's apps and sends the host `freeze`.

A session outlives its socket by 30 s. A socket for the same session id
within that time (a reload keeps the id in `sessionStorage`) takes it back:
the backend sends the host `output` and `resync`. After it, or at once when
the sign-in ended or the host went away, the session ends: the process
groups of its apps get SIGTERM (after SIGCONT, if frozen), then SIGKILL 5 s
later, and then `session_close`.

Close codes: 4401 the sign-in ended, 4409 the session id already has a socket
(a duplicated tab; it takes a new id and reconnects), 4410 the session is
still ending (its apps are being stopped; try again shortly), 4503 Linux apps are
unavailable (no host binary, no `XDG_RUNTIME_DIR`, or the host exited).
