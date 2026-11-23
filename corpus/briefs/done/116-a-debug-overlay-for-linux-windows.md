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

## Outcome (2026-11-23)

Built in `4d58ba2` (1.417.0).

- **`streamStats.ts`**: the switch (a small zustand store over `localStorage`
  `imbatranimos:linux-stream-stats`; turning it off forgets everything recorded), and per toplevel the
  samples of the last second and the rectangles of the last 500 ms. `summarize` gives frames a second, kB a
  second, each encoding's share of the bytes and the mean decode time.
- **The frame path** (`connection.ts`) reads the switch once per frame; only while it is on does it time the
  paint (decode and draw) and record the frame, in a `finally` so a frame that came counts painted or not. A
  destroyed toplevel's numbers go with it.
- **`StreamStatsOverlay`**, inside the Linux window's body above its canvas, `pointer-events-none`: outlines
  in `border-primary` (WebP), `border-secondary` (VP8), `border-error` (JPEG) and `border-tertiary`
  (deflate), placed by the window's scale and geometry offset; a corner panel in the inverse-surface tokens
  with the numbers and a legend. It redraws four times a second while the switch is on and the window shows,
  and renders nothing otherwise.

**Tests:** the numbers over a sequence of frames (24 fps, 96 kB/s, 75/25 shares, decode time), forgetting past
a second and the 500 ms outlines, an empty window; the switch's storage and its forgetting; the frame path
records nothing with the switch off and each frame with it on; the Settings checkbox turns it on and off.

**The walk ran outside Docker** (the daemon is down), with the release-built host, foot 1.16 and mpv 0.37
(`--vo=wlshm`, brief 89's clip at 960×540) on the host, in Apricot light and Classic dark at 1600 by 1000.
foot typing: about 12 to 16 fps of small WebP rectangles, 1 to 2 kB/s, outlined round the typed letters;
`seq 1 200000` scrolling: 73 to 75 kB/s, WebP 73 to 77% and VP8 23 to 27%; the clip: 26 to 27 fps, 322 to 336
kB/s, VP8 100%, decode 3.5 ms. Firefox scrolling wasn't walked (no Firefox here). The switch was set through
`localStorage`: Settings' Linux apps pane says "not available" on a machine without Nix, so the checkbox is
covered by its test, not the walk. The dev-container walk is the owner's, with the deploy.

`npm run check` exit 0; `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's. Owner step: `node cli.ts imbatranim-os server`.
