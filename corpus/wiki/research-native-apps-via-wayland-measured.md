---
summary: Measurements (2026-11-06) behind research-native-apps-via-wayland.md's "no". Keystroke to frame for xterm, Firefox's address bar and LibreOffice Writer is 20-42 ms locally, 122-141 ms with 50 ms added each way and 223-242 ms with 100 ms, against 9-12 ms for Notepad's textarea throughout. Memory per streamed app is xterm with Xwayland 20 MiB, Writer 306 MiB and Firefox 547 MiB PSS, and the tab costs about the same for either kind. An emulated Android tap confirms that the on-screen keyboard can't type into a Linux window. The "no" stands, narrowed to apps that are typed into or large. Method, tables, what was emulated, and the owner's two-minute phone check.
updated: 2026-11-06
---

# Measured 2026-11-06: what the "no" rests on

[research-native-apps-via-wayland.md](research-native-apps-via-wayland.md)
inferred three claims: a streamed keystroke waits on the link, the server
can't carry many streamed apps, and Android's keyboard can't type into a
Linux window. All three were measured here on the dev container, on the
laptop. No real phone, real 4G link or VPS cap was used, and the tables say
which inputs were emulated.

## Setup

- **The machine.** The dev container on Docker Desktop, uncapped. Its
  source matched main as of brief 31, the last code commit, and it wasn't
  rebuilt. Vite and Nest watch run inside it, so its empty desktop is
  1,023 MiB `memory.current` and 721 MiB anon, not the production image's
  388 and 67 MiB. Compare deltas, not totals.
- **The tab.** Headless Chrome, driven over raw CDP from a Node script. It
  reached the dev container through a socat relay container and a small Node
  TCP proxy on the laptop. Chrome's `--host-resolver-rules` pointed the
  desktop's address at the proxy, so the Origin stayed the desktop's own.
- **The phone link, emulated.** The proxy holds every chunk 50 or 100 ms in
  each direction, which is 100 or 200 ms of round trip, a usual 4G range.
  The delay is fixed: no jitter, no loss, no bandwidth cap. `tc netem` wasn't
  possible because the container has no `NET_ADMIN`.
- **The clock.** A script injected before the desktop loaded timestamped
  everything on the page's own clock: the keydown (capture phase), the `key`
  message leaving on `/api/wayland`, each binary frame message with its
  toplevel id, and the canvas draw after it. For Notepad it timestamped the
  keydown, the `input` event, and the animation frame after it.
- **The keys.** CDP `Input.dispatchKeyEvent` with a `code`, letters a-z,
  after a real mouse click in the window. 50 keys per run, each one after the
  window had sent no frame for a while (below).

## 1. Keystroke to pixels

Median / 95th percentile in ms, 50 keys each, from the keydown to the first
frame message for that window:

| Where the key goes | Local | +50 ms each way | +100 ms each way |
|---|---|---|---|
| xterm 410 (X11, through Xwayland) | 20 / 39 | 124 / 140 | 224 / 245 |
| Firefox 159, the address bar (Wayland, GTK 3) | 42 / 56 | 141 / 164 | 242 / 264 |
| LibreOffice Writer 25.8.5.2 (GTK 3), a blank page | 20 / 37 | 122 / 140 | 223 / 236 |
| Notepad's textarea (kit app), to the animation frame after `input` | 10 / 19 | 9 / 19 | 12 / 26 |

- The streamed numbers stop when the frame message arrives, before decoding,
  drawing and painting. Decoding and drawing added a median of 1.3 ms for
  xterm and 8.8 ms for Firefox, so the gap to Notepad is slightly larger
  than the table shows.
- Where the time goes for xterm, locally: 0.2 ms from keydown to the `key`
  message, then 20 ms to the frame. That is the app's redraw plus the host's
  tick (at most one frame every 33 ms). With delay, the round trip is added
  exactly: 100 ms more at +50, 200 ms more at +100. The kit field doesn't
  move, because typing never leaves the tab.
- One typed character's frame: xterm about 126 bytes, Writer about 1 KB,
  Firefox 17-90 KB, because the suggestions panel redraws with it.
- **Confounds.** Firefox's caret blinks (one frame every 1.3 s). So Firefox
  ran a second copy with a throwaway profile (`ui.caretBlinkTime` 0), and
  each key waited for 700 ms with no frames. An earlier Firefox run waited
  only 250 ms and counted late suggestion redraws as answers (samples under
  the round trip). It is left out. Writer's caret blinks every 0.6 s in
  112-114-byte frames, so those frames were ignored and each Writer key
  waited for 1 s with no larger frame. xterm doesn't blink.

**Reading.** Locally, 20-42 ms is below what a typist notices. Over a phone
link, every key echoes one round trip later: 120-245 ms here. A kit field
stays at 10-12 ms, because it only reaches the server to save.

## 2. Memory and CPU

PSS and RSS are summed over each app's processes from `smaps_rollup`. CPU is
from `/proc/<pid>/stat` over 5 s, as a share of one laptop core.

| App, in the container | Processes | PSS (RSS) | Container anon over the empty desktop | CPU idle | CPU busy |
|---|---|---|---|---|---|
| xterm, with the Xwayland it starts | 2 | 6 + 14 MiB (7 + 16) | +1 MiB | 0% | Typing 8 keys/s: xterm 0.2%, Xwayland 0.2%, host 0.6% |
| LibreOffice Writer, blank document | 2 | 306 MiB (321) | +201 MiB | 0% | Typing 8 keys/s: 3.6%, host 1.2% |
| Firefox, the new tab page, the dev profile | 11 | 547 MiB (1,058) | +375 MiB | 0-1.8% | Scrolling `about:license` (a wheel notch every 50 ms): Firefox 25%, host 28%, backend 10% relaying frames; 21 frames/s, 2.8 MB/s on the socket |

The Wayland host itself was 4-5 MiB PSS with no window or only xterm open,
and 15 MiB with Firefox or Writer.

The tab, in headless Chrome after a forced garbage collection: JS heap from
`Performance.getMetrics`, and the PSS of Chrome's renderer and GPU processes:

| Tab state | JS heap | DOM nodes | Renderer PSS | GPU process PSS |
|---|---|---|---|---|
| Desktop, no windows | 26.3 MiB | 383 | 215 MiB | 46 MiB |
| Notepad: two windows, a 43-character note | 27.2 MiB | 536 | 224 MiB | 44 MiB |
| Those two and xterm (484×316) | 27.4 MiB | 573 | 226 MiB | 44 MiB |
| Firefox alone (1204×510) | 27.1 MiB | 416 | 234 MiB | 48 MiB |
| Writer alone (1485×750) | 28.5 MiB | 415 | 258 MiB | 52 MiB |

**Reading.** In the tab, either kind costs under 45 MiB, and a streamed
window's cost grows with its canvas. The real cost lands on the server: about
20 MiB for a small tool like xterm, 0.3-0.55 GiB for an office program or a
browser, and nothing for a kit app.

**LibreOffice through the pane.** Settings → Linux apps installed
`libreoffice` in about 2.5 minutes on the laptop's link. It is the GTK 3
build: the program folder holds `libvclplug_gtk3lo.so` and no Qt plug-in.
With Firefox, xterm, Xwayland and LibreOffice installed, the store is
3.8 GB. Writer's first window had a black band along its right and bottom
edges inside the OS window. It was seen once and not looked into.

**Under the VPS cap: not measured yet (2026-11-06).** From the separate
readings, anon memory would be 67 MiB for production at rest, 590 MiB for
Firefox idle and about 201 MiB for Writer (a dev figure), so about 860 MiB of
the 1,024 before any file cache.

## 3. The phone keyboard

**The code.** `LinuxWindowBody.tsx` draws a `div` with `tabIndex` 0 and the
canvas inside it. There is no input, textarea or `contenteditable` element.
A keydown becomes an evdev code from `KeyboardEvent.code` (`keymap.ts`), and
a key whose code isn't in the table is dropped. Android's Chrome raises the
on-screen keyboard only when an editable element takes focus. Gboard's
keydowns carry keyCode 229, key `Unidentified` and an empty `code`.

**Emulated** in headless Chrome: a 412×915 viewport at DPR 2.625, mobile,
touch emulation on, and an Android user agent. The desktop switched to its
phone layout, and xterm's window filled the width. A probe in xterm,
`stty -icanon; cat > file`, recorded whatever reached the app.

| Input | What the tab saw | `key` messages | Reached xterm |
|---|---|---|---|
| A tap on the window | `pointerdown` from touch; focus on the `div` "Linux app window", not editable, nothing editable inside | – | – |
| `Input.insertText` "abc" (a keyboard committing a word) | `beforeinput` "abc" on the `div` | 0 | no |
| `Input.imeSetComposition` "d", "de", then commit | `beforeinput` "de", and no composition events | 0 | no |
| Gboard's keydown: key `Unidentified`, code "", keyCode 229 | the keydown | 0 | no |
| Backspace and Enter with an empty code | the keydowns | 0 | no |
| Control: a key with code `KeyZ` (a hardware keyboard paired with the phone) | the keydown | 2 | yes, "z" |
| Control: the same tap and text on Notepad's textarea | focus on the `textarea` | – | the field held "abcde" |

**Verdict: confirmed in emulation.** Nothing the tap focuses can raise the
keyboard, and the text a soft keyboard sends would be dropped even if a
keyboard were up. A Bluetooth keyboard works. This is a bug in Linux apps
whatever the answer to the research question: Firefox on the owner's phone
can't be typed into. Todo:
[linux-apps-take-the-phones-keyboard](../todos/linux-apps-take-the-phones-keyboard.md).

**The real-phone check (the owner's, two minutes):**

1. Start the dev container on the laptop.
2. On the Android phone, on the same network, open the dev desktop at the
   laptop's address on port 5173 and sign in. Windows may ask to let the
   port through its firewall.
3. Open XTerm or Firefox from Start on the phone (a Linux app belongs to the
   tab that starts it), and tap inside its window. Today no keyboard should
   come up.
4. Tap Notepad's text area: the keyboard comes up. Switch back to the Linux
   window and type: nothing should arrive.
5. Write what happened in the todo.

## What changes

- **Latency: measured, and the claim stands.** Locally, a streamed key costs
  20-42 ms. Over a phone link it costs the round trip on every key: 120-245 ms
  in emulation, against about 10 ms for a kit field.
- **Memory: the claim narrows.** It holds for browser- and office-class
  programs (Firefox 547 MiB, Writer 306 MiB PSS), not for small native tools
  (xterm with Xwayland is 20 MiB and under 1% of a core while typing).
- **The phone keyboard: confirmed in emulation**, and filed as a bug.
- **The recommendation stands, narrowed.** The OS's own apps and the suite
  stay kit apps, because they are typed into, and from the phone. A Linux
  app is fine as an optional install. A small tool costs the server little.
  A big program costs a third to a half of the cap, wherever it is used.

Not measured yet (2026-11-06): the VPS under its cap with Firefox and Writer
together, a real phone, a real 4G link (jitter, loss, and whether 2.8 MB/s of
scrolling fits, or flow control drops frames), scrolling over the delayed
link, HiDPI, and a Qt app.
