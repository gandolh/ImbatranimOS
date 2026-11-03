# Brief 02 — The Wayland host shows a window

## Context

Settled 2026-10-23 ([decisions-linux-apps.md](../../wiki/decisions-linux-apps.md),
vocabulary in [glossary-linux-apps.md](../../wiki/glossary-linux-apps.md)):

- Our own **Wayland host**, a Rust process built on smithay, is the display
  that Linux apps connect to.
- The NestJS backend relays it to the tab over the signed-in WebSocket, the way
  the Terminal's PTY works.
- The **compositor** (the desktop's window manager, in the browser) opens one
  OS window per Linux app window.
- Each desktop session (one tab) gets its own Wayland socket.
- A Linux app's window reaches the tab as its image. This is narrowed from
  os-layering's "data, never pixels", for Linux apps only.

This brief gets **output only**: a Linux app's window appears in an OS window
and updates. Input and title bars are brief 03, popups and Firefox are 04,
and lifecycle and sleep are 06. Run it after 01.

## Spec

1. **The crate.** Add `apps/wayland-host/`, a Cargo crate built in its own
   `rust:alpine` Docker stage; only the binary reaches the prod and dev images.
   - Link `libxkbcommon` dynamically and `apk add libxkbcommon` in the
     runtime stages. Don't fight a static build.
   - Turn off every smithay renderer, winit and udev feature. The host never
     draws; it reads the buffers clients hand it.
   - Implement `wl_compositor`, `wl_subcompositor`, `wl_shm`, `xdg_wm_base`
     toplevels, one `wl_output` sized from the tab's viewport, and a `wl_seat`
     with no devices yet (03 adds them).
2. **One socket per desktop session.**
   - The host is one process per machine. The backend starts it when the first
     desktop session asks for Linux apps, and it serves one listening socket
     per session at `$XDG_RUNTIME_DIR/wayland-<session id>`.
   - A session's socket and its clients belong to that session only. A client
     on tab A's socket never appears in tab B.
3. **A desktop session id.** None exists today; only the window layout lives
   in `sessionStorage` (see `windowStore.ts`).
   - Add a random per-tab id in `sessionStorage`, so it survives a reload, and
     a new tab gets a new one.
   - The Wayland WebSocket carries it.
   - The PTY WebSocket carries it too, and a Terminal shell gets
     `WAYLAND_DISPLAY=wayland-<session id>` and the `XDG_RUNTIME_DIR` from 01
     in its environment. That way an app started from the Terminal belongs to
     the tab whose shell started it.
4. **Backend ↔ host.** The two talk over a local Unix socket in a mode-0700
   directory with a small framed protocol, written down once and shared by the
   Rust and TypeScript sides:
   - session open and close;
   - toplevel created, destroyed, and title, app id and size changed;
   - a frame: changed regions plus their pixels;
   - room for input messages, which 03 fills in.
5. **Frames.**
   - `wl_shm` buffers are little-endian ARGB/XRGB; convert to RGBA in Rust.
   - Send changed regions only, lossless. Measure two encodings on the test
     client and record the choice: deflate-compressed RGBA (decoded with
     `DecompressionStream`) and lossless WebP (decoded with
     `createImageBitmap`).
   - Cap each window near 30 fps. Under WebSocket backpressure, drop
     intermediate frames and send the latest, as the PTY handles
     backpressure.
6. **The WebSocket route.** Add `/api/wayland` (binary frames), registered
   through `UpgradeRoutes` and dispatched by the single upgrade listener in
   `PtyGateway`. It gets the Terminal's checks: session cookie, Origin, and the
   30 s revocation sweep. No route ships without sign-in.
7. **The compositor side.** When a toplevel appears, the desktop opens an OS
   window for it:
   - its title is the toplevel's title, its taskbar button uses the app id,
     and its body is a canvas painting the frames;
   - when the toplevel goes away, the window closes;
   - the window is a new window kind in core, not an add-on with a manifest.

## Must preserve

- The Terminal, its revocation and backpressure behaviour, and every
  existing upgrade route.
- `connect-src 'self'` and the rest of the desktop's CSP. Frames come over the
  same-origin socket, so the policy should not change.
- Linux apps run as `imbatranim`, and nothing gains root.

## Acceptance

- In Chrome on the dev container, a Terminal command such as
  `foot sh -c 'while sleep 1; do date; done'` opens an OS window titled for
  foot, and the date ticks every second. foot is from Alpine's community repo
  and is a test client in the dev stage only.
- With two tabs open, foot started in tab A shows only in tab A.
- Closing tab A disconnects its clients. 06 refines this.
- Encoding choice, frame rate and bytes per second for the ticking clock are
  recorded in the outcome note.
- `npm run typecheck`, `npm run lint`, the backend and core tests, and
  `cargo test` and `cargo clippy` for the crate pass. The prod image builds,
  and its size growth is recorded.

## Files you OWN

- `apps/wayland-host/**` (new)
- `apps/backend/src/modules/wayland/**` (new), and its registration in
  `app.module.ts`
- `apps/backend/src/modules/pty/` (the session id and its environment
  variables only)
- `apps/core/src/modules/linux-windows/**` (new), plus the smallest hooks
  needed in `windowStore.ts` and the window container
- `infrastructure/Dockerfile` (the Rust stage, `libxkbcommon`, foot in dev)

## Files you must NOT touch

- The marketplace backend and host.
- Every add-on.

## Outcome (2026-11-02)

Built in `f43b42e` on `claude/linux-apps-layer`, and walked outside the
container: the environment it was built in can't pull images, so the walk
ran the backend, the Vite dev server, the host and Ubuntu's foot 1.16.2
directly, in headless Chromium driven by Playwright. Owed by the owner: the
same walk in Chrome on the dev container, and the prod image build with its
size growth (commands at the end).

- **The host.** smithay 0.7 with only `wayland_frontend`; no renderer,
  winit or udev. Each desktop session is its own `Display` with its own
  globals, so a session's clients can't see another's output or windows.
  Added beyond the spec: `wl_data_device_manager`, because foot exits with
  "no clipboard available" without it; it copies and pastes between one
  session's Linux apps only. Subsurfaces, popups and cursors get their
  buffers released but aren't shown. The binary is 1.6 MB and links
  `libxkbcommon` and `libgcc_s` dynamically; the Alpine stage builds with
  `-C target-feature=-crt-static` for that.
- **Encoding: lossless WebP.** Measured on foot running
  `while sleep 1; do date; done` (700×474) over 21 s, through a stand-in
  backend: WebP 24,374 bytes (about 1.2 KB/s), deflate 41,667 bytes (about
  2.0 KB/s). Each tick sends two rectangles (the new line and the cursor)
  at about one frame a second, since frames go only when something changed.
  The first full frame: 218 bytes in WebP, 6,879 in deflate. With foot
  scrolling `yes` for 10 s both ran about 27 frames a second and 2.25 MB/s,
  and the host used 0.90 s of CPU with WebP against 0.81 s with deflate.
  WebP wins on idle bytes and costs about 10% more host CPU when busy;
  `WAYLAND_HOST_ENCODING=deflate` switches it for later measurements.
- **Frame rate and backpressure.** One frame in flight per window, at most
  every 33 ms. The backend acks once `bufferedAmount` is under 512 KiB; until
  then the host holds the window's frame callbacks and folds new damage into
  the next frame, so intermediate frames are never queued.
- **Session id.** `desktopSessionId()` in `@imbatranim/ui`: 16 random bytes,
  base64url, in `sessionStorage`. A duplicated tab copies it; the backend
  allows one socket per id and closes a second with 4409, and that tab takes
  a new id.
- **Two departures from "files you must not touch".** The Terminal add-on's
  `ptyUrl.ts` sends the session id (one import and one query parameter): the
  PTY socket's URL is built there and nowhere else. And core's marketplace
  `sharedKit.ts` lists the two new kit exports, which its typecheck requires
  of every kit export.
- **Not done here:** the taskbar button of a Linux window shows its title and
  no icon (the taskbar finds icons in the app registry, which Linux apps
  aren't in). The OS close button closes the OS window only; the app keeps
  running until the tab closes. Brief 03 makes it ask the app.

Walked (outside the container): foot started from the Terminal opened an OS
window titled "foot" with app id `linux:foot`, its canvas changed every
second with the clock; a second tab in the same browser had its own session
id and no Linux windows; closing the first tab ended foot (one process
before, none 3 s after) and removed its socket, and the second tab's socket
stayed.

Checks: `npm run typecheck` and `npm run lint` (51 tasks), the backend's
unit tests (824, 16 new) and e2e suite (184), core's tests (577 in 42
files), `@imbatranim/ui`'s (39) and the Terminal's (25), `cargo test` (9)
and `cargo clippy --all-targets -- -D warnings`. One e2e run failed once on
the marketplace's service-app test while other suites ran beside it and
passed alone; that is the open todo on timeouts under load.

The owner's run:

```bash
docker compose -f infrastructure/docker-compose.yml build imbatranimos   # note the size before and after
docker images imbatranimos:1.0 --format '{{.Size}}'
npm run dev     # then, in Chrome at http://localhost:5173, in the Terminal:
#   foot sh -c 'while sleep 1; do date; done' &
```
