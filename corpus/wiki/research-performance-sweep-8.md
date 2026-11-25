---
summary: Rounds 36-40 of the performance sweep in full. Round 36 measured a batched synchronous folder copy at cp -a's pace (fs.cp's CPU 4.8 to 2.1 s, -56% against a -60% bar the kernel's file creation put out of reach) and filed it as brief 121. Round 37 found deleting a folder already fine. Round 38 had System Monitor read /proc synchronously (15.9 to 1.6 ms of backend CPU a poll). Round 39 had Files list a folder once per batch and keep six requests in flight (a 200-file drop into a 20,000-file folder 25 to 1 s, and a 2,000-file Delete that Chromium refused 275-417 of now refused none). Round 40 found a large listing at the system-call floor.
updated: 2026-11-25
---

# The performance sweep, rounds 36-40

The sweep's method and the list of rounds are on [research-performance-sweep.md](research-performance-sweep.md).
Rounds 31-35 are on [research-performance-sweep-7.md](research-performance-sweep-7.md), rounds 41-45 on
[research-performance-sweep-9.md](research-performance-sweep-9.md).

## Round 36 (2026-11-24): copying a folder; measured, filed as brief 121

**The bar, written before measuring:** copying 5,668 files (69 MB), ship only if the wall time and backend CPU fall at
least 60% (median of three), the copy is the same tree as `fs.cp` makes (bytes, file and folder modes, links and their
targets), and /health stays under 100 ms.

**What was tried.** `copyTree`, a synchronous walk with `copyFileSync`, `mkdirSync` and `readdirSync`, files over
1 MB through libuv's pool, a yield every 64 entries, and a folder's mode set after its contents, as `fs.cp` sets it.

| 18 runs a build, six interleaved sets | `fs.cp` | `copyTree` | `cp -a` |
|---|---:|---:|---:|
| Backend CPU, median (range) | 4.8 s (2.9-5.2) | 2.1 s (1.6-2.5) | 2.0 s (1.7-2.4) |

`-56%`, under the bar. A profile put 1.79 s in `copyFile` and 0.38 s in `mkdir`, all kernel time: creating a file on
this VM's disk costs about 350 µs, and `cp -a` pays the same. That floor sits at 42% of `fs.cp`'s time, so no
user-space change could reach -60%; the user-space overhead fell from about 2.7 s to 0.1 s. A flush between runs
(`sync`, 3 s) did not move it, and one fast disk phase seen standalone ran `copyTree` in 0.23 s against `fs.cp`'s
3.9 s. On Node 24, the image's, the picture is the same (`fs.cp` 4.7-4.9 s with 3.7-3.9 s of kernel time from its
extra stats, `copyTree` 2.1-2.2 s, `cp -a` 2.0-2.1 s).

A bug found on the way: setting a folder's mode before copying into it fails for a read-only folder (0555) under any
user but root (EACCES). The tests run as root, so the spec gained a 0555 folder, and was run as `nobody`: the early
order failed, the late one passed. The bar was missed, so nothing shipped; brief 121 asks for the call.

## Round 37 (2026-11-24): deleting a folder; measured, not built

5,668 files on Node 24: `fs.promises.rm` recursive 431-465 ms and async; `rmSync` 583-625 ms and a synchronous walk
640-717 ms, both blocking the loop. Emptying the Trash uses the same `fs.rm` per item. Also measured and fine: the
backend starts in 483-521 ms to /health, and sign-in's scrypt is async.

## Round 38 (2026-11-24): System Monitor's process list

**The bar, written after the baseline and before any change:** CPU a call down at least 60% (median of three
interleaved batches of 300), the same rows, and a 1,000-process table holding the event loop at most 20 ms.

**What it was.** Two awaited calls per process (the `stat` file, and the folder's owner), under `Promise.all`:
15.6-16.5 ms of the backend's CPU a poll for 87 processes, every 1.5 s while System Monitor is open.

**What changed** (`916f73f`; `a1f199a` before it carries only the version bump, the source left unstaged).
`readFileSync` and `statSync`, 256 processes between yields.

| | Before | After |
|---|---:|---:|
| CPU a poll, 87 processes | 15.6-16.5 ms | 1.4-1.8 ms |
| A poll of 1,089 processes | 147-152 ms | 17-18 ms |
| /health's worst during those polls | 70-84 ms | 11 ms |

Rows taken from both builds at once (two ports) matched: the same pid, uid and name for all 88, memory equal but for
the two live backends.

## Round 39 (2026-11-24): a batch in Files lists the folder once

**The bar, written after the baseline and before any change:** 200 small files dropped into a 20,000-file folder; the
time until the folder shows them and the backend's CPU down at least 70% (median of three, a fresh tab each), all
200 on disk, the folder listed at most three times, a single upload still refreshing, a failure still named.

**What it was.** One mutation per file, each invalidating the folder's listing when it landed. The query layer
cancels a fetch in flight, but the client never wired the abort through, so every listing ran to the end on the
server: 200 listings of 20,000 entries.

**What changed** (`20e64a6`). A drop, Delete on a selection and Paste are one mutation each
(`apps/add-ons/file-manager/src/queries/filesQueries.ts`): every item on its own request, each one's outcome kept,
and the folders listed once when all have settled (a move: both ends of every move, each folder once).

| 200 files into 20,000, three interleaved | Before | After |
|---|---:|---:|
| Shown, wall | 24.7-26.3 s | 0.8-1.0 s |
| Backend CPU | 27.8-29.2 s | 0.61-0.78 s |
| Listings of the folder | 200 | 1 |

**A bug it exposed.** The batch started every request at once. For Select All and Delete on 2,000 files, Chromium
refused 275-417 of them (`net::ERR_INSUFFICIENT_RESOURCES`), and Files said it could not delete them; the backend
itself took 500 concurrent trashes without a failure. `settleEach` (`lib/settleEach.ts`) runs six at a time,
Chromium's connections to one host over HTTP/1.1: the 2,000 went to the Trash in 3.1 s, none refused, the folder
listed once instead of 1,726 times.

## Round 40 (2026-11-25): a large folder's listing; measured, not built

A 20,000-entry listing costs 169-181 ms of CPU and sends 4,178 KiB of JSON (208 bytes an entry). Over 45 listings:
`lstat` 106 ms a listing (5.3 µs a file, the system call), `JSON.stringify` 15 ms, GC 8 ms, everything else 2-3 ms.
It is at the system-call floor. Caddy compresses the JSON in the deploy (`infrastructure/Caddyfile.example`), and the
kit's query client does not refetch on focus.
