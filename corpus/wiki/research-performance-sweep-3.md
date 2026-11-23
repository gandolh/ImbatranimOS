---
summary: Rounds 11-15 of the 2026-11-23 performance sweep in full. Round 11 found the Linux window relay and the tab's frame drawing already lean (measured, left), and made Files fast on large folders - a 20,000-entry listing 630 to 165 ms and a folder's size 820 to 70 ms - by stating entries synchronously in batches instead of one promise each. Round 12 joins a Terminal's flowing output into one WebSocket frame per 5 ms - a 25 MB cat 19,854 frames to 249, 2.7 to 2.1 s - with keystroke echo unchanged.
updated: 2026-11-23
---

# The performance sweep, rounds 11-15

The sweep's method and the list of rounds are on [research-performance-sweep.md](research-performance-sweep.md).

## Round 11 (2026-11-23): Linux window frames end to end, and Files on a large folder

**The frame path, measured and left.** `weston-simple-shm` (a 250 by 250 window redrawn every frame, sent as VP8)
for 10 s: the host 3.6% of a core, the tab's main thread 3.6%, the backend 1.2%. A CPU profile of each: the
backend's JavaScript relaying a frame is about 0.1 ms (the rest of its share is socket I/O in the kernel); the tab's
JavaScript per frame is under 0.1 ms, and its main-thread time is the browser drawing the decoded frame
(`drawImage`, about 0.3 ms in software, on the GPU in a browser that has one). Nothing to cut there. The image's
base (`node:alpine`, 173 MB, 127 MB of it the node binary) was also looked at: its removable parts (headers, Yarn,
13 MB) can't shrink a layer the image builds on.

**Files on a large folder.** Listing 20,000 files: 4.3 MB of JSON in 600 to 690 ms and 840 to 1,050 ms of backend CPU.
A CPU profile put most of it in `lstat`: one `fs/promises.lstat` per entry, all at once. A warm `lstat` is a
microsecond's syscall; the promise and the thread pool around each cost about twenty times that (20,000 stats: 495 ms
of CPU with promises, 210 with callbacks, 25 in a synchronous loop).

| A 20,000-file folder, four runs | Before | After |
|---|---:|---:|
| Listing: wall / backend CPU | 595-685 / 840-1,050 ms | 151-176 / 160-240 ms |
| Folder size: wall / backend CPU | 798-838 / 770-790 ms | 66-74 / 60-100 ms |
| A 200-file folder's listing | | 4 ms |

- **Listings stat in synchronous batches of 256** and yield to the event loop between them (`STAT_BATCH`), and work
  out each entry's path from the folder's once. The responses for the large folder, a small one with a broken
  symlink and a symlink to a folder, and the notes folder were byte-identical between the builds.
- **The size walk stats synchronously too**, yielding every 256 entries: it had awaited one `lstat` per file in turn,
  so a large tree used its time budget waiting.

**Looked at and left in round 11:** the listing's 214 bytes an entry (its fields are the `system.fs` contract), and
compressing API responses in the backend (Caddy compresses them in the deploy, and on the box itself it would only
cost CPU). The search walk reads directory entries without a stat each, and its content grep needs real reads.

## Round 12 (2026-11-23): a Terminal's output on its way to the tab

**What it was.** Every read of a pty went out as its own WebSocket frame. A pty hands over a few KiB per read, so
output in bulk was thousands of small frames: a 25 MB `cat` about 20,000, each one a `send`, a TLS record through
Caddy, a message event in the tab and a `write` into xterm. Joining a read's chunks until the next turn of the event
loop (`setImmediate`) changed nothing: the backend reads one chunk per turn, as fast as the pty refills.

**What changed.** Output that follows a send within 5 ms (`OUTPUT_JOIN_MS`) goes in the next frame. The first chunk
after a quiet spell still goes at once, so an echoed keystroke never waits; that is the one difference from VS Code,
whose terminals join their output for 5 ms from the first chunk (`TerminalDataBufferer`). What is waiting is sent
before the exit notice, and dropped on a detach, where the ring already holds it.

| Three workloads in a real Terminal, median of 3 | Before | After |
|---|---:|---:|
| `cat` of 25 MB: frames / wall / tab main thread | 19,854 / 2,698 / 2,106 ms | 249 / 2,059 / 1,716 ms |
| The same through Caddy with TLS: wall / tab / Caddy CPU | 2,907 / 2,244 / 100 ms | 2,235 / 1,850 / 30 ms |
| `seq 1 200000`: frames / wall | 1,633 / 368 ms | 26 / 260 ms |
| 5,000 `echo` lines: frames / wall | 209 / 177 ms | 23 / 184 ms |
| Keystroke to echo, 40 keys, median (tab / Node client) | 9.3-9.6 / 1.3 ms | 9.4-10.2 / 1.3 ms |

The backend's CPU stayed where it was (about 500 ms for the `cat`): its cost is reading the pty and decoding UTF-8,
not the sends.

**Looked at and left in round 12:**

- **The tab's time per keystroke.** The backend answers a key in 1.3 ms; in the tab it is about 9.5 ms from send to
  echo, because the main thread spends 7.4 ms a key, under 1 ms of it script. The rest is headless Chromium painting
  in software and the cursor's blink animation, which runs while the owner types (round 2). A browser with a GPU
  paints this on the GPU.
- **Firefox's processes.** A Linux app the owner installs, Firefox among them, runs with its own defaults. Firefox
  reads machine-wide settings from `/etc/firefox/policies/policies.json` ([Mozilla](https://support.mozilla.org/kb/customizing-firefox-using-policiesjson)),
  and `dom.ipc.processCount.webIsolated` (4 by default) caps its content processes per site
  ([bug 1727158](https://bugzilla.mozilla.org/show_bug.cgi?id=1727158)). Reports on what lowering it saves disagree,
  and Firefox's download was refused here, so nothing was measured and nothing shipped.
