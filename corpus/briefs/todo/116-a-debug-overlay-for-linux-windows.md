# Brief 116: A debug overlay for Linux windows

**Depends on:** nothing. **Runs after:** 115.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-20 from [research-ghostty.md](../../wiki/research-ghostty.md), item 9.

## Context

- Ghostty's inspector is devtools for the terminal, and Ghostty 1.3 added an
  overlay that paints the OSC 133 regions; shell developers used it to fix
  their integrations.
- Every streamed frame already says, per rectangle, where it goes, how it is
  encoded (1 deflate, 2 lossless WebP, 3 JPEG, 4 VP8) and how many bytes it
  is (`apps/wayland-host/PROTOCOL.md`; parsed in
  `apps/core/src/modules/linux-windows/frames.ts`, `parseFrame`). So an
  overlay needs nothing from the host.
- Brief 89 and the native-apps research measured with scripts, `/proc` reads
  and counters added by hand. Briefs 113-115 will measure again.

## Decisions

1. **A switch in Settings → Linux apps**, "Show stream stats", off by default,
   kept per machine in `localStorage`.
2. **When on**, each Linux window draws, above its canvas and ignoring the
   pointer: each rectangle's outline for 500 ms, coloured by encoding (one
   colour per encoding, from the theme's tokens, with a legend); and a corner
   panel with frames per second, kB per second, the share of bytes per
   encoding, and the decode time per frame, over the last second.
3. Drawn only while the window is visible; nothing is measured while the
   switch is off.

## Files you OWN

- `apps/core/src/modules/linux-windows/` (a new overlay component, the
  frame-path hook that feeds it, tests), `apps/core/src/modules/settings/LinuxAppsSettings.tsx`.
- Corpus: `wiki/status-linux-apps-layer.md` (a line), `log.md`.

## What to do

1. Tests: the stats over a sequence of parsed frames (fps, kB/s, shares);
   switch off means the frame path does no extra work.
2. The overlay and the switch.
3. Walk it in the dev container in Apricot light and Classic dark: foot
   typing (small WebP rectangles), Firefox scrolling, the 720p clip (VP8 or
   JPEG with WebP around it). Shots, read.

## Acceptance

- [ ] The overlay shows encodings and stats per window and costs nothing when
  off.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.
