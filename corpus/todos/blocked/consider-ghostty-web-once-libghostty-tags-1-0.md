---
title: Consider ghostty-web for the Terminal once libghostty tags 1.0
created: 2026-11-20
status: open
blocked-by: libghostty tags 1.0 and ghostty-web builds on it
tags: [terminal, later]
---

# Consider ghostty-web for the Terminal once libghostty tags 1.0

From the 2026-11-20 research
([research-ghostty.md](../../wiki/research-ghostty.md#ghostty-web-watch-dont-adopt)).

ghostty-web puts Ghostty's terminal core, compiled to WebAssembly (about
400 KB), behind an xterm.js-compatible API. On 2026-11-20 its last stable
release was 0.4.0 (2025-12-09); it drew with Canvas 2D, shipped only a fit
addon and had no search, which the Terminal uses. Its README says it will
move to the official libghostty WebAssembly build once there is one, and
Ghostty's 1.4 notes promise a libghostty 1.0 before Ghostty 1.5 (March 2027).

When both have happened, check again: search, Unicode widths and complex
scripts, the APIs `Terminal.tsx` calls (`attachCustomKeyEventHandler`, live
`options.theme`, `unicode.activeVersion`, `modes`, `parser`), Android typing,
and the size against xterm.js plus its addons. Measure with brief 101's
runner before proposing a switch.
