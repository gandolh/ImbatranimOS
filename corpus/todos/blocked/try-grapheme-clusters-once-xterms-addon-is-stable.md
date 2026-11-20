---
title: Try grapheme clusters in the Terminal once xterm's addon is stable
created: 2026-11-20
status: open
blocked-by: @xterm/addon-unicode-graphemes drops its experimental warning
tags: [terminal, later]
---

# Try grapheme clusters in the Terminal once xterm's addon is stable

From the 2026-11-20 research
([research-ghostty.md](../../wiki/research-ghostty.md)).

The Terminal measures cell widths with xterm.js's Unicode 11 table
(`Terminal.tsx`, the `Unicode11Addon` comment explains why a wrong width
corrupts the grid). Ghostty 1.3 moved to Unicode 17 with full grapheme
clustering, so an emoji with a skin tone or a family sequence is one unit for
the cursor and selection. xterm.js has `@xterm/addon-unicode-graphemes`
(0.4.0 on 2026-11-20), but its own description says it is experimental and
may behave in non-standard ways.

When the warning goes: compare it with Unicode 11 on a fixed text file (ZWJ
families, skin tones, flags, Devanagari, CJK) by where the cursor lands and
what a selection copies, in the Terminal and in bash's line editor, and adopt
it only if nothing regresses.
