# Brief 83 — X11 pastes over 64 KiB reach child windows

## Context

Pasting more than about 64 KiB into xterm stalls and nothing arrives.
smithay 0.7's INCR transfer (the chunked path X uses for large selections)
watches only top-level windows for the `PropertyNotify` that asks for the
next chunk, and xterm receives on a child window. Found after brief 48's
stale-paste fix: a 198,410 byte copy was read in full by `xclip`, but xterm
got nothing; 60 KB arrived, 70 KB didn't. Small pastes and every other app
tested are fine. The owner accepted the limit on 2026-11-06 and asked for a
fix in smithay. Promoted from the todo
`x11-pastes-over-64-kib-reach-child-windows` in the 2026-11-09 backlog grill.

## Depends on

- brief 48 (the paste writer and its deadline).

## Owner decisions (settled 2026-11-09)

1. Promote it now, run after briefs 77 to 82.

## What to do

1. Patch smithay's X11 window manager so the INCR transfer also watches the
   requestor's child windows (or the requestor window itself, whatever the
   protocol needs). Carry it with `[patch.crates-io]` in
   `apps/wayland-host/Cargo.toml`, the patched crate vendored or pinned to a
   fork commit (say which and why).
2. Write the upstream report (issue or PR text) into the outcome note, ready
   for the owner to file, so the patch can go when a smithay release has it.
3. Nothing else in the host changes; brief 48's paste writer deadline stays.

## Files you OWN

- `apps/wayland-host/` (`Cargo.toml`, `Cargo.lock`, the patch), its tests
- `corpus/`

## Files you must NOT touch

- The clipboard bridge's TypeScript side.

## Acceptance

- A host test where it's practical (an INCR transfer to a child window).
- A walk in the dev container (host work, so it gets one): rebuild the host
  in the cached `rust:1.97-alpine` container, copy it in, then in xterm
  paste 70 KB and 200 KB copied from the desktop. Both arrive whole. A
  small paste still works, and Firefox still pastes.
- `cargo test` for the host passes.

## Progress (2026-11-09)

Built in `eb95780` (1.283.0); the walk in the dev container is next, then
the end move.

**Vendored, not pinned.** smithay master (`0378ba3`, 2026-11-09) still has the
bug: the window manager selects `PropertyChange` only in its `CreateNotify`
handler, which fires for children of the root, and its outgoing INCR code
never selects it on the requestor. No open issue or PR covers it (the only
INCR change since 0.7.0, PR 2130, is on the incoming side). With no upstream
commit to pin, the published 0.7.0 crate is vendored at
`apps/wayland-host/vendor/smithay` and carried by `[patch.crates-io]`
(path). `vendor/README.md` names the base (0.7.0, upstream `a166cf4c`), the
change, what was dropped from the crate (its CI workflow, lockfile,
`.gitignore`, registry markers) and when to remove it. `Cargo.lock` lost only
smithay's `source` and `checksum` lines. `infrastructure/Dockerfile` copies
`vendor/` into the host's build stage; `iso/Dockerfile` doesn't build the
host. As a path dependency smithay's own upstream warnings now show in the
build (unused imports, a function cast); they're harmless and left alone.

**The change.** In `read_selection_callback`, when an outgoing transfer
becomes incremental and before the `INCR` property is written, the new
`watch_requestor_properties` reads the WM's own event mask on the requestor
(`GetWindowAttributes`, `your_event_mask`) and, if `PropertyChange` is
missing, sets the mask with it added. Requests on one connection run in
order, so the selection is in place before the requestor can delete the
property. A requestor already gone (an X error on the reply) ends the
transfer the way a closed pipe does; a dead connection is the error it was.
No unwrap, no unsafe. Nothing else in the selection code changed, and the
host's own code didn't change: the paste writer's 5 s deadline still bounds a
stalled pipe (smithay reads the pipe into memory whatever the chunks do). The
child window stays watched after the transfer; the WM ignores its other
property changes (it looks them up among its managed windows and finds none).

**Tests.** `cargo test` passes (83 unit, 1 text-input). A host test of an
INCR transfer to a child window needs a running Xwayland, which the
`rust:1.97-alpine` test container doesn't have and the brief's walk does;
the walk is the test. Release binary sha256
`55befe8d187db15fbe9029517b23710e36533c842d1d1e05e054695049de43d0`.

**Upstream report, ready to file** (smithay issues, or as the PR body with
the diff from `vendor/smithay/src/xwayland/xwm/mod.rs`):

> **xwm: INCR selection transfers stall when the requestor is not a managed window**
>
> When an X11 client pastes a Wayland selection larger than 64 KiB, the
> transfer goes incremental (INCR). The requestor deletes the property to ask
> for each next chunk, and `X11Wm` waits for that `PropertyNotify`
> (`Property::DELETE`) on `request.requestor`. But the X server only sends it
> to clients that selected `PropertyChangeMask` on that window, and `X11Wm`
> selects it only in the `CreateNotify` handler, i.e. on direct children of
> the root. A requestor that is a child window never reports the delete, so
> the transfer stops after the INCR announcement and the client gets nothing.
>
> Reproduce: run `xterm` under Xwayland, set a Wayland selection of about
> 100 KB of text, paste it into xterm (Shift+Insert). Nothing arrives; 60 KB
> works. xterm's `SelectionRequest` comes from its VT100 widget window, a
> child of its top-level. `xclip -o -selection clipboard` (which uses a
> top-level window) gets the full text.
>
> Fix: before writing the `INCR` property, add `PropertyChange` to the WM's
> own event mask on the requestor:
>
> ```rust
> fn watch_requestor_properties(conn: &RustConnection, window: u32) -> Result<bool, ReplyOrIdError> {
>     let mask = match conn.get_window_attributes(window)?.reply() {
>         Ok(attrs) => attrs.your_event_mask,
>         Err(ReplyError::X11Error(_)) => return Ok(false), // requestor is gone
>         Err(ReplyError::ConnectionError(err)) => return Err(err.into()),
>     };
>     if !mask.contains(EventMask::PROPERTY_CHANGE) {
>         conn.change_window_attributes(
>             window,
>             &ChangeWindowAttributesAux::new().event_mask(mask | EventMask::PROPERTY_CHANGE),
>         )?;
>     }
>     Ok(true)
> }
> ```
>
> called in `read_selection_callback` where the transfer becomes incremental
> (`selection.rs` on master), aborting the transfer when it returns false.
> ORing into `your_event_mask` keeps whatever the WM already selected on
> managed windows (`FOCUS_CHANGE` on master). The mask is not restored when
> the transfer ends; extra `PropertyNotify` events from such a window fall
> through the handler harmlessly. Tested against smithay 0.7.0 with xterm
> (70 KB and 200 KB pastes).

The last sentence holds once the walk passes; drop it if it doesn't.
