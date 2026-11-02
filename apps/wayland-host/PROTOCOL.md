# The Wayland host's protocols

Two connections carry a Linux app's windows to the tab that shows them:

```
Linux app ──Wayland──▶ Wayland host ──control socket──▶ backend ──/api/wayland──▶ tab
```

This file is the one description of the control socket and of what
`/api/wayland` carries. The Rust side is `src/protocol.rs`; the backend's is
`apps/backend/src/modules/wayland/wayland.protocol.ts`; the desktop decodes
frames in `apps/core/src/modules/linux-windows/frames.ts`. The fixtures in
`protocol-fixtures/` are written by the Rust tests
(`UPDATE_FIXTURES=1 cargo test`) and decoded by the backend's, so a layout
change fails one side until both agree with this file.

All integers are little-endian.

## The control socket

The backend listens on `$XDG_RUNTIME_DIR/imbatranim-wayland/control.sock`
(the directory is mode 0700) and starts the host with
`--control <that path> [--encoding webp|deflate]`. The host connects once;
when either side closes, the host exits and the backend tells every open
session.

Every message is:

| Field | Size | |
|---|---|---|
| length | u32 | bytes that follow (kind and payload) |
| kind | u8 | 1 JSON, 2 frame |
| payload | length − 1 | |

Messages over 64 MiB are refused, and a malformed one ends the connection.

### JSON, backend to host

| `type` | Fields | Meaning |
|---|---|---|
| `session_open` | `session`, `width`, `height` | A tab wants Linux apps. Listen on `$XDG_RUNTIME_DIR/wayland-<session>` with one output of the tab's viewport size. |
| `session_close` | `session` | The tab went away. Disconnect the session's clients and remove its socket. |
| `output` | `session`, `width`, `height` | The tab's viewport changed. |
| `frame_ack` | `session`, `toplevel` | The toplevel's last frame went to the tab and the socket has room: it may send another. |

A session id is 16 to 64 characters of `A-Z a-z 0-9 - _`; anything else is
refused on both sides.

| `focus` | `session`, `toplevel` (or `null`) | Keyboard focus moved to this toplevel's OS window, or to a window that isn't a Linux app's. The toplevel gets `wl_keyboard.enter` and `activated`; the others lose them. |
| `pointer_motion` | `session`, `toplevel`, `x`, `y` | The pointer, in the toplevel's surface coordinates. |
| `pointer_button` | `session`, `toplevel`, `button`, `pressed` | A Linux button code, `BTN_LEFT` (0x110) to `BTN_TASK` (0x117). |
| `pointer_axis` | `session`, `toplevel`, `dx`, `dy`, `v120x`, `v120y`, `wheel` | Scroll in surface pixels; from a wheel, also in 120ths of a notch. |
| `pointer_leave` | `session` | The pointer left the session's Linux windows. |
| `key` | `session`, `keycode`, `pressed` | A Linux (evdev) key code, to the focused toplevel. The host's xkb state (a US keymap) tracks modifiers; apps repeat keys themselves. |
| `configure` | `session`, `toplevel`, `width`, `height`, `maximized` | The OS window's size for the app's window geometry, clamped to the app's limits, sent as `xdg_toplevel.configure`. |
| `close` | `session`, `toplevel` | The OS close button: `xdg_toplevel.close`. The app decides. |

### JSON, host to backend

| `type` | Fields |
|---|---|
| `hello` | `version` (1) |
| `session_ready` | `session`, `display` (the socket name, `wayland-<session>`) |
| `session_failed` | `session`, `reason` |
| `toplevel_created`, `toplevel_updated` | `session`, `toplevel`, `title`, `app_id`, `width`, `height`, `geometry`, `decorations`, `min_width`, `min_height`, `max_width`, `max_height` |
| `toplevel_destroyed` | `session`, `toplevel` |
| `cursor` | `session`, `name` |
| `request` | `session`, `toplevel`, `action`, `edges` |

A toplevel is created when it first shows a buffer, and destroyed when the
app destroys it or removes its buffer. `width` and `height` are its image's
size in pixels; `geometry` (`x`, `y`, `width`, `height`) is the part of the
image that is the window, without shadows (the whole image when the app set
none). `decorations` is `server` when the app asked for the OS title bar
(xdg-decoration) and `client` when it draws its own or never asked. The
limits are the app's on its geometry, 0 for none. Toplevel ids are unique
within a session.

`cursor` is the CSS name of the cursor the app asked for with cursor-shape-v1
(`default` when it set a cursor surface instead, `none` when hidden).
`request` passes an app's `xdg_toplevel` requests to the window manager:
`move`, `resize` (with `edges`: `n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`),
`maximize`, `unmaximize`, `minimize`, `fullscreen` and `unfullscreen`.

### Frames, host to backend

| Field | Size |
|---|---|
| session id length | u8 |
| session id | that many bytes |
| body | the rest (below) |

The backend strips the session id and sends `[2] + body` to that session's
WebSocket, unchanged.

## The body of a frame

| Field | Size | |
|---|---|---|
| toplevel | u32 | |
| width | u32 | the window's whole image |
| height | u32 | |
| rectangle count | u16 | |
| rectangles | | each below |

Each rectangle:

| Field | Size | |
|---|---|---|
| x, y, w, h | 4 × u32 | in image pixels |
| encoding | u8 | 1 deflate (zlib) RGBA, 2 lossless WebP |
| length | u32 | |
| data | length | |

Deflate data inflates to exactly `w × h × 4` bytes of RGBA, row by row. The
first frame of a toplevel, and the first after its size changes, covers the
whole image.

## Flow control

A toplevel has at most one frame in flight. The host sends a toplevel's frame
at most every 33 ms, only when it has damage and no frame in flight, and
holds the toplevel's `wl_surface.frame` callbacks while one is. The backend
sends `frame_ack` once the WebSocket's buffered amount is below 512 KiB.
Damage that arrives meanwhile is folded into the next frame, so a slow link
gets the latest picture rather than a queue, and the app draws less often.

## `/api/wayland`

`GET /api/wayland?session=<id>&width=<w>&height=<h>`, upgraded, with the
Terminal's checks (the session cookie, Origin, and a 30 s sweep that closes
the socket when the sign-in ends). One socket per session id.

Server to tab: binary frames (`[2] + body`), and JSON text: the host's
toplevel messages without `session`, and `{"type":"unavailable","reason"}`
before a close with code 4503.

Tab to server, JSON text: `{"type":"viewport","width","height"}`, and the
input messages above (`focus` to `close`) without `session`; the backend
checks each field and adds the session.

Close codes: 4401 the sign-in ended, 4409 the session id already has a socket
(a duplicated tab; it takes a new id and reconnects), 4503 Linux apps are
unavailable (no host binary, no `XDG_RUNTIME_DIR`, or the host exited).
