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
