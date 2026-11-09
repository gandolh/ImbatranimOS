# Vendored crates

## smithay

`smithay/` is smithay 0.7.0 as published on crates.io (upstream commit
`a166cf4c94b5aedc332a65aa1dd753e8148829c3`), with one change in
`src/xwayland/xwm/mod.rs`: when an outgoing selection transfer becomes
incremental (INCR, over 64 KiB), the window manager first adds
`PropertyChange` to its event mask on the requestor window
(`watch_requestor_properties`). Before, it saw the requestor's property
deletes only on windows it manages, so a paste into an app that asks from a
child window (xterm's VT100 widget) stalled after the first chunk. A
requestor window that is already gone aborts the transfer.

Removed from the published crate: its CI workflow, `Cargo.lock`,
`.gitignore`, `Cargo.toml.orig` and the registry's marker files. Nothing
else differs.

Drop the directory and the `[patch.crates-io]` entry in `../Cargo.toml` once
a smithay release selects `PropertyChange` on the requestor for INCR
transfers. smithay master still lacked it on 2026-11-09.
