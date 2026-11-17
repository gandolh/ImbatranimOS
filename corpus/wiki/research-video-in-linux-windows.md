---
summary: Measured 2026-11-17 for brief 89 - a 720p clip played in Firefox in a Linux window, one CPU, today's JPEG path against H.264 (openh264) and VP8 (libvpx). At the same look both codecs need under half of JPEG's bytes; H.264 and VP8 tie on bytes, quality and CPU, so VP8 ships (royalty-free from source). In the real pipeline VP8 sent 46% of JPEG's bytes a second for 75% of its host CPU. Method, numbers, and how to redo them.
updated: 2026-11-17
---

# Research: video in a Linux window as a video stream (2026-11-17)

Brief 89 asked whether a video playing in a Linux app's window should go to
the tab as a video stream instead of a JPEG per frame, and set the bar: ship
a codec only if it at least halves the bytes at no more host CPU than JPEG,
on one fixed clip, under the production cap (vps-deploy's `imbatranim-os`
stack: one CPU, 1 GiB). The answer is yes: VP8 passes, H.264 passes too and
ties with it, and the tie goes to VP8. These numbers are the reason the host
links libvpx ("lightweight is identity").

## The clip

ffmpeg's `testsrc2`, 1280×720, 30 frames a second, 20 s, encoded to WebM so
Firefox from Nix plays it with nothing extra:

```bash
ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=30 -t 20 -c:v libvpx-vp9 \
  -crf 15 -b:v 0 -deadline good -cpu-used 2 -row-mt 1 -pix_fmt yuv420p -an clip.webm
```

(ffmpeg 4.4.2; the file's sha256 is
`314231890427a599af2e6d9783060827b75d0aa81535a4447de75df3e23a0255`.) It is synthetic:
flat colour bars, a moving band and noise squares, no camera grain. A film
costs every encoder more bytes, and a codec's lead over JPEG is usually
larger on real footage, not smaller; the decision here doesn't sit near the
line, so the synthetic clip is enough to make it.

## Two measurements

1. **Encoders alone, offline.** A small Rust program fed the clip's 600
   frames, decoded to RGBA by ffmpeg, to each encoder as the host would call
   it, in a container capped at one CPU and 1 GiB on the same laptop (AMD
   Ryzen 7 7735U). CPU is the encoding thread's CPU time per frame; quality
   is each stream decoded by ffmpeg and scored against the source frames,
   PSNR over RGB and SSIM over luma. JPEG is the host's own: `jpeg-encoder`
   0.7.1 at quality 80. H.264 is openh264 2.6 built from source with its
   assembly (the `openh264` crate 0.9.10), CBR, real time, one thread. VP8 is
   Alpine's libvpx 1.15.2, CBR, real time, one thread, no lag.
2. **The real pipeline.** Firefox 159 playing the clip at 1280×720, one
   pixel to one (the window maximized in a 1920×1080 headless Chrome tab), in
   the dev container `infrastructure-dev-1` with its CPU capped to one core
   (`cpu.max` 100000/100000). Bytes are counted in the tab, per encoding, on
   the `/api/wayland` socket; host CPU is the Wayland host process's
   `utime + stime` from `/proc/<pid>/stat`; both over the same 20 s window.
   The frame rate is whatever the pipeline reached (one frame in flight per
   window), so every row also gives the cost per frame.

The memory cap wasn't applied: Docker can't take a memory limit off a
container again without recreating it, and the dev container must not be
recreated. Memory doesn't change bytes or CPU here; the cgroup recorded no
pressure.

## Encoders alone (offline, 30 frames a second, one CPU)

| Encoder | Setting | Bytes a frame | kB/s at 30 fps | CPU ms a frame | PSNR (dB) | SSIM |
|---|---|---|---|---|---|---|
| JPEG | quality 80 (today) | 55 828 | 1 675 | 9.33 | 36.30 | 0.9942 |
| H.264 * | 4 000 kbit/s | 16 614 | 498 | 17.26 | 36.46 | 0.9933 |
| H.264 | 5 000 kbit/s | 20 757 | 623 | 9.59 | 38.87 | 0.9957 |
| H.264 * | 6 000 kbit/s | 24 888 | 747 | 15.51 | 38.14 | 0.9966 |
| VP8, speed −12 | 4 000 kbit/s | 16 580 | 497 | 9.11 | 37.14 | 0.9907 |
| VP8, speed −12 | 5 000 kbit/s | 20 728 | 622 | 10.08 | 39.38 | 0.9941 |
| VP8, speed −16 | 5 000 kbit/s | 20 731 | 622 | 9.73 | 39.82 | 0.9954 |
| VP8, speed −12 | 6 000 kbit/s | 24 873 | 746 | 9.57 | 41.22 | 0.9961 |

\* Rows with the `openh264` crate's own RGBA-to-YUV conversion, which costs about
9 ms a frame by itself and converts differently (lower PSNR at the same
bitrate). The 5 000 kbit/s row uses the same conversion as VP8, a 2×2-block
BT.601 one that costs 3.3 ms a frame on its own; the codecs' CPU column
includes it.

- At the same look as JPEG (PSNR and SSIM at least JPEG's), both codecs need
  about 20 kB a frame: 37% of JPEG's bytes.
- At that point H.264 and VP8 cost the same bytes, within a hair of the same
  quality (VP8 ahead on PSNR, H.264 on SSIM) and the same CPU, about JPEG's.
  That is a tie, and the brief's rule gives a tie to VP8: royalty-free built
  from source, which H.264 is not. VP8 is also in every WebCodecs and needs
  no platform codec in the tab.
- VP8's fastest real-time speed (−16) was no worse than −12 here, and it is
  the one the host uses.

## The real pipeline (Firefox, one CPU, 20 s windows)

Today's host (main before brief 89), JPEG:

| Run | Frames/s | kB/s | Bytes a frame | Host CPU | Host ms a frame | Firefox CPU |
|---|---|---|---|---|---|---|
| 1 | 21.5 | 1 094 | 50 852 | 33.3% | 15.5 | 23.4% |
| 2 | 22.0 | 1 119 | 50 850 | 33.0% | 15.0 | 22.8% |

The new host, the same session switched between a tab that decodes VP8 and
one that doesn't (WebCodecs hidden), alternating:

| Run | Path | Frames/s | kB/s | Bytes a frame | Host CPU | Host ms a frame | Firefox CPU |
|---|---|---|---|---|---|---|---|
| 1 | JPEG | 22.0 | 1 117 | 50 858 | 32.0% | 14.5 | 22.9% |
| 1 | VP8 | 24.1 | 521 | 21 626 | 25.8% | 10.7 | 25.1% |
| 2 | JPEG | 22.7 | 1 155 | 50 856 | 30.0% | 13.2 | 21.7% |
| 2 | VP8 | 25.1 | 503 | 20 049 | 21.3% | 8.5 | 22.0% |
| 3 | JPEG | 22.3 | 1 134 | 50 843 | 31.2% | 14.0 | 21.9% |
| 3 | VP8 | 25.0 | 529 | 21 182 | 23.0% | 9.2 | 23.1% |

On average VP8 sent **46% of JPEG's bytes a second** (518 against 1 135 kB/s)
at a slightly higher frame rate, 41% of its bytes a frame, for **75% of its
host CPU** (23.4% against 31.1% of a core). The host saves more CPU than the
encoders alone suggest: it no longer copies the region out for the JPEG
encoder, and it writes 600 kB/s less to the socket. Two earlier VP8 runs,
before the alternating set, read 441 kB/s at 27.0% and 399 kB/s at 32.2%
(18 frames/s, while Firefox took 36% of the core); the machine is shared, and
the alternating set is the fair comparison.

The bitrate the host asks for is 0.2 bits a pixel each frame at the frame
rate it gets (the offline equal-look point was 0.18, plus room for camera
grain), so a 1280×720 video at 25 frames a second targets about 4.6 Mbit/s,
and libvpx's CBR came in under it.

## Redoing it

The clip command is above. The offline encoder program and the pipeline
scripts (tab-side counter, `/proc` sampler, the WebCodecs switch) were
scratch work, not kept in the repo; the method above is enough to rebuild
them. To compare on the VPS, measure the host process the same way there:
its vCPU is likely slower than the laptop core, which raises every CPU
column but not the ratio.
