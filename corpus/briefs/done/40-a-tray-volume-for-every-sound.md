# Brief 40 — A tray volume for every sound

## Context

[real-os-gaps.md](../../wiki/real-os-gaps.md) rejected a global volume, mute
or mixer on 2026-07-31 because the media player's own `<audio>` was the only
sound, and said to revisit "when a second sound source exists". Brief 39 adds
one: Linux apps' sound. On 2026-11-04 the owner chose a **full tray volume**:
one slider and a mute over all of the OS's sound. Recorded in
[decisions-linux-apps-built.md](../../wiki/decisions-linux-apps-built.md).

## Spec

1. A speaker icon in the tray opens a small panel with a volume slider
   (0-100) and a mute toggle. The icon shows muted and roughly how loud.
2. The level and mute are a user preference that survives a reload.
3. The setting reaches every sound source:
   - the media player add-on, through the system handle (a read and a
     subscribe, so it follows changes live); its own player volume still
     works and multiplies with the tray's;
   - the Linux sound stream from brief 39, applied in the tab's Web Audio
     gain.
4. The add-on contract documents the new system call; add-ons that make no
   sound need nothing.

## Must preserve

- The media player's own controls.
- Win7-classic tray layout and the current themes' look for the panel.

## Acceptance

- Moving the slider changes the media player's loudness and a Linux app's
  loudness together; mute silences both; a reload keeps both settings.
- Tests for the preference and the system call pass.

## Files you OWN

- `apps/core/src/shared/components/taskbar/` (the tray icon and panel)
- `apps/core/src/system/` and `apps/core/src/contract.ts` (the volume call)
- `apps/add-ons/media-player/` (applying it)
- `apps/core/src/modules/linux-windows/` (the gain on the Linux stream)

Runs after 39.

## Outcome (2026-11-06)

Done in `d3da0e7` (1.168.0). Ready for deploy on the board.

1. **The tray.** A speaker between the CPU text and the bell opens a small
   panel: a mute button, a 0-100 slider (focused on open, so the arrow and
   Page keys work) and the number. The icon shows muted, silent at 0, low
   below 50 and high above. The panel uses the bell's popup tokens and the
   media player's slider, checked in Apricot light and Classic dark.
2. **The preference.** `soundStore` keeps `volume` (0 to 1, a media
   element's scale; the tray shows it as 0-100) and `muted` in a dotfile,
   `imbatranimos:sound`, listed in `DOTFILE_KEYS` and rehydrated on sign-in,
   so a reload or another browser keeps both. Raising the level unmutes, as
   on Windows.
3. **The system call** lives in the kit's `packages/ui/src/system.ts`, where
   the handle is specified (the brief named `contract.ts`, which holds the
   add-on manifest). `system.sound.get()` returns `{ volume, muted }` and
   `on('sound-changed', ...)` follows it. Read-only: the tray is the one
   place it changes, and no app can turn the OS down. Optional on the
   handle, like `server`, so a kit app built against it still runs on an
   older desktop: the kit goes to 1.3.0; `PROTOCOL_VERSION` and
   `SHARED_KIT_VERSION` stay. `useSystemSound()` reads it live and gives
   full volume when it is missing. `scopeHandle` lets it through for every
   marketplace app without a capability. Documented in `system.ts`,
   `docs/adding-an-app.md` and `marketplace/README.md`.
4. **The media player** keeps its own volume and mute as React state and
   gives the element the product with the OS volume (silent when either is
   muted). It no longer reads the element back on `volumechange`: that
   would have saved the product as the player's own volume and turned the
   player's mute on with the tray's.
5. **Linux apps' sound**: the connection follows the store and sets the
   tab's `GainNode` (0 while muted). `setVolume` glides over a 15 ms time
   constant, so dragging the slider while sound plays doesn't click.

**Decided myself**, and open to the owner:
- The volume is the owner's (a dotfile), not each browser's: muting on the
  phone mutes the desktop tab on its next load too.
- The slider is linear, the same scale as a media element's volume, so
  both sources move together. A perceptual (dB) curve would be a later
  change in one place.
- **Not covered**: sandboxed URL apps (their frame runtime, served by the
  backend, has no sound call; they hold `notify` only) and the Files
  preview pane, whose native `<audio controls>` keep their own volume.
  Neither was named in the spec; each would be a small brief.

**Checked:**
- `tsc` for core, the kit and the media player; eslint and prettier on the
  touched folders.
- vitest: core's stores, taskbar, system, `linux-windows`, `scopeHandle`,
  startup and associations (284 pass: the dotfile round trip and odd
  values, clamping and unmuting, `sound.get()` and `sound-changed` firing
  only on change, the tray's icon states, its slider and mute, the gain
  set before and during playback); the kit (41, `useSystemSound` live and
  without a `sound`); the media player (67, the product and the mutes).
- Walked in the dev container with headless Chrome: the tray at 40 put the
  media player's element at 0.4, and 0.2 with the player's own slider at
  half (its saved volume stayed 0.5); Firefox beeping on `/tmp/av.html`
  played through a gain of 0.4; mute muted both elements and took the gain
  to 0 while the player's own mute stayed off; a reload kept 40 and muted,
  with the server's dotfile the same; Page Up unmuted to 50 and the gain
  followed while sound played.

**Skipped:** a full cross-workspace run; `cargo test` (the host is
unchanged); listening on real speakers, Android and iPhone (headless
Chrome's audio is fake, so values were checked, not sound).

**Owner steps:** push imbatranim-office if it isn't pushed, then this repo,
then from vps-deploy `node cli.ts imbatranim-os all`. No image change. After
the deploy: play music in the media player and a video in Firefox, move the
tray slider and mute, and reload.
