---
summary: Rounds 31-35 of the performance sweep in full. Round 31 had Paint's undo keep only the rectangle each edit changed (30 strokes on a 4000x3000 photo grew the tab 1,460 to 88 MiB). Round 32 had Files' content search read small files in batches and rule most out unread (a search matching nothing 1,331 to 192 ms). Rounds 33 and 34 had zip archives stream instead of being built and inflated in memory (the backend's peak growth +870..1,824 to +29..76 MiB compressing, +695..1,152 to +17..53 MiB extracting, /health's worst stall 6 s and 2.2 s to about 10 ms). Round 35 attributed the first load and left it.
updated: 2026-11-25
---

# The performance sweep, rounds 31-35

The sweep's method and the list of rounds are on [research-performance-sweep.md](research-performance-sweep.md).
Rounds 26-30 are on [research-performance-sweep-6.md](research-performance-sweep-6.md), rounds 36-40 on
[research-performance-sweep-8.md](research-performance-sweep-8.md).

## Round 31 (2026-11-24): Paint's undo keeps what each edit changed

**The bar, written before measuring:** with a 4000×3000 photo open in Paint and 30 brush strokes, ship only if the
renderer's growth over the strokes falls at least 80%, every undo and redo restores the exact pixels (strokes, fills,
clears, crops), and a stroke's end costs no more than 20 ms more main thread than before.

**What it was.** Every undo step was a whole-canvas `ImageData`: 48 MB a stroke on that photo, 1.4 GB for 30.

**What changed** (`6676760`). A step holds the rectangle its edit changed (`apps/add-ons/paint/src/lib/patches.ts`).
A stroke is cut to its bounding box (its points, half the line width and a pixel of antialiasing); a fill, text, a
shape or a crop to the rectangle a comparison with the canvas finds. Undo keeps the same rectangle of the present for
redo; an undone crop keeps the whole canvas. An edit that changed nothing is no step, and the steps hold at most
256 MB, oldest dropped first.

| 30 strokes, 4000×3000 | Before | After |
|---|---:|---:|
| The renderer's growth | 1,460 MiB | 88 MiB |
| A stroke's end, main thread | 1 ms | 8 ms |
| Undo all and redo all, exact pixels | 60 of 60 | 60 of 60 |

The first version compared the whole canvas at each stroke's end (70 ms); taking the stroke's box from its points
brought it to 8.

## Round 32 (2026-11-24): the content search rules files out unread

**The bar, written after the baseline and before any change:** over 5,668 source files (69 MB), ship only if a search
that matches nothing takes at least 40% less wall time and backend CPU (median of three), the answers of a matching
and a non-matching search are the same bytes, and /health stays under 50 ms during it.

**What it was.** Each file was stat'ed and read through `fs/promises` (two trips through the thread pool), decoded
as UTF-8 and lowercased whole to look for the needle.

**What changed** (`92bdf0f`). Files are read synchronously, 64 between yields, the binary sniff is a native `indexOf`,
and for an ASCII query a case-insensitive regex over the bytes read as latin1 rules a file out before any decoding; a
file it keeps gets the exact test. The two differ only for a letter whose lowercase is ASCII but whose bytes are not
(the Kelvin sign).

| 5,668 files, median of three | Before | After |
|---|---:|---:|
| A search matching nothing, wall / CPU | 1,331 / 1,250 ms | 192 / 180 ms |
| A search stopping at 100 hits | 202 ms | 36 ms |

## Round 33 (2026-11-24): compressing streams the archive

**The bar, written before measuring:** compressing a ~250 MB folder, ship only if the backend's peak growth falls at
least 60%, the wall time grows no more than 20%, /health stays under 100 ms, and the archive lists and extracts to
the same files.

**What it was.** Every selected file read into memory and fflate's `zip` building the whole archive beside them: a
231 MB folder took the backend to a 1.9 GB peak, left it at 1.1 GB, and stalled /health for up to 6 s.

**What changed** (`4571d85`). The selection is listed first, caps checked before anything is written; then
`ZipWriter` (`apps/backend/src/modules/archive/zip-writer.ts`) writes as it goes. Files up to 2 MB are read and
deflated by zlib four ahead in its thread pool and written in order; larger ones stream through alone; each entry has
a data descriptor and the central directory comes last. Plain zip: the caps (10,000 entries, 512 MB) stay under
zip64's limits.

| 231 MB, 5,733 files, three runs against two | Before | After |
|---|---:|---:|
| Wall | 6.9-8.3 s | 4.8-5.1 s |
| Backend CPU | 20-25 s | 9-10 s |
| Peak growth | +870 to +1,824 MiB | +29 to +76 MiB |
| /health's worst | 4.7-6.2 s | 7-11 ms |

Python's `zipfile` and `unzip -t` read all entries back byte for byte.

## Round 34 (2026-11-24): extracting streams each entry

**The bar, written before measuring:** extracting a 181 MB zip of 5,733 files (231 MB unpacked), ship only if the
peak growth falls at least 60%, the wall time grows no more than 20%, /health stays under 100 ms, every file comes out
byte for byte, and the archive tests (zip bombs, traversal, symlinks) still pass.

**What changed** (`773fc53`, then `95d0271`, `33c5590` and `6519ebc`). `zip-reader.ts` reads the tail and the central
directory off disk; the declared counts and sizes meet the same caps as before (absolute, and as a ratio of the
archive's bytes) before anything is inflated, every name is jailed before anything is written, and each entry streams
through zlib's inflate into a staging folder, four at a time, its actual size and the running total checked as it
comes. The staging folder is merged into the destination as tar's is. Listing reads only the directory. The three
follow-ups fixed a lint error the first commit carried (a failure kept as `unknown`); ESLint now runs before every
commit.

| 181 MB zip, three runs against two | Before | After |
|---|---:|---:|
| Wall | 6.6-7.4 s | 6.3-6.8 s |
| Backend CPU | 13-14 s | 11 s |
| Peak growth | +695 to +1,152 MiB | +17 to +53 MiB |
| /health's worst | 2.1-2.2 s | 6-10 ms |

## Round 35 (2026-11-24): the first load, attributed; measured, not built

What the first load's JavaScript is made of: react-dom 175 KiB, Base UI 149, axios 49, the desktop's own code 228.
Nothing above about 10 KiB could leave the first load without losing something it shows, so nothing changed.
