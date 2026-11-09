---
title: X11 pastes over 64 KiB reach child windows
created: 2026-11-06
status: promoted
tags: [linux-apps, x11, clipboard, smithay]
---

# X11 pastes over 64 KiB reach child windows

Pasting more than 64 KiB into xterm stalls, because smithay 0.7's INCR transfer (the chunked path X uses for large selections) watches only top-level windows for the `PropertyNotify` that asks for the next chunk, and xterm receives on a child window. The owner accepted the limit on 2026-11-06 when brief 48 shipped, and asked for a fix in smithay.

**How it was found.** After the stale-paste fix, a 198,410 byte copy was read in full by `xclip`, but xterm got nothing. Bisecting by size: 60 KB arrived, 70 KB didn't. Small pastes and every other app tested are fine.

**The fix.** Make smithay's X11 window manager watch the child windows too. Carry it as a patch with `[patch.crates-io]` in the host's `Cargo.toml`, and report it upstream so the patch can go when a release has it.

Nothing else in the host changes; the paste writer deadline from brief 48 already keeps a stalled transfer from hanging the host.
