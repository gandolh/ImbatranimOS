# Brief 110: A Linux app asks for attention

**Depends on:** 109 (the taskbar's attention state). **Runs after:** 109.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 4.

## Context

- Wayland apps ask for attention, or to be raised, through `xdg-activation-v1`.
  The host hands out tokens and ignores every request, "since only the owner
  raises windows" (`apps/wayland-host/src/stubs.rs`, `request_activation`).
  X11 apps set the urgency hint in `WM_HINTS`.
- GNOME and KDE show such a request without raising the window: a
  notification or a highlighted taskbar entry. That keeps the owner's rule
  and still tells them.
- The host already tells the tab what a window asks for with the outbound
  `request` message (`action`: move, resize, maximize, minimize, fullscreen,
  in `apps/wayland-host/PROTOCOL.md`). foot, in the dev image, sets urgency
  on a bell with `-o bell.urgent=yes`.

## Decisions

1. **An activation request becomes `request` with `action: "attention"`** for
   the toplevel that owns the surface. Nothing is raised or focused.
2. **X11's urgency hint** does the same when it turns on.
3. **The tab** marks the OS window with brief 109's attention state, which
   clears on focus. Core owns Linux windows, so it calls the store directly.
4. Bump the protocol's `hello` version only if an older tab would misbehave
   on the new action; say which in the outcome.

## Files you OWN

- `apps/wayland-host/src/` (`stubs.rs`, the X11 window manager in
  `session/x11.rs`, `protocol.rs`), `PROTOCOL.md`, `protocol-fixtures/`.
- `apps/backend/src/modules/wayland/wayland.protocol.ts` if the relay needs
  it, `apps/core/src/modules/linux-windows/` (the request handler), tests.
- Corpus: `wiki/status-linux-apps-layer.md` (a line), `log.md`.

## What to do

1. Host tests: an activation request on a mapped toplevel yields the
   message; one for an unknown surface yields nothing.
2. The host, the fixture, the tab.
3. Walk it in the dev container: `foot -o bell.urgent=yes`, run
   `sleep 3; printf '\a'`, focus another window; the foot window's taskbar
   button asks for attention and clears when you click it.

## Acceptance

- [ ] Wayland and X11 attention requests reach the taskbar and never raise a
  window.
- [ ] The host's tests and `npm run check` pass; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.

## Outcome (2026-11-23)

Built in `ca0564e` (1.408.0).

- **The host.** `request_activation` (`stubs.rs`) calls `SessionState::ask_for_attention`, which finds the
  window by the surface's root and, for a mapped toplevel, sends `request` with `action: "attention"`
  (`attention_at`). A popup, an unmapped window or a surface no window owns sends nothing. The X11 window
  manager (`session/x11.rs`) reads `WM_HINTS` on its property notify and sends the same when urgency turns
  on (a per-window `urgent` flag, so staying on or turning off sends nothing). Nothing is raised or focused.
- **The tab.** `connection.ts`'s request handler maps `attention` to brief 109's
  `windowStore.requestAttention`, which ignores the focused window and clears on focus.
- **The protocol.** `PROTOCOL.md` names the action for both paths; `protocol-fixtures/request-attention.bin`
  pins the message, and the backend's spec decodes it (the relay passes `action` as a string, so
  `wayland.protocol.ts` didn't change). **`hello` stays at version 10:** a tab without this change has no case
  for `attention` in its switch and ignores it.

**Tests:** `tests/activation.rs` drives the built host with a hand-written Wayland client: it maps a 4×4
toplevel from an shm buffer, gets a token and activates; the backend's end gets the `attention` request and
the client gets no keyboard. A second case activates a surface with no role and the backend gets no
request within 600 ms. Passing the buffer's fd needs `SCM_RIGHTS`, so `rustix` (already a dependency) is a
dev-dependency too with its `net` and `fs` features; `Cargo.lock` is unchanged. The tab's test marks the
button without raising the window and clears it on focus. All 108 host tests pass; clippy's two warnings on
the host binary are the old ones (the X11 enum's size, a cast in vendored smithay).

**X11's path is untested end to end:** no Xwayland here. The urgency branch is four lines beside the title and
hint handling the X11 tests already cover.

**The walk ran outside Docker** (the daemon is down): the backend on the host with the freshly built host as
`WAYLAND_HOST_BIN` and `/run/user/0` as its runtime dir (the scratchpad's path is too long for a Unix
socket), and foot 1.16 from Ubuntu. From the Terminal, `foot -o bell.urgent=yes sh -c 'sleep 6; printf "\a";
sleep 120' &` opened foot's window; with the Terminal raised from its button, the bell filled foot's taskbar
button and left the Terminal on top, and a click on foot's button cleared it. The dev-container walk is the
owner's, with the deploy.

`npm run check` exit 0 (the marketplace e2e timed out once on a cold cache after the container restarted and
passed alone and on the rerun); `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's. Owner step: `node cli.ts imbatranim-os server` (the image rebuilds
the host).
