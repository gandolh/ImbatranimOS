---
summary: Rounds 11-15 of the 2026-11-23 performance sweep in full. Round 11 found the Linux window relay and the tab's frame drawing already lean (measured, left), and made Files fast on large folders - a 20,000-entry listing 630 to 165 ms and a folder's size 820 to 70 ms - by stating entries synchronously in batches instead of one promise each. Round 12 joins a Terminal's flowing output into one WebSocket frame per 5 ms - a 25 MB cat 19,854 frames to 249, 2.7 to 2.1 s - with keystroke echo unchanged. Round 13 found no leak when apps open and close and stopped a focus change re-rendering the whole desktop - 194 to 88 components a click, script 10.0 to 5.6 ms. Round 14 halved a large folder's scroll in the File Manager - 108 to 51 ms a wheel step - by memoising its sort and its rows. Round 15 made a static Marketplace app keep only what it serves - Accessories' build directory 140 to 8 MB.
updated: 2026-11-24
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

## Round 13 (2026-11-24): what the desktop does when focus moves, and what was already lean

**Looked for first, and found lean:**

- **Leaks in the tab.** Each app opened and closed six times (Terminal, File Manager and Paint twenty), with a forced
  garbage collection before each reading: no DOM nodes, listeners or documents left behind by any app. A heap
  snapshot diff over ten Terminal cycles: 1.4 MiB of the growth is V8's optimized code, which it flushes, and the
  rest is the browser's own timing entries.
- **The Wayland host's memory.** 6.0 MiB RSS for a session with no window, 10.2 MiB with foot open and scrolled,
  6.3 MiB after foot closes. A smithay core with the tab drawing is already the light shape a compositor can take.
- **SQLite's syncs.** better-sqlite3 is built with `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`, so the WAL database already
  runs at `synchronous=NORMAL`: 200 sticky-note saves made 3 `fsync` calls (`strace -c`). Nothing to change.
- **Synchronous calls in the backend's request paths.** One-time reads at start, and `/proc` reads, only.
- **The Code Editor.** Opening it fetches 922 KiB (Monaco's `editor.api`, 592 KiB, and its contributions, 278 KiB)
  for 341 ms of main thread. Inline completions are 240 KiB of the contributions (raw) and nothing in the OS
  provides any, but leaving them out means keeping a hand-made list of Monaco's contributions through every Monaco
  upgrade, so they stay.

**Focus between windows.** With six windows open, a click on a taskbar button cost 38 ms of main thread and rendered
194 components. Most were the desktop's: `App` selected the whole `windows` array only to schedule its debounced
layout write, so every focus change, open and close re-rendered everything under it, the 16 desktop icons and their
framer-motion wrappers (which measure themselves) included.

- **The layout write is scheduled from a store subscription,** with the same 500 ms debounce and the same first
  write on mount. A move, a reload and the windows coming back were checked on the new build.
- **A window's app stays the same element while only its frame changes,** so the two windows whose focus flips no
  longer re-render their apps.

| Six windows, a taskbar click, median of 3 | Before | After |
|---|---:|---:|
| Components rendered | 194 | 88 |
| Script / layouts | 10.0 ms / 3.9 | 5.6 ms / 2.9 |
| Main thread | 38.4 ms | 31.2 ms |
| Main thread at 4× CPU | 164.6 ms | 136.2 ms |

The rest of a click's main thread is the browser painting the two windows whose border and shadow change (about
20 ms in headless Chromium's software raster); no window uses a backdrop blur.

## Round 14 (2026-11-24): a large folder in the File Manager

**Looked at first:** the Start menu, which every launch goes through: 31 ms of main thread to open and 10 ms a
keystroke of search. Nothing to cut.

**Scrolling a 20,000-file folder** cost 105 to 112 ms of main thread a wheel step, 82 to 91 ms of it script, and
rendered 2,981 components a step with 24 rows in the DOM. TanStack's virtualizer re-renders the component that holds
it on every scroll frame, and that is the File Manager itself. Each of those renders filtered and sorted the whole
folder again (`filterHidden`, `sortEntries`, the selected entries), and re-rendered every row on screen, each five
tooltip-wrapped buttons and an icon.

- **The filter, the sort and the selected entries are memoised** in `useOrderedEntries`, a hook of their own so the
  React Compiler's lint can check the memoisation (inside the 1,490-line component it could not).
- **A row is a memoised `FileRow`** that reads its handlers through a ref the list keeps current, so a row that stays
  on screen keeps its props and only the rows coming into view render. The rename field's text goes only to the row
  being renamed.

| A 20,000-file folder, median of 3 | Before | After |
|---|---:|---:|
| A wheel step: main thread / script | 108 / 87 ms | 51 / 33 ms |
| A wheel step: components rendered | 2,981 | 830 |
| A wheel step: garbage collection (20 steps) | 258 ms | 62 ms |
| Opening the folder: main thread | about 290 ms | about 210 ms |

Click, Ctrl+click, the arrow keys, F2 with typing and Escape, the context menu and the hover actions (with the
download link) behaved the same on both builds. What a step still costs is mostly React mounting the rows that come
into view. Moving the virtualizer out of the File Manager into the list would also spare the window's toolbar and
tree on each frame; it was left, because the keyboard navigation reaches the virtualizer from the root. The process
table and the log viewer already memoise their filtering.

## Round 15 (2026-11-24): what an installed Marketplace app keeps on disk

The OS builds an imbatranim-apps suite on the box: it fetches the pinned commit into a new directory under
`~/.imbatranim/apps`, runs the descriptor's install and build steps there, and serves the build's output. The
directory stayed whole afterwards. Accessories (Todo and Bookmarks) at the catalog's commit, built by hand the way the
OS builds it: `npm ci --workspace=accessories` in 4 s and `npm run build:os` in 1.5 s, leaving 132 MB of
`node_modules` (5,501 files: lucide-react 40 MB, TypeScript 24 MB, rolldown 20 MB, Vite 13 MB) beside a 144 KB
output. A static app reads none of it again: the desktop is served the output, and every install, update and rebuild
fetches into a new directory.

- **After a static app's build passes its checks, `removeDependencies` deletes every `node_modules` folder in its
  build directory.** It never touches the output or a folder on the way to it, does not enter `.git`, and follows no
  symlink. An app with a server runs from its build directory and keeps them. The install log says what went.
- Installed through the backend from the real catalog: the build directory 140 MB and about 6,100 files before,
  8.0 MB and 641 files after; Todo opens and runs from it. The e2e test now checks that the static fixture's build
  keeps its output and loses its `node_modules`, and fails on the old code.

The shared npm cache (`~/.imbatranim/apps/.cache/npm`, 30 MB after this one install) stays, so a rebuild downloads
nothing again. The clone's sources (8 MB with `.git`) stay too: they are small, and nothing measured needed them gone.
