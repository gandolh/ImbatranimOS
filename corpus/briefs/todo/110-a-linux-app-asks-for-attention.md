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
