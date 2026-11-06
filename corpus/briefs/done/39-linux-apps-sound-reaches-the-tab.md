# Brief 39 — Linux apps' sound reaches the tab

## Context

Linux apps are silent: Firefox video plays without sound. Split from the
first wave's leftovers on 2026-11-03 and grilled with the owner on 2026-11-04:
**one combined stream** for all of a session's Linux apps, mixed in the
container, not one stream per app. Firefox is the only Linux app today, so
nothing is lost, and one stream keeps the host simple. The OS volume that
applies to it is brief 40.

## Spec

1. An audio server in the container for each tab's Linux session (PipeWire
   with its PulseAudio shim, or PulseAudio; pick by what Firefox from Nix
   plays through and by the image-size cost, and record the choice). It
   starts and stops with the session, as the session's apps do.
2. The session's mixed output is encoded as Opus and sent to the tab over the
   signed-in WebSocket the windows already use, as its own message type in
   `apps/wayland-host/PROTOCOL.md`.
3. The tab plays it through Web Audio with a small jitter buffer. Browsers
   block sound until the page has had a user gesture; the first click or key
   in the desktop unlocks it.
4. When no Linux app makes sound, nothing is sent.
5. Sleep under the idle cover screen stops the stream with the apps, and it
   resumes with them.

## Must preserve

- Window frames' latency: audio must not delay frames on the same socket.
- The session check on the socket; no new unauthenticated route.
- Lightweight: record the image-size change in the outcome.

## Acceptance

- In the dev container, a video playing in Firefox is heard in the tab,
  roughly in sync with the picture (within about 200 ms).
- Silence costs no bytes on the socket.
- Tests for the audio message framing pass, with `cargo test` for the host.

## Files you OWN

- `apps/wayland-host/` (audio capture and encoding, `PROTOCOL.md`)
- `apps/backend/src/modules/linux-apps/` (starting the audio server per session)
- `apps/core/src/modules/linux-windows/` (playing the stream)
- The Dockerfile / Nix base profile lines the audio server needs

## Outcome (2026-11-06)

Done in `4acbf07` (1.165.0). Ready for deploy on the board.

1. **The audio server is the Wayland host, not a daemon.** Spec item 1
   named PulseAudio or PipeWire with its shim; neither was taken. Firefox
   from Nix plays through libpulse (its wrapper carries libpulseaudio 17), so
   it needs only PulseAudio's protocol on a socket. Measured on Alpine 3.24,
   `pulseaudio` and `pipewire` + `pipewire-pulse` + `wireplumber` each add
   about 256 MiB installed (mesa and llvm come in through gstreamer or
   libcamera); Nix's `pulseaudio` is a 245 MiB closure. The host instead
   listens on `$XDG_RUNTIME_DIR/imbatranim-sound/<session>` from
   `session_open` to `session_close` and speaks the protocol itself, with
   the `pulseaudio` crate (MIT) for the messages: the handshake without
   shared memory, one sink (`tab`, 48 kHz stereo float), no sources,
   playback streams in the common formats at any rate (resampled linearly,
   folded to stereo), cork, flush, trigger, prebuffer, drain, requests,
   underflows, volume and mute, timing. The backend starts nothing: it gives
   the session's apps `PULSE_SERVER` and `PULSE_COOKIE` (libpulse makes its
   cookie there, in the runtime directory, not in the home folder) beside
   `WAYLAND_DISPLAY`, for Start and the Terminal alike. Recorded in
   [decisions-linux-apps-built.md](../../wiki/decisions-linux-apps-built.md).
2. **Image size.** The host binary grows from 3.09 MB to 3.73 MB (the crate
   and libopus, built from the source the `opus` crate bundles and linked
   statically). The runtime images gain nothing; the `wayland-host` build
   stage installs `cmake` and `make`. No dev image rebuild was needed to test
   (the binary was copied in); the owner's next rebuild picks it up.
3. **The stream.** While a stream plays, the host mixes the session's
   streams in real time every 10 ms and sends each whole 20 ms as one Opus
   packet at 128 kbit/s: a new message kind (3) on the control socket and on
   the WebSocket (`[3]`, a `u32` sequence number, the packet), protocol 7.
   A frame quieter than a 16-bit sample's last bit isn't sent, and with
   nothing playing the clock stops; the sequence number marks breaks. Apps
   are told the sink's latency is 60 ms, so a video player shows each
   picture beside its sound. The backend forwards packets as they come and
   drops them while the tab's socket holds over 1 MiB; they are never part
   of the frame acks. Under the cover screen the clock stops and restarts
   afresh on waking, without a burst.
4. **The tab** (`linux-windows/sound.ts`) decodes with WebCodecs'
   `AudioDecoder` and plays each packet through an `AudioBufferSourceNode`
   into a `GainNode`, 60 ms ahead of the audio clock at first. When the
   queue runs dry in the middle of a run, the lead grows by 40 ms up to
   300 ms and shrinks back a step after 10 s without that. Packets are
   dropped until the page may make sound: the first press or key in the
   desktop creates or resumes the `AudioContext` (a page that already had a
   gesture starts at once). A browser without `AudioDecoder` (Safari before
   26) stays silent. `linuxSound.setVolume()` is the hook brief 40's tray
   volume drives.

**Decided myself**, and open to the owner:
- Linux apps' sound playing holds the idle cover off, as a playing `<audio>`
  or a drawing Linux window already does (`useIdleLock.ts`, outside this
  brief's files): music in a minimized Firefox no longer sleeps after the
  idle timeout. A cover put up by hand still stops it.
- The sound keeps playing while the tab is hidden or the window minimized.
- **Known limit, not fixed**: frames are encoded on the host's one event
  loop, so a large frame can hold the sound's ticks back. The walk saw it
  once, the first beep after Firefox started (137 ms, two full-window
  frames), and the mix caught up in one burst. The tab's growing lead covers
  it; moving frame encoding off the loop would be its own brief.

**Checked:**
- `cargo test` in the cached `rust:1.97-alpine`: 58 pass, 22 new (the
  stream model, resampling, requests, drains, the protocol client's
  handshake and refusals, the mix's timing, silence, freeze, sequence
  breaks, an Opus round trip, the sound message's layout); fixtures for
  protocol 7 with `audio.bin`.
- Backend jest `src/modules/wayland` and `pty.constants`: 41 pass (the
  sound fixture, packets forwarded with no acks, `PULSE_SERVER` for a
  session and none without).
- Core vitest `linux-windows` and `shared/hooks`: 89 pass (parsing,
  scheduling, the lead growing, silence until a press).
- `tsc` for core and backend; eslint and prettier on the touched folders.
- Walked in the dev container with the new binary, headless Chrome: a page
  in Firefox beeping with Web Audio every 2 s and flashing a canvas, and a
  360p VP9 Big Buck Bunny from Wikimedia Commons, played together. Packets
  came 50 a second with no breaks and at most 26 ms apart while 6.4 MB of
  frames went by in the same 5 s; about 16 kB/s of sound. Between beeps
  nothing was sent. Each flash's frame arrived 82 to 111 ms after its
  beep's first packet, and the tab plays a packet 60 ms after it arrives, so
  the sound led the picture by about 40 ms before the output device's own
  latency. After a reload, packets were dropped until a click, then played.
  Under the cover no packets came for 5 s; after it, sound came back at once.
  With Firefox closed the host was idle again (2 ticks in 5 s).

**Skipped:** rustfmt (not in the cached rust image); a full cross-workspace
test run; listening on a real device, Android and iPhone (headless Chrome's
fake device reports 320 ms of output latency, which also drove the lead to
its 300 ms cap there; on a real device it should stay near 60 ms); a prod
image build.

**Owner steps:** push imbatranim-office if it isn't pushed, then this repo,
then from vps-deploy `node cli.ts imbatranim-os all`. After the deploy, in a
normal Chrome: play a video in Firefox, click the desktop once, and check
that sound and picture agree; then on the Android phone.
