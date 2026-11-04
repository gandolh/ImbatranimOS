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
