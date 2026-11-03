# Brief 31 — X11 apps open through XWayland

## Context

The first wave of Linux apps (briefs 01-06) speaks Wayland only, so a
program that only speaks X11 doesn't open. smithay, which
`apps/wayland-host` is built on, supports XWayland. Left out on purpose on
2026-10-23 ([decisions-linux-apps.md](../../wiki/decisions-linux-apps.md))
and split out of the todo `linux-apps-after-the-first-wave` with the owner
on 2026-11-03.

## Spec

1. Turn on smithay's XWayland support in the host, and start Xwayland on
   demand, when the first X client of a session connects; every Linux app
   gets the `DISPLAY` that reaches it.
2. X11 toplevels become Linux windows like Wayland ones: title, move,
   resize, close, focus, keys and the mouse, through the same protocol to
   the tab.
3. Xwayland comes from Nix like the apps. Choose between the base profile
   and installing it with the first app that needs it: measure its closure's
   size, and keep the image slim unless the size is small. If it is a real
   trade-off, add it to
   [decisions-linux-apps-built.md](../../wiki/decisions-linux-apps-built.md).
4. Update the Linux apps pages of the wiki and `docs/architecture.md` where
   they say Wayland only.

## Must preserve

- Wayland apps behave as today, and a session with no X client starts no
  Xwayland.
- The image's size, unless step 3 decides otherwise.

## Acceptance

- `xterm` (or another small X11-only program from nixpkgs) installed from
  the pane opens in an OS window, takes typing and clicks, and closes.
- Firefox still opens as a Wayland client.
- `cargo test` for the host and the tests of the files changed in
  `apps/core` pass.

## Files you OWN

- `apps/wayland-host/` (Cargo.toml, src/)
- `apps/wayland-host/PROTOCOL.md` if the protocol changes
- the Nix profile or install step that brings Xwayland
- `apps/core/src/modules/linux-windows/` where X11 windows need it
