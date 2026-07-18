# Brief 38 — Media player add-on (audio/video)

Status: **todo** · Promotes [media-player-addon](../../todos/media-player-addon.md).
Wave C. Medium → sonnet. New package `apps/add-ons/media-player/`. Controller
registers it in `openWith.ts`.

## Problem

Audio/video only plays inline in the preview pane — no player app with real
transport + a folder playlist/queue.

## Decisions (grilled 2026-07-18)

- **Native `<audio>`/`<video>`** with `src = downloadUrl(root, path)` from
  `@imbatranim/core`. The native element issues HTTP Range requests itself, so
  large files stream without loading into memory — this respects the
  file-content memory-cap posture (no `fetchFileBytes` for playback). (If the
  backend doesn't 206, the browser still falls back to a full GET; either way no
  app-level buffering.)
- **Transport**: custom bar (play/pause, seek scrubber bound to
  `currentTime`/`duration`, volume + mute, elapsed/total) over the media element
  with `controls` off — so it matches the OS chrome rather than the browser's.
  Keep it minimal and token-styled.
- **Playlist/queue from the folder**: same `listDir` approach as brief 37 (thin
  core-`api` `GET /files` call in-package; do NOT import the file-manager
  package). Filter to media extensions, name-sorted; prev/next track; auto-
  advance on `ended`.
- **Video vs audio**: one component; render `<video>` for video extensions,
  `<audio>` (with a poster/placeholder area) for audio.
- **Extensions** → `media-player` in `openWith.ts` (any root): audio
  `mp3 wav ogg oga flac m4a aac opus`, video `mp4 webm ogv mov m4v mkv`.
  Multi-instance OK.

## Fix

New package `apps/add-ons/media-player/` (add-on scaffold; deps
`@imbatranim/core` + `lucide-react`). `src/index.ts` manifest (`icon: PlayCircle`
or `Film`, lazy, `multiInstance: true`). `src/MediaPlayer.tsx` (intent → src,
transport, playlist), `src/api/listDir.ts` (core-`api` list + media filter +
kind detection). **Controller**: add the extensions + `openAppLabel` case in
`openWith.ts`.

## Must preserve (regression surface)

Preview-pane AV playback unchanged. `openWith.ts` edit additive. Element
listeners cleaned up on unmount/track change (no leaked media elements still
decoding). A codec the browser can't play surfaces the element's error, not a
crash.

## Verify bar

`turbo typecheck`, lint + format green, build ok (own lazy chunk).
**Human-gated:** open an audio and a video file from Files; play/pause/seek/
volume work; a folder with several tracks builds a queue and auto-advances;
seeking a large file doesn't stall the desktop (range streaming); unplayable
file errors gracefully.

## Invariants

Lightweight (native elements, no decode libs), identity locked, all bytes over
the authed download URL, memory-cap posture respected (stream, don't buffer).

## Out of scope

Transcoding, subtitles/captions, gapless/crossfade, EQ/visualizer, GPU
anything, format conversion.

## Outcome (2026-07-18) — Wave C commit `a7632ab`

Shipped. `apps/add-ons/media-player/`: native `<video>`/`<audio>` with
`src={downloadUrl(...)}` (element issues its own Range requests — no
`fetchFileBytes`, memory-cap posture respected). `TrackStage` keyed by path so
each track switch is a full remount (listeners torn down, no leaked decoding
media). Custom `TransportBar` (play/pause, seek, volume+mute, times; native
controls off). Folder queue via own `listDir` (media-filtered, name-sorted,
auto-advance on `ended`). Codec errors → overlay with "Download instead", no
crash; open-from-Files does not autoplay (queue navigation does). No new deps.
Own lazy chunk (4.00 KB gz). `multiInstance: true`. Registered
mp3/wav/ogg/oga/flac/m4a/aac/opus + mp4/webm/ogv/mov/m4v/mkv → media-player.
Human-gated playback/seek/queue check open.
